"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn, formatDate, parseDate } from "@/lib/utils";
import { subscribeKitchenOrders, updateOrderStatus } from "@/services/orders.service";
import { getPendingKitchenOrders } from "@/lib/pos-instant";
import { playOrderSound, printReceipt } from "@/lib/print";
import type { Order, KitchenStatus } from "@/types";
import { RESTAURANT } from "@/constants";
import { KitchenColumnsSkeleton } from "@/components/ui/loading-skeletons";
import { doc, updateDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/config";
import { Minus, Plus, Edit, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const prevCount = useRef(0);

  // Editing order modal state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editedItems, setEditedItems] = useState<Order["items"]>([]);

  useEffect(() => {
    let remote: Order[] = [];

    const apply = () => {
      const pending = getPendingKitchenOrders();
      const syncedNums = new Set(remote.map((o) => o.dailyOrderNumber));
      const localOnly = pending.filter((p) => !syncedNums.has(p.dailyOrderNumber));
      const merged = [...localOnly, ...remote].sort(
        (a, b) => (a.dailyOrderNumber ?? 0) - (b.dailyOrderNumber ?? 0)
      );
      if (merged.length > prevCount.current) playOrderSound();
      prevCount.current = merged.length;
      setOrders(merged);
      setLoading(false);
    };

    const unsub = subscribeKitchenOrders((kitchen) => {
      remote = kitchen;
      apply();
    });

    const onPending = () => apply();
    window.addEventListener("rush-pos-pending", onPending);
    window.addEventListener("storage", onPending);

    return () => {
      unsub();
      window.removeEventListener("rush-pos-pending", onPending);
      window.removeEventListener("storage", onPending);
    };
  }, []);

  async function setKitchen(id: string, status: KitchenStatus, orderObj?: Order) {
    const statusMap: Record<KitchenStatus, Order["status"]> = {
      new: "received",
      preparing: "preparing",
      ready: "ready",
      served: "served",
    };

    const targetStatus = statusMap[status];

    // If marked served / complete, print out receipt!
    if (status === "served" && orderObj) {
      toast.success("Printing final receipt at POS...");
      requestAnimationFrame(() => void printReceipt(orderObj));
    }

    if (id.startsWith("local-")) {
      const m = await import("@/lib/pos-instant");
      m.updatePendingOrderStatus(id, targetStatus, status);
      toast.success(`Order marked ${status}`);
      return;
    }

    await updateOrderStatus(id, targetStatus, status);
    toast.success(`Order marked ${status}`);
  }

  // Edit Order handler
  function openEditModal(order: Order) {
    setEditingOrder(order);
    setEditedItems(JSON.parse(JSON.stringify(order.items)));
  }

  function handleUpdateQty(idx: number, delta: number) {
    const next = [...editedItems];
    const item = next[idx]!;
    const newQty = Math.max(1, item.quantity + delta);

    // Recalculate item subtotal
    const unitPrice = item.price;
    item.quantity = newQty;
    item.subtotal = unitPrice * newQty;

    setEditedItems(next);
  }

  function handleRemoveItem(idx: number) {
    const next = editedItems.filter((_, i) => i !== idx);
    setEditedItems(next);
  }

  async function saveEditedOrder() {
    if (!editingOrder) return;
    if (editedItems.length === 0) {
      toast.error("An order must have at least 1 item");
      return;
    }

    try {
      const newSubtotal = editedItems.reduce((sum, item) => sum + item.subtotal, 0);
      const newTotal = newSubtotal - editingOrder.discount;

      if (editingOrder.id.startsWith("local-")) {
        toast.error("Offline local orders cannot be modified directly.");
        return;
      }

      await updateDoc(doc(getFirestoreDb(), "orders", editingOrder.id), {
        items: editedItems,
        subtotal: newSubtotal,
        total: newTotal,
        updatedAt: new Date().toISOString(),
      });

      toast.success("Order updated successfully!");
      setEditingOrder(null);
    } catch (err) {
      toast.error("Failed to update order");
    }
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50 overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
        <div>
          <Link href="/admin" className="text-xs font-semibold text-slate-500 hover:text-primary">
            ← Admin Dashboard
          </Link>
          <h1 className="text-xl font-black text-slate-900">Kitchen Monitor</h1>
          <p className="text-xs text-slate-400">{RESTAURANT.name} — Simple Grid View</p>
        </div>
        <div className="rounded-2xl bg-primary px-5 py-2.5 text-center text-white shadow">
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">Active Tickets</p>
          <p className="text-2xl font-black">{orders.length}</p>
        </div>
      </header>

      {loading ? (
        <div className="p-6"><KitchenColumnsSkeleton /></div>
      ) : (
        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {orders.map((order) => {
              const created = parseDate(order.createdAt)?.getTime() ?? Date.now();
              const elapsed = Math.floor((Date.now() - created) / 60000);
              const isOnline = order.source === "website";
              const status = order.kitchenStatus ?? "new";

              return (
                <div
                  key={order.id}
                  className={cn(
                    "flex flex-col rounded-2xl border-2 bg-white shadow-sm overflow-hidden",
                    status === "new" && "border-blue-400",
                    status === "preparing" && "border-amber-400",
                    status === "ready" && "border-emerald-400"
                  )}
                >
                  {/* Card Header */}
                  <div className={cn(
                    "px-4 py-3 flex items-center justify-between border-b text-white font-bold",
                    status === "new" && "bg-blue-500",
                    status === "preparing" && "bg-amber-500",
                    status === "ready" && "bg-emerald-500"
                  )}>
                    <div>
                      <span className="text-lg">#{order.dailyOrderNumber ?? order.orderNumber}</span>
                      <span className="ml-2 text-xs uppercase opacity-85">{status}</span>
                    </div>
                    <span className="text-xs font-mono bg-black/25 px-2 py-0.5 rounded">
                      {elapsed}m
                    </span>
                  </div>

                  {/* Card Body */}
                  <div className="flex-1 p-4 space-y-3 min-h-[160px]">
                    <div className="flex justify-between items-center text-xs text-slate-500 font-bold capitalize">
                      <span>{order.type.replace("_", " ")}</span>
                      {order.tableNumber != null && (
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">Table {order.tableNumber}</span>
                      )}
                    </div>

                    <ul className="space-y-2 border-t border-slate-100 pt-3">
                      {order.items.map((item, i) => (
                        <li key={i} className="text-sm font-bold text-slate-800">
                          <span className="text-primary font-black">{item.quantity}×</span> {item.name} {item.customization?.variantName ? `(${item.customization.variantName})` : ""}
                          {item.customization?.notes && (
                            <span className="mt-0.5 block text-xs font-normal text-amber-700">
                              ↳ {item.customization.notes}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="p-3 border-t border-slate-100 bg-slate-50 flex gap-2">
                    {/* Edit button */}
                    {!order.id.startsWith("local-") && (
                      <button
                        type="button"
                        onClick={() => openEditModal(order)}
                        className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition active:scale-95"
                        title="Edit Order Items"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    )}

                    {status === "new" && (
                      <button
                        type="button"
                        className="flex-1 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-white hover:bg-amber-600 active:scale-95 transition"
                        onClick={() => setKitchen(order.id, "preparing")}
                      >
                        Start Cooking
                      </button>
                    )}
                    {status === "preparing" && (
                      <button
                        type="button"
                        className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-white hover:bg-emerald-600 active:scale-95 transition"
                        onClick={() => setKitchen(order.id, "ready")}
                      >
                        Ready
                      </button>
                    )}
                    {status === "ready" && (
                      <button
                        type="button"
                        className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-white hover:bg-slate-900 active:scale-95 transition flex items-center justify-center gap-1"
                        onClick={() => setKitchen(order.id, "served", order)}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Served & Print
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {orders.length === 0 && (
              <div className="col-span-full py-24 text-center">
                <p className="text-lg font-bold text-slate-400">All clear! No pending kitchen tickets.</p>
              </div>
            )}
          </div>
        </main>
      )}

      {/* Edit Order Modal */}
      {editingOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-base font-black text-slate-900">
                Edit Items: Order #{editingOrder.dailyOrderNumber ?? editingOrder.orderNumber}
              </h3>
              <button
                type="button"
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
                onClick={() => setEditingOrder(null)}
              >
                Close
              </button>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-3">
              {editedItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.customization?.variantName || "Standard"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="h-8 w-8 rounded bg-slate-100 flex items-center justify-center active:scale-95"
                      onClick={() => handleUpdateQty(idx, -1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
                    <button
                      type="button"
                      className="h-8 w-8 rounded bg-slate-800 text-white flex items-center justify-center active:scale-95"
                      onClick={() => handleUpdateQty(idx, 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="text-xs text-red-500 font-bold ml-2 active:scale-95"
                      onClick={() => handleRemoveItem(idx)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 border-t pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setEditingOrder(null)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={saveEditedOrder}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
