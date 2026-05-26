"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn, formatDate, parseDate } from "@/lib/utils";
import { subscribeKitchenOrders, updateOrderStatus } from "@/services/orders.service";
import { getPendingKitchenOrders } from "@/lib/pos-instant";
import { playOrderSound } from "@/lib/print";
import type { Order, KitchenStatus } from "@/types";
import { RESTAURANT } from "@/constants";

import { KitchenColumnsSkeleton } from "@/components/ui/loading-skeletons";

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const prevCount = useRef(0);

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

  async function setKitchen(id: string, status: KitchenStatus) {
    if (id.startsWith("local-")) {
      toast.info("Order is syncing to kitchen — try again in a moment");
      return;
    }
    const statusMap: Record<KitchenStatus, Order["status"]> = {
      new: "received",
      preparing: "preparing",
      ready: "ready",
      served: "served",
    };
    await updateOrderStatus(id, statusMap[status], status);
    toast.success(`Order marked ${status}`);
  }

  const columns: { status: KitchenStatus; label: string; color: string }[] = [
    { status: "new", label: "New Orders", color: "bg-blue-500" },
    { status: "preparing", label: "Cooking", color: "bg-amber-500" },
    { status: "ready", label: "Ready", color: "bg-emerald-500" },
  ];

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex shrink-0 items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
        <div>
          <Link href="/admin" className="text-xs font-medium text-slate-500 hover:text-primary">
            ← Admin
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Kitchen Display</h1>
          <p className="text-sm text-slate-500">{RESTAURANT.name} — POS & Online</p>
        </div>
        <div className="rounded-2xl bg-primary px-6 py-3 text-center text-white shadow">
          <p className="text-xs font-medium uppercase opacity-90">Active</p>
          <p className="text-3xl font-black">{orders.length}</p>
        </div>
      </header>

      {loading ? (
        <KitchenColumnsSkeleton />
      ) : (
      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-3">
        {columns.map((col) => {
          const colOrders = orders.filter((o) => (o.kitchenStatus ?? "new") === col.status);
          return (
            <div key={col.status} className="flex min-h-0 flex-col rounded-2xl border bg-white shadow-sm">
              <div className={cn("rounded-t-2xl px-4 py-3 text-white", col.color)}>
                <h2 className="text-lg font-bold">
                  {col.label} <span className="opacity-80">({colOrders.length})</span>
                </h2>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                {colOrders.length === 0 && (
                  <p className="py-12 text-center text-sm text-slate-400">No orders</p>
                )}
                {colOrders.map((order) => {
                  const created = parseDate(order.createdAt)?.getTime() ?? Date.now();
                  const elapsed = Math.floor((Date.now() - created) / 60000);
                  const isOnline = order.source === "website";
                  return (
                    <div
                      key={order.id}
                      className={cn(
                        "rounded-xl border-2 bg-slate-50 p-4",
                        isOnline ? "border-blue-400" : "border-slate-200"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-3xl font-black text-slate-900">
                            #{order.dailyOrderNumber ?? order.orderNumber}
                          </p>
                          {isOnline && (
                            <span className="mt-1 inline-block rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                              ONLINE
                            </span>
                          )}
                          {order.source === "pos" && (
                            <span className="mt-1 inline-block rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                              POS
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            "rounded-lg px-2 py-1 font-mono text-sm font-bold",
                            elapsed > 20 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
                          )}
                        >
                          {elapsed}m
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold capitalize text-slate-600">
                        {order.type.replace("_", " ")}
                        {order.tableNumber != null ? ` · Table ${order.tableNumber}` : ""}
                      </p>
                      <p className="text-xs text-slate-400">{formatDate(order.createdAt)}</p>
                      <ul className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                        {order.items.map((item, i) => (
                          <li key={i} className="text-base font-bold text-slate-800">
                            <span className="text-primary">{item.quantity}×</span> {item.name} {item.customization?.variantName ? `(${item.customization.variantName})` : ""}
                            {item.customization?.notes && (
                              <span className="mt-0.5 block text-sm font-normal text-amber-700">
                                ↳ {item.customization.notes}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-slate-500">
                        {order.customerName} · {order.customerPhone}
                      </p>
                      <div className="mt-4 flex gap-2">
                        {col.status === "new" && (
                          <button
                            type="button"
                            className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600"
                            onClick={() => setKitchen(order.id, "preparing")}
                          >
                            Start Cooking
                          </button>
                        )}
                        {col.status === "preparing" && (
                          <button
                            type="button"
                            className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white hover:bg-emerald-600"
                            onClick={() => setKitchen(order.id, "ready")}
                          >
                            Ready
                          </button>
                        )}
                        {col.status === "ready" && (
                          <button
                            type="button"
                            className="flex-1 rounded-xl border-2 border-slate-300 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100"
                            onClick={() => setKitchen(order.id, "served")}
                          >
                            Served / Picked
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
