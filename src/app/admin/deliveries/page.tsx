"use client";

import { useEffect, useState } from "react";
import { subscribeOrders } from "@/services/orders.service";
import { formatCurrency } from "@/lib/utils";
import type { Order } from "@/types";
import { StatsGridSkeleton } from "@/components/ui/loading-skeletons";

export default function DailyDeliveriesPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  useEffect(() => {
    setLoading(true);
    const start = new Date(`${selectedDate}T00:00:00`);
    const end = new Date(`${selectedDate}T23:59:59.999`);

    const unsub = subscribeOrders(
      (list) => {
        setOrders(list);
        setLoading(false);
      },
      start.toISOString(),
      end.toISOString()
    );
    return () => unsub();
  }, [selectedDate]);

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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Daily Deliveries</h1>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          />
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
            View all delivery orders for a given day — customer name, address,
            charges and totals.
          </p>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm font-semibold"
        />
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
