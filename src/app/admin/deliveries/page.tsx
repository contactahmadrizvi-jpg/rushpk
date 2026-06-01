"use client";

import { useEffect, useState } from "react";
import { subscribeOrders } from "@/services/orders.service";
import { formatCurrency, cn } from "@/lib/utils";
import type { Order } from "@/types";
import { StatsGridSkeleton } from "@/components/ui/loading-skeletons";

export default function DailyDeliveriesPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filterType, setFilterType] = useState<"day" | "this_month" | "prev_month">("day");

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  useEffect(() => {
    setLoading(true);
    let startIso: string;
    let endIso: string;

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
    } else {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      startIso = start.toISOString();
      endIso = end.toISOString();
    }

    const unsub = subscribeOrders(
      (list) => {
        setOrders(list);
        setLoading(false);
      },
      startIso,
      endIso
    );
    return () => unsub();
  }, [selectedDate, filterType]);

  // Filter only delivery orders
  const deliveryOrders = orders.filter(
    (o) => o.type === "delivery" && o.status !== "cancelled"
  );

  const totalDeliveryRevenue = deliveryOrders.reduce((s, o) => s + o.total, 0);
  const totalDeliveryCharges = deliveryOrders.reduce(
    (s, o) => s + (o.deliveryCharge || 0),
    0
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Daily Deliveries</h1>
            <p className="text-sm text-muted-foreground">Loading deliveries...</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2 rounded-xl bg-stone-100 p-1 border border-stone-200/40">
              {(["day", "this_month", "prev_month"] as const).map((t) => (
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
                  {t === "day" ? "Single Day" : t === "this_month" ? "This Month" : "Prev Month"}
                </button>
              ))}
            </div>

            {filterType === "day" && (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-10 rounded-xl border bg-background px-3 text-sm font-semibold"
              />
            )}
          </div>
        </div>
        <div className="mt-6">
          <StatsGridSkeleton count={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Daily Deliveries</h1>
          <p className="text-sm text-muted-foreground">
            {filterType === "day"
              ? `View all delivery orders for ${selectedDate} — customer name, address, charges and totals.`
              : filterType === "this_month"
              ? "View all delivery orders for the current month."
              : "View all delivery orders for the previous month."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2 rounded-xl bg-stone-100 p-1 border border-stone-200/40">
            {(["day", "this_month", "prev_month"] as const).map((t) => (
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
                {t === "day" ? "Single Day" : t === "this_month" ? "This Month" : "Prev Month"}
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
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Delivery Orders
          </p>
          <p className="mt-2 text-2xl font-black text-stone-900">
            {deliveryOrders.length}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Delivery Revenue
          </p>
          <p className="mt-2 text-2xl font-black text-primary">
            {formatCurrency(totalDeliveryRevenue)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Delivery Charges Collected
          </p>
          <p className="mt-2 text-2xl font-black text-stone-900">
            {formatCurrency(totalDeliveryCharges)}
          </p>
        </div>
      </div>

      {/* Delivery Orders Table */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr className="text-left font-bold text-stone-700">
              <th className="p-4">Order #</th>
              <th className="p-4">Customer</th>
              <th className="p-4">Phone</th>
              <th className="p-4">Address</th>
              <th className="p-4 text-right">Delivery Fee</th>
              <th className="p-4 text-right">Total</th>
              <th className="p-4">Time</th>
            </tr>
          </thead>
          <tbody>
            {deliveryOrders.map((o) => {
              const addr = o.deliveryAddress
                ? `${o.deliveryAddress.street || ""}${o.deliveryAddress.area ? `, ${o.deliveryAddress.area}` : ""}${o.deliveryAddress.city ? `, ${o.deliveryAddress.city}` : ""}`
                : "—";

              return (
                <tr
                  key={o.id}
                  className="border-b last:border-0 hover:bg-stone-50/50 transition"
                >
                  <td className="p-4 font-black text-primary">
                    #{o.dailyOrderNumber ?? o.orderNumber}
                  </td>
                  <td className="p-4 font-bold text-stone-900">
                    {o.customerName || "—"}
                  </td>
                  <td className="p-4 text-stone-600">{o.customerPhone || "—"}</td>
                  <td className="p-4 text-stone-600 max-w-[220px]">
                    <span className="truncate block">{addr}</span>
                  </td>
                  <td className="p-4 text-right font-semibold text-stone-700">
                    {formatCurrency(o.deliveryCharge || 0)}
                  </td>
                  <td className="p-4 text-right font-black text-stone-900">
                    {formatCurrency(o.total)}
                  </td>
                  <td className="p-4 text-stone-500 text-xs whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleTimeString("en-PK", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              );
            })}
            {deliveryOrders.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No delivery orders found for {selectedDate}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
