"use client";

import { useEffect, useState } from "react";
import { subscribeOrders } from "@/services/orders.service";
import { formatCurrency, cn } from "@/lib/utils";
import type { Order } from "@/types";
import { StatsGridSkeleton } from "@/components/ui/loading-skeletons";
import { Edit, Trash2 } from "lucide-react";
import { getFirestoreDb } from "@/lib/firebase/config";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";

export default function CreditSalesPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filterType, setFilterType] = useState<"all" | "day" | "this_month" | "prev_month">("all");
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

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
      // Merge local storage credits if present
      let localMapped: Order[] = [];
      try {
        const localCredits = JSON.parse(localStorage.getItem("pos_local_credits") || "[]");
        localMapped = localCredits.map((lc: any) => ({
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

      setOrders([...localMapped, ...list]);
      setLoading(false);
    }, startIso, endIso);
    return () => unsub();
  }, [filterType, selectedDate]);

  // Filter orders that were settled as "credit"
  const creditOrders = orders.filter(
    (o) => o.paymentStatus === ("credit" as any) || o.paymentMethod === ("credit" as any)
  );

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
      
      // Update local state directly
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
          return {
            ...lc,
            customerName: editName.trim(),
            creditName: editName.trim(),
            total: editTotal,
          };
        }
        return lc;
      });
      localStorage.setItem("pos_local_credits", JSON.stringify(updatedLocalCredits));

      // Also update pos_pending_orders in local storage
      const localPending = JSON.parse(localStorage.getItem("pos_pending_orders") || "[]");
      const updatedLocalPending = localPending.map((o: any) => {
        if (o.id === editingOrder.id) {
          return {
            ...o,
            customerName: editName.trim(),
            creditName: editName.trim(),
            customerPhone: editPhone.trim(),
            total: editTotal,
          };
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
        // Document might not exist in credits collection if it was only locally marked
        console.warn("Could not update document in credits collection", e);
      }

      window.dispatchEvent(new CustomEvent("rush-pos-pending"));
      
      // Update local state directly
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id === editingOrder.id) {
            return {
              ...o,
              customerName: editName.trim(),
              creditName: editName.trim(),
              customerPhone: editPhone.trim(),
              total: editTotal,
            } as Order;
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
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr className="text-left font-bold text-stone-700">
              <th className="p-4">Order #</th>
              <th className="p-4">Customer / Debtor</th>
              <th className="p-4">Phone</th>
              <th className="p-4">Items</th>
              <th className="p-4 text-right">Amount</th>
              <th className="p-4">Date</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {creditOrders.map((o) => (
              <tr
                key={o.id}
                className="border-b last:border-0 hover:bg-stone-50/50 transition"
              >
                <td className="p-4 font-black text-primary">
                  #{o.dailyOrderNumber ?? o.orderNumber}
                </td>
                <td className="p-4 font-bold text-stone-900">
                  {(o as any).creditName || o.customerName || "—"}
                </td>
                <td className="p-4 text-stone-600">
                  {o.customerPhone || "—"}
                </td>
                <td className="p-4 text-stone-600 max-w-[200px]">
                  <span className="truncate block">
                    {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                  </span>
                </td>
                <td className="p-4 text-right font-black text-red-600">
                  {formatCurrency(o.total)}
                </td>
                <td className="p-4 text-stone-500 text-xs">
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
                    <button
                      type="button"
                      onClick={() => handleStartEdit(o)}
                      className="p-1.5 rounded-lg border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100 transition active:scale-95"
                      title="Edit Credit Details"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
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
                  with the "Credit Sale" option in Kitchen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
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
