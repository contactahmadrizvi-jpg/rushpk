"use client";

import { useEffect, useState } from "react";
import { subscribeOrders } from "@/services/orders.service";
import { formatCurrency, cn } from "@/lib/utils";
import type { Order } from "@/types";
import { StatsGridSkeleton } from "@/components/ui/loading-skeletons";
import { Edit, Trash2, Eye, X } from "lucide-react";
import { getFirestoreDb } from "@/lib/firebase/config";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";

/** Formats a unique, human-readable order reference that includes the date.
 *  e.g. "07-Jun #3"  — so the same dailyOrderNumber on different days is never identical. */
function formatOrderRef(o: Order): string {
  const d = new Date(o.createdAt);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-PK", { month: "short" });
  const num = o.dailyOrderNumber ?? o.orderNumber;
  return `${day}-${month} #${num}`;
}

export default function CreditSalesPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filterType, setFilterType] = useState<"all" | "day" | "this_month" | "prev_month">("all");
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  // View Details modal state
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);

  // Edit State
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editTotal, setEditTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    let startIso: string | undefined = undefined;
    let endIso: string | undefined = undefined;

    if (filterType === "day") {
      const start = new Date(`${selectedDate}T00:00:00`);
      const end = new Date(`${selectedDate}T23:59:59.999`);
      startIso = start.toISOString();
      endIso = end.toISOString();
    } else if (filterType === "this_month") {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      startIso = start.toISOString();
      endIso = end.toISOString();
    } else if (filterType === "prev_month") {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      startIso = start.toISOString();
      endIso = end.toISOString();
    }

    const unsub = subscribeOrders((list) => {
      // Merge local storage credits — but only include ones NOT already synced to Firestore
      // (prevents double-showing once a local order gets synced)
      let localMapped: Order[] = [];
      try {
        const localCredits = JSON.parse(localStorage.getItem("pos_local_credits") || "[]");
        const syncedIds = new Set(list.map((o) => o.id));
        localMapped = localCredits
          .filter((lc: any) => !syncedIds.has(lc.id)) // skip if already in Firestore
          .map((lc: any) => ({
            ...lc,
            dailyOrderNumber: lc.orderNumber ?? lc.dailyOrderNumber ?? 999,
            paymentStatus: "credit",
            paymentMethod: "credit",
            createdAt: lc.createdAt || new Date().toISOString(),
          }));

        if (startIso && endIso) {
          localMapped = localMapped.filter(
            (lc) => lc.createdAt >= startIso! && lc.createdAt <= endIso!
          );
        }
      } catch (e) {
        console.error("Failed to parse local credits", e);
      }

      // Merge and deduplicate by ID as a final safety net
      const merged = [...localMapped, ...list];
      const seen = new Set<string>();
      const deduped = merged.filter((o) => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      });

      setOrders(deduped);
      setLoading(false);
    }, startIso, endIso);
    return () => unsub();
  }, [filterType, selectedDate]);

  // Filter orders that were settled as "credit"
  const creditOrders = orders
    .filter((o) => o.paymentStatus === ("credit" as any) || o.paymentMethod === ("credit" as any))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalCredit = creditOrders.reduce((s, o) => s + o.total, 0);

  const handleDelete = async (orderId: string) => {
    if (!confirm("Are you sure you want to delete this credit purchase?")) return;

    try {
      // 1. Delete from local storage pos_local_credits if present
      const localCredits = JSON.parse(localStorage.getItem("pos_local_credits") || "[]");
      const filteredCredits = localCredits.filter((lc: any) => lc.id !== orderId);
      localStorage.setItem("pos_local_credits", JSON.stringify(filteredCredits));

      // 2. Also check pos_pending_orders in local storage
      const localPending = JSON.parse(localStorage.getItem("pos_pending_orders") || "[]");
      const filteredPending = localPending.filter((o: any) => o.id !== orderId);
      localStorage.setItem("pos_pending_orders", JSON.stringify(filteredPending));

      // 3. Delete from Firebase
      const db = getFirestoreDb();
      await deleteDoc(doc(db, "orders", orderId));
      await deleteDoc(doc(db, "credits", orderId));

      window.dispatchEvent(new CustomEvent("rush-pos-pending"));
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err) {
      console.error(err);
      alert("Failed to delete credit purchase");
    }
  };

  const handleStartEdit = (o: Order) => {
    setEditingOrder(o);
    setEditName((o as any).creditName || o.customerName || "");
    setEditPhone(o.customerPhone || "");
    setEditTotal(o.total);
  };

  const handleSaveEdit = async () => {
    if (!editingOrder) return;
    try {
      // 1. Update in local storage if present
      const localCredits = JSON.parse(localStorage.getItem("pos_local_credits") || "[]");
      const updatedLocalCredits = localCredits.map((lc: any) => {
        if (lc.id === editingOrder.id) {
          return { ...lc, customerName: editName.trim(), creditName: editName.trim(), total: editTotal };
        }
        return lc;
      });
      localStorage.setItem("pos_local_credits", JSON.stringify(updatedLocalCredits));

      // Also update pos_pending_orders in local storage
      const localPending = JSON.parse(localStorage.getItem("pos_pending_orders") || "[]");
      const updatedLocalPending = localPending.map((o: any) => {
        if (o.id === editingOrder.id) {
          return { ...o, customerName: editName.trim(), creditName: editName.trim(), customerPhone: editPhone.trim(), total: editTotal };
        }
        return o;
      });
      localStorage.setItem("pos_pending_orders", JSON.stringify(updatedLocalPending));

      // 2. Update Firebase
      const db = getFirestoreDb();
      const orderRef = doc(db, "orders", editingOrder.id);
      await updateDoc(orderRef, {
        customerName: editName.trim(),
        creditName: editName.trim(),
        customerPhone: editPhone.trim(),
        total: editTotal,
      });

      try {
        const creditRef = doc(db, "credits", editingOrder.id);
        await updateDoc(creditRef, {
          customerName: editName.trim(),
          customerPhone: editPhone.trim(),
          total: editTotal,
        });
      } catch (e) {
        console.warn("Could not update document in credits collection", e);
      }

      window.dispatchEvent(new CustomEvent("rush-pos-pending"));

      setOrders((prev) =>
        prev.map((o) => {
          if (o.id === editingOrder.id) {
            return { ...o, customerName: editName.trim(), creditName: editName.trim(), customerPhone: editPhone.trim(), total: editTotal } as Order;
          }
          return o;
        })
      );

      setEditingOrder(null);
    } catch (err) {
      console.error(err);
      alert("Failed to update credit purchase details");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Credit Sales</h1>
        <div className="mt-6">
          <StatsGridSkeleton count={2} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Credit Sales</h1>
          <p className="text-sm text-muted-foreground">
            Orders settled on credit. Track outstanding amounts owed by customers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex gap-2 rounded-xl bg-stone-100 p-1 border border-stone-200/40">
            {(["all", "day", "this_month", "prev_month"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className={cn(
                  "rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all",
                  filterType === t
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-800"
                )}
              >
                {t === "all" ? "Show All" : t === "day" ? "Single Day" : t === "this_month" ? "This Month" : "Prev Month"}
              </button>
            ))}
          </div>

          {filterType === "day" && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Total Credit Outstanding
          </p>
          <p className="mt-2 text-2xl font-black text-red-600">
            {formatCurrency(totalCredit)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Credit Orders
          </p>
          <p className="mt-2 text-2xl font-black text-stone-900">
            {creditOrders.length}
          </p>
        </div>
      </div>

      {/* Credit Orders Table */}
      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr className="text-left font-bold text-stone-700">
              <th className="p-4">Order Ref</th>
              <th className="p-4">Customer / Debtor</th>
              <th className="p-4">Phone</th>
              <th className="p-4">Items</th>
              <th className="p-4 text-right">Amount</th>
              <th className="p-4">Date & Time</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {creditOrders.map((o) => (
              <tr
                key={o.id}
                className="border-b last:border-0 hover:bg-stone-50/50 transition"
              >
                {/* Unique order reference: date + daily number */}
                <td className="p-4 font-black text-primary whitespace-nowrap">
                  {formatOrderRef(o)}
                </td>
                <td className="p-4 font-bold text-stone-900">
                  {(o as any).creditName || o.customerName || "—"}
                </td>
                <td className="p-4 text-stone-600">
                  {o.customerPhone || "—"}
                </td>
                <td className="p-4 text-stone-600 max-w-[200px]">
                  <span className="truncate block text-xs">
                    {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                  </span>
                </td>
                <td className="p-4 text-right font-black text-red-600 whitespace-nowrap">
                  {formatCurrency(o.total)}
                </td>
                <td className="p-4 text-stone-500 text-xs whitespace-nowrap">
                  {new Date(o.createdAt).toLocaleDateString("en-PK", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2">
                    {/* View Details */}
                    <button
                      type="button"
                      onClick={() => setViewingOrder(o)}
                      className="p-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition active:scale-95"
                      title="View Full Details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => handleStartEdit(o)}
                      className="p-1.5 rounded-lg border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100 transition active:scale-95"
                      title="Edit Credit Details"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDelete(o.id)}
                      className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition active:scale-95"
                      title="Delete Credit Sale"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {creditOrders.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No credit sales found. Credit orders will appear here when settled
                  with the &quot;Credit Sale&quot; option in Kitchen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── View Details Modal ── */}
      {viewingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setViewingOrder(null); }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-stone-900 text-white">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Credit Sale Details</p>
                <h3 className="text-lg font-black">{formatOrderRef(viewingOrder)}</h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingOrder(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh] sm:max-h-[75vh]">
              {/* Customer Info */}
              <div className="rounded-xl border border-stone-100 bg-stone-50 p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-3">Customer Info</p>
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-stone-500">Name</span>
                  <span className="font-black text-stone-900">
                    {(viewingOrder as any).creditName || viewingOrder.customerName || "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-stone-500">Phone</span>
                  <span className="font-semibold text-stone-700">
                    {viewingOrder.customerPhone || "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-stone-500">Order Type</span>
                  <span className="font-semibold text-stone-700 capitalize">
                    {viewingOrder.type?.replace("_", " ") || "—"}
                  </span>
                </div>
                {viewingOrder.tableNumber != null && (
                  <div className="flex justify-between text-sm">
                    <span className="font-bold text-stone-500">Table</span>
                    <span className="font-semibold text-stone-700">#{viewingOrder.tableNumber}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-stone-500">Date & Time</span>
                  <span className="font-semibold text-stone-700 text-xs">
                    {new Date(viewingOrder.createdAt).toLocaleDateString("en-PK", {
                      day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>

              {/* Delivery Address (if available) */}
              {viewingOrder.deliveryAddress && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-3">Delivery Address</p>
                  {viewingOrder.deliveryAddress.street && (
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-blue-400">Street</span>
                      <span className="font-semibold text-stone-700 text-right max-w-[60%]">{viewingOrder.deliveryAddress.street}</span>
                    </div>
                  )}
                  {viewingOrder.deliveryAddress.area && (
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-blue-400">Area</span>
                      <span className="font-semibold text-stone-700">{viewingOrder.deliveryAddress.area}</span>
                    </div>
                  )}
                  {viewingOrder.deliveryAddress.city && (
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-blue-400">City</span>
                      <span className="font-semibold text-stone-700">{viewingOrder.deliveryAddress.city}</span>
                    </div>
                  )}
                  {viewingOrder.deliveryAddress.phone && viewingOrder.deliveryAddress.phone !== viewingOrder.customerPhone && (
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-blue-400">Alt Phone</span>
                      <span className="font-semibold text-stone-700">{viewingOrder.deliveryAddress.phone}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Delivery Notes */}
              {viewingOrder.deliveryNotes && (
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-1">Delivery Notes</p>
                  <p className="text-sm text-stone-700 font-medium">{viewingOrder.deliveryNotes}</p>
                </div>
              )}

              {/* Order Items */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-3">Order Items</p>
                <div className="rounded-xl border border-stone-100 overflow-hidden">
                  {viewingOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between px-4 py-3 border-b last:border-0 bg-white hover:bg-stone-50/50 transition"
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="font-bold text-stone-900 text-sm leading-tight">
                          <span className="text-primary font-black">{item.quantity}×</span>{" "}
                          {item.name}
                        </p>
                        {item.customization?.variantName && (
                          <p className="text-xs text-stone-500 mt-0.5 font-medium">
                            Size: {item.customization.variantName}
                          </p>
                        )}
                        {item.customization?.addonNames && item.customization.addonNames.length > 0 && (
                          <p className="text-xs text-stone-500 mt-0.5">
                            + {item.customization.addonNames.join(", ")}
                          </p>
                        )}
                        {item.customization?.extraCheese && (
                          <p className="text-xs text-amber-600 mt-0.5 font-medium">+ Extra Cheese</p>
                        )}
                        {item.customization?.spiceLevel && (
                          <p className="text-xs text-red-500 mt-0.5 font-medium">🌶 {item.customization.spiceLevel}</p>
                        )}
                        {item.customization?.notes && (
                          <p className="text-xs text-stone-400 mt-0.5 italic">{item.customization.notes}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-stone-900 text-sm">{formatCurrency(item.subtotal)}</p>
                        {item.quantity > 1 && (
                          <p className="text-[10px] text-stone-400">{formatCurrency(item.price)} ea</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price Breakdown */}
              <div className="rounded-xl border border-stone-100 bg-stone-50 p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-3">Price Breakdown</p>
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-stone-500">Subtotal</span>
                  <span className="font-semibold text-stone-700">{formatCurrency(viewingOrder.subtotal)}</span>
                </div>
                {viewingOrder.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="font-bold text-green-600">Discount</span>
                    <span className="font-semibold text-green-600">-{formatCurrency(viewingOrder.discount)}</span>
                  </div>
                )}
                {viewingOrder.tax > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="font-bold text-stone-500">Tax</span>
                    <span className="font-semibold text-stone-700">{formatCurrency(viewingOrder.tax)}</span>
                  </div>
                )}
                {viewingOrder.deliveryCharge > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="font-bold text-stone-500">Delivery Charge</span>
                    <span className="font-semibold text-stone-700">{formatCurrency(viewingOrder.deliveryCharge)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-stone-200">
                  <span className="font-black text-stone-900 text-base">Total Due (Credit)</span>
                  <span className="font-black text-red-600 text-lg">{formatCurrency(viewingOrder.total)}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t bg-stone-50">
              <button
                type="button"
                onClick={() => { setViewingOrder(null); handleStartEdit(viewingOrder); }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-stone-700 bg-white border border-stone-200 hover:bg-stone-100 rounded-lg transition"
              >
                <Edit className="h-4 w-4" /> Edit
              </button>
              <button
                type="button"
                onClick={() => setViewingOrder(null)}
                className="px-5 py-2 text-sm font-bold text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-stone-900">Edit Credit Sale</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase">Debtor / Customer Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full h-10 px-3 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-primary text-sm font-semibold text-stone-800"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-500 uppercase">Phone Number</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="mt-1 w-full h-10 px-3 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-primary text-sm font-semibold text-stone-800"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-500 uppercase">Credit Amount (Rs.)</label>
                <input
                  type="number"
                  value={editTotal}
                  onChange={(e) => setEditTotal(Number(e.target.value))}
                  className="mt-1 w-full h-10 px-3 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-primary text-sm font-semibold text-stone-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="px-4 py-2 text-sm font-semibold text-stone-500 hover:text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/95 rounded-lg shadow-sm transition"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
