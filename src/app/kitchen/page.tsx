"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn, parseDate } from "@/lib/utils";
import { subscribeKitchenOrders } from "@/services/orders.service";
import { subscribeMenuItems } from "@/services/menu.service";
import { getPendingKitchenOrders } from "@/lib/pos-instant";
import { playOrderSound, printReceipt, printKOT } from "@/lib/print";
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

  // Tabs state
  const [activeTab, setActiveTab] = useState<"cooking" | "payment_pending">("cooking");

  // Editing order modal state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editedItems, setEditedItems] = useState<Order["items"]>([]);
  const [menuSearch, setMenuSearch] = useState("");

  // Settlement modal state
  const [settlingOrder, setSettlingOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<Order["paymentMethod"]>("cash");
  const [creditName, setCreditName] = useState("");

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

  // Set kitchen status to ready (Prepared)
  async function markPrepared(order: Order) {
    try {
      if (order.id.startsWith("local-")) {
        const m = await import("@/lib/pos-instant");
        m.updatePendingOrderStatus(order.id, "ready", "ready", order.paymentMethod);
      } else {
        await updateDoc(doc(getFirestoreDb(), "orders", order.id), {
          status: "ready",
          kitchenStatus: "ready",
          updatedAt: new Date().toISOString(),
        });
      }
      toast.success(`Order #${order.dailyOrderNumber ?? order.orderNumber} marked Prepared!`);
    } catch (err) {
      toast.error("Failed to update status");
    }
  }

  // Print KOT or Bill receipt
  async function handlePrintBill(order: Order) {
    try {
      if (order.id.startsWith("local-")) {
        const pending = JSON.parse(localStorage.getItem("pos_pending_orders") || "[]");
        const idx = pending.findIndex((o: any) => o.id === order.id);
        if (idx !== -1) {
          pending[idx].billPrinted = true;
          localStorage.setItem("pos_pending_orders", JSON.stringify(pending));
          window.dispatchEvent(new CustomEvent("rush-pos-pending"));
        }
      } else {
        await updateDoc(doc(getFirestoreDb(), "orders", order.id), {
          billPrinted: true,
          updatedAt: new Date().toISOString(),
        });
      }
      toast.success("Printing bill...");
      void printReceipt({ ...order, billPrinted: true });
    } catch (err) {
      toast.error("Failed to update bill print status");
    }
  }

  // Settle payment (Cash, Card, Online, or Credit)
  async function settlePayment() {
    if (!settlingOrder) return;

    try {
      const now = new Date().toISOString();
      const updatedFields: any = {
        status: "served",
        kitchenStatus: "served",
        paymentMethod: paymentMethod,
        paymentStatus: paymentMethod === "credit" ? "credit" : "paid",
        updatedAt: now,
      };

      if (paymentMethod === "credit") {
        if (!creditName.trim()) {
          toast.error("Please enter the customer's name for Credit Purchase");
          return;
        }
        updatedFields.customerName = creditName.trim();
        updatedFields.creditName = creditName.trim();
      }

      const finalOrder = { ...settlingOrder, ...updatedFields };

      if (settlingOrder.id.startsWith("local-")) {
        const m = await import("@/lib/pos-instant");
        m.updatePendingOrderStatus(settlingOrder.id, "served", "served", paymentMethod);
        // Also save local storage credits if local
        if (paymentMethod === "credit") {
          const credits = JSON.parse(localStorage.getItem("pos_local_credits") || "[]");
          credits.push({
            id: settlingOrder.id,
            customerName: creditName.trim(),
            total: settlingOrder.total,
            items: settlingOrder.items,
            createdAt: now,
          });
          localStorage.setItem("pos_local_credits", JSON.stringify(credits));
        }
      } else {
        await updateDoc(doc(getFirestoreDb(), "orders", settlingOrder.id), updatedFields);
        
        // Also save credit purchase to a dedicated global collection so we can easily query it in the sidebar
        if (paymentMethod === "credit") {
          const { doc: fsDoc, setDoc } = await import("firebase/firestore");
          const creditRef = fsDoc(getFirestoreDb(), "credits", settlingOrder.id);
          await setDoc(creditRef, {
            orderId: settlingOrder.id,
            orderNumber: settlingOrder.dailyOrderNumber ?? settlingOrder.orderNumber,
            customerName: creditName.trim(),
            customerPhone: settlingOrder.customerPhone || "",
            total: settlingOrder.total,
            items: settlingOrder.items,
            createdAt: now,
          });
        }
      }

      toast.success("Payment completed and order marked served!");
      void printReceipt(finalOrder);
      setSettlingOrder(null);
      setCreditName("");
    } catch (err) {
      toast.error("Failed to settle order payment");
    }
  }

  // Edit Order handler
  function openEditModal(order: Order) {
    if (order.billPrinted) {
      toast.error("This order's bill is already printed. Modifications locked!");
      return;
    }
    setEditingOrder(order);
    setEditedItems(JSON.parse(JSON.stringify(order.items)));
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

  function handleDirectAddMenuItem(menuItem: MenuItem) {
    // Check if item already exists in edited list
    const existingIdx = editedItems.findIndex(i => i.menuItemId === menuItem.id);
    if (existingIdx !== -1) {
      handleUpdateQty(existingIdx, 1);
      toast.success(`Added one more ${menuItem.name}`);
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
    toast.success(`Added ${menuItem.name}`);
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
      const updatedOrder = {
        ...editingOrder,
        items: editedItems,
        subtotal: newSubtotal,
        total: newTotal,
      };

      if (editingOrder.id.startsWith("local-")) {
        const m = await import("@/lib/pos-instant");
        m.updatePendingOrderItems(editingOrder.id, editedItems, newSubtotal, newTotal);
        toast.success("Local order updated!");
        void printKOT(updatedOrder);
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
      void printKOT(updatedOrder);
      setEditingOrder(null);
    } catch (err) {
      toast.error("Failed to update order");
    }
  }

  // Filter orders based on active tab
  const filteredOrders = orders.filter((order) => {
    const kitchenStatus = order.kitchenStatus ?? "new";
    if (activeTab === "cooking") {
      return kitchenStatus === "new" || kitchenStatus === "preparing";
    } else {
      return kitchenStatus === "ready";
    }
  });

  return (
    <div className="flex h-screen flex-col bg-slate-50 overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
        <div className="space-y-1">
          <Link href="/admin" className="text-xs font-semibold text-slate-500 hover:text-primary">
            ← Admin Dashboard
          </Link>
          <h1 className="text-xl font-black text-slate-900">Kitchen Display System</h1>
          <p className="text-xs text-slate-400">{RESTAURANT.name} — Simplified view</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Tabs Control */}
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setActiveTab("cooking")}
              className={cn(
                "rounded-lg px-4 py-2 text-xs font-bold transition",
                activeTab === "cooking"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              🍳 Cooking ({(orders.filter(o => (o.kitchenStatus ?? "new") === "new" || o.kitchenStatus === "preparing")).length})
            </button>
            <button
              onClick={() => setActiveTab("payment_pending")}
              className={cn(
                "rounded-lg px-4 py-2 text-xs font-bold transition",
                activeTab === "payment_pending"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              ⏳ Payment Pending ({(orders.filter(o => o.kitchenStatus === "ready")).length})
            </button>
          </div>

          <div className="rounded-2xl bg-primary px-5 py-2.5 text-center text-white shadow">
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">Active Tickets</p>
            <p className="text-2xl font-black">{orders.length}</p>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="p-6"><KitchenColumnsSkeleton /></div>
      ) : (
        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredOrders.map((order) => {
              const created = parseDate(order.createdAt)?.getTime() ?? Date.now();
              const elapsed = Math.floor((Date.now() - created) / 60000);

              return (
                <div
                  key={order.id}
                  className={cn(
                    "flex flex-col rounded-2xl border-2 bg-white shadow-sm overflow-hidden hover:border-primary/50 transition duration-300",
                    order.billPrinted ? "border-slate-300 opacity-90" : "border-orange-200"
                  )}
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
                    {/* Hide edit button if bill is printed */}
                    {!order.billPrinted && (
                      <button
                        type="button"
                        onClick={() => openEditModal(order)}
                        className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition active:scale-95 flex items-center justify-center shrink-0"
                        title="Edit Items"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    )}

                    {activeTab === "cooking" ? (
                      <button
                        type="button"
                        className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-primary/95 active:scale-95 transition flex items-center justify-center gap-1.5 shadow shadow-primary/20"
                        onClick={() => markPrepared(order)}
                      >
                        <CheckCircle className="h-4 w-4" />
                        Prepared
                      </button>
                    ) : (
                      <div className="flex flex-1 gap-2">
                        <button
                          type="button"
                          className={cn(
                            "flex-1 rounded-xl py-2.5 text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-95"
                          )}
                          onClick={() => handlePrintBill(order)}
                        >
                          🖨️ {order.billPrinted ? "Re-Print Bill" : "Print Bill"}
                        </button>
                        <button
                          type="button"
                          className="flex-1 rounded-xl bg-green-600 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-green-700 active:scale-95 transition flex items-center justify-center gap-1.5 shadow shadow-green-600/20"
                          onClick={() => {
                            setSettlingOrder(order);
                            setPaymentMethod("cash");
                            setCreditName(order.customerName || "");
                          }}
                        >
                          💵 Pay & Serve
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredOrders.length === 0 && (
              <div className="col-span-full py-24 text-center">
                <p className="text-lg font-black text-slate-400">
                  {activeTab === "cooking" ? "All clear! No pending kitchen tickets." : "No orders waiting for payment."}
                </p>
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
              
              {menuSearch.trim() && (
                <div className="max-h-36 overflow-y-auto border rounded-xl bg-white p-2 grid grid-cols-2 gap-1.5">
                  {menuItems
                    .filter((m) =>
                      m.name.toLowerCase().includes(menuSearch.toLowerCase())
                    )
                    .slice(0, 10)
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleDirectAddMenuItem(m)}
                        className="text-left p-2 border rounded-lg text-xs font-bold hover:bg-orange-50 hover:border-primary transition flex flex-col justify-between"
                      >
                        <span className="truncate">{m.name}</span>
                        <span className="text-primary font-black mt-0.5">{m.price.toLocaleString()} PKR</span>
                      </button>
                    ))}
                  {menuItems.filter((m) => m.name.toLowerCase().includes(menuSearch.toLowerCase())).length === 0 && (
                    <span className="col-span-2 text-center text-xs text-slate-400 py-4">No matching items</span>
                  )}
                </div>
              )}
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

      {/* Settlement (Pay & Serve) Modal */}
      {settlingOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-base font-black text-slate-900">
                Settle Payment — Order #{settlingOrder.dailyOrderNumber ?? settlingOrder.orderNumber}
              </h3>
              <button
                type="button"
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
                onClick={() => setSettlingOrder(null)}
              >
                Cancel
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payment Method</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[
                    { id: "cash" as const, label: "💵 Cash" },
                    { id: "card" as const, label: "💳 Card" },
                    { id: "online" as const, label: "🌐 Online" },
                    { id: "credit" as const, label: "📝 Credit Sale" },
                  ].map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id)}
                      className={cn(
                        "py-3 px-4 rounded-xl border-2 text-sm font-black transition-all text-left flex items-center justify-between",
                        paymentMethod === method.id
                          ? "border-primary bg-orange-50/50 text-slate-900"
                          : "border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
                      )}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === "credit" && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Debtor Name *</label>
                  <Input
                    type="text"
                    placeholder="Enter customer/debtor name..."
                    value={creditName}
                    onChange={(e) => setCreditName(e.target.value)}
                    className="h-10 text-xs rounded-xl border bg-white px-3 font-semibold"
                  />
                </div>
              )}

              <div className="border-t pt-4 flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setSettlingOrder(null)}>
                  Cancel
                </Button>
                <Button className="flex-1 rounded-xl font-bold bg-green-600 hover:bg-green-700" onClick={settlePayment}>
                  Complete Settlement
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
