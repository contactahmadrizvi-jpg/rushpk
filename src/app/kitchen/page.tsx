"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn, formatDate, parseDate } from "@/lib/utils";
import { subscribeKitchenOrders, updateOrderStatus } from "@/services/orders.service";
import { subscribeMenuItems } from "@/services/menu.service";
import { getPendingKitchenOrders } from "@/lib/pos-instant";
import { playOrderSound, printReceipt } from "@/lib/print";
import type { Order, KitchenStatus, MenuItem } from "@/types";
import { RESTAURANT } from "@/constants";
import { KitchenColumnsSkeleton } from "@/components/ui/loading-skeletons";
import { doc, updateDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/config";
import { Minus, Plus, Edit, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const prevCount = useRef(0);

  // Editing order modal state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editedItems, setEditedItems] = useState<Order["items"]>([]);
  const [selectedToAddMenuId, setSelectedToAddMenuId] = useState("");
  const [menuSearch, setMenuSearch] = useState("");

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

    const unsubMenu = subscribeMenuItems((items) => {
      setMenuItems(items);
    });

    const onPending = () => apply();
    window.addEventListener("rush-pos-pending", onPending);
    window.addEventListener("storage", onPending);

    return () => {
      unsub();
      unsubMenu();
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
      toast.success(`Order marked completed!`);
      return;
    }

    await updateOrderStatus(id, targetStatus, status);
    toast.success(`Order marked completed!`);
  }

  // Edit Order handler
  function openEditModal(order: Order) {
    setEditingOrder(order);
    setEditedItems(JSON.parse(JSON.stringify(order.items)));
    setSelectedToAddMenuId("");
    setMenuSearch("");
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

  function handleAddMenuItemToOrder() {
    if (!selectedToAddMenuId) return;
    const menuItem = menuItems.find(m => m.id === selectedToAddMenuId);
    if (!menuItem) return;

    // Check if item already exists in edited list
    const existingIdx = editedItems.findIndex(i => i.menuItemId === menuItem.id);
    if (existingIdx !== -1) {
      handleUpdateQty(existingIdx, 1);
      toast.success(`Added one more ${menuItem.name} to list`);
      return;
    }

    const newItem: Order["items"][number] = {
      id: `added-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      menuItemId: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity: 1,
      subtotal: menuItem.price,
      customization: {},
    };

    setEditedItems([...editedItems, newItem]);
    toast.success(`Added ${menuItem.name} to list`);
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
        const m = await import("@/lib/pos-instant");
        m.updatePendingOrderItems(editingOrder.id, editedItems, newSubtotal, newTotal);
        toast.success("Local order updated!");
        setEditingOrder(null);
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
          <h1 className="text-xl font-black text-slate-900">Kitchen Display System</h1>
          <p className="text-xs text-slate-400">{RESTAURANT.name} — Simplified view</p>
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
              const status = order.kitchenStatus ?? "new";

              return (
                <div
                  key={order.id}
                  className="flex flex-col rounded-2xl border-2 bg-white shadow-sm overflow-hidden border-orange-200 hover:border-primary/50 transition duration-300"
                >
                  {/* Header */}
                  <div className="px-4 py-3 flex items-center justify-between border-b bg-stone-900 text-white font-bold">
                    <div>
                      <span className="text-base font-black">ORDER #{order.dailyOrderNumber ?? order.orderNumber}</span>
                    </div>
                    <span className="text-xs font-bold font-mono bg-primary/80 px-2 py-0.5 rounded">
                      {elapsed}m ago
                    </span>
                  </div>

                  {/* Body */}
                  <div className="flex-1 p-4 space-y-3 min-h-[160px]">
                    <div className="flex justify-between items-center text-xs text-slate-500 font-bold capitalize">
                      <span className="bg-orange-50 text-orange-700 px-2.5 py-1 rounded-lg">
                        {order.type.replace("_", " ")}
                      </span>
                      {order.tableNumber != null && (
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">Table {order.tableNumber}</span>
                      )}
                    </div>

                    <ul className="space-y-2.5 border-t border-slate-100 pt-3">
                      {order.items.map((item, i) => (
                        <li key={i} className="text-sm font-bold text-slate-800 flex items-start justify-between">
                          <span>
                            <span className="text-primary font-black text-base mr-1.5">{item.quantity}×</span>
                            {item.name} {item.customization?.variantName ? `(${item.customization.variantName})` : ""}
                            {item.customization?.notes && (
                              <span className="mt-0.5 block text-xs font-medium text-amber-700">
                                ↳ {item.customization.notes}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Footer Action: Single Action Button */}
                  <div className="p-3 border-t border-slate-100 bg-slate-50 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(order)}
                      className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition active:scale-95 flex items-center justify-center shrink-0"
                      title="Edit Items"
                    >
                      <Edit className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-primary/95 active:scale-95 transition flex items-center justify-center gap-1.5 shadow shadow-primary/20"
                      onClick={() => setKitchen(order.id, "served", order)}
                    >
                      <CheckCircle className="h-4 w-4" />
                      Prepared & Print Receipt
                    </button>
                  </div>
                </div>
              );
            })}
            {orders.length === 0 && (
              <div className="col-span-full py-24 text-center">
                <p className="text-lg font-black text-slate-400">All clear! No pending kitchen tickets.</p>
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
                Modify Order #{editingOrder.dailyOrderNumber ?? editingOrder.orderNumber}
              </h3>
              <button
                type="button"
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
                onClick={() => setEditingOrder(null)}
              >
                Cancel
              </button>
            </div>

            {/* Menu Item Addition Selector */}
            <div className="bg-stone-50 p-3.5 rounded-2xl border space-y-2">
              <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">Add Item From Menu</span>
              <Input
                type="text"
                placeholder="🔍 Search food menu..."
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                className="h-10 text-xs rounded-xl border bg-white px-3"
              />
              <div className="flex gap-2">
                <select
                  value={selectedToAddMenuId}
                  onChange={(e) => setSelectedToAddMenuId(e.target.value)}
                  className="h-10 flex-1 rounded-xl border bg-white px-3 text-xs font-semibold"
                >
                  <option value="">-- Select Menu Item --</option>
                  {menuItems
                    .filter((m) =>
                      m.name.toLowerCase().includes(menuSearch.toLowerCase())
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.price.toLocaleString()} PKR)
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddMenuItemToOrder}
                  className="h-10 bg-primary text-white text-xs font-extrabold px-4 rounded-xl active:scale-95 transition"
                >
                  + Add to Order
                </button>
              </div>
            </div>

            {/* Items list */}
            <div className="max-h-[220px] overflow-y-auto space-y-3 pr-1">
              {editedItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between border-b pb-2.5 last:border-0">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.customization?.variantName || "Standard"}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="h-7 w-7 rounded bg-slate-100 flex items-center justify-center active:scale-95 border"
                      onClick={() => handleUpdateQty(idx, -1)}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-5 text-center font-bold text-sm">{item.quantity}</span>
                    <button
                      type="button"
                      className="h-7 w-7 rounded bg-slate-800 text-white flex items-center justify-center active:scale-95"
                      onClick={() => handleUpdateQty(idx, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="text-xs text-red-500 font-extrabold ml-3 active:scale-95"
                      onClick={() => handleRemoveItem(idx)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 border-t pt-4">
              <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setEditingOrder(null)}>
                Discard
              </Button>
              <Button className="flex-1 rounded-xl font-bold" onClick={saveEditedOrder}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
