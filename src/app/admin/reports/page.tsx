"use client";

import { useEffect, useState } from "react";
import { subscribeOrders } from "@/services/orders.service";
import { getBestSellers } from "@/services/analytics.service";
import { formatCurrency } from "@/lib/utils";
import type { Order } from "@/types";
import { Button } from "@/components/ui/button";
import { StatsGridSkeleton } from "@/components/ui/loading-skeletons";

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sellers, setSellers] = useState<ReturnType<typeof getBestSellers>>([]);

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  useEffect(() => {
    setLoading(true);

    const start = new Date(`${selectedDate}T00:00:00`);
    const end = new Date(`${selectedDate}T23:59:59.999`);

    const unsub = subscribeOrders((list) => {
      setOrders(list);
      setSellers(getBestSellers(list));
      setLoading(false);
    }, start.toISOString(), end.toISOString());

    return () => unsub();
  }, [selectedDate]);

  function exportCSV() {
    const rows = [["Order", "Customer", "Phone", "Total", "Payment", "Date"]];
    orders.forEach((o) => rows.push([o.orderNumber, o.customerName, o.customerPhone, String(o.total), o.paymentMethod, o.createdAt]));
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sales-${selectedDate}.csv`;
    a.click();
  }

  const cash = orders.filter((o) => o.paymentMethod === "cash" && o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const online = orders.filter((o) => o.paymentMethod === "online" && o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const card = orders.filter((o) => o.paymentMethod === "card" && o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const totalRevenue = cash + online + card;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Reports</h1>
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
          <h1 className="text-2xl font-bold">Reports & Sales</h1>
          <p className="text-sm text-muted-foreground">Select date to analyze revenue performance and best selling items.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm font-semibold text-stone-850"
          />
          <Button variant="outline" onClick={exportCSV} disabled={!orders.length}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Reports Metrics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Revenue</p>
          <p className="mt-2 text-2xl font-black text-primary">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cash Revenue</p>
          <p className="mt-2 text-2xl font-bold text-stone-900">{formatCurrency(cash)}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Online Revenue</p>
          <p className="mt-2 text-2xl font-bold text-stone-900">{formatCurrency(online)}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Orders</p>
          <p className="mt-2 text-2xl font-bold text-stone-900">{orders.length}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 mt-6">
        {/* Best Sellers */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-extrabold text-lg text-stone-900">Best Sellers for {selectedDate}</h2>
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr className="text-left font-bold text-stone-700">
                  <th className="p-4">Item Name</th>
                  <th className="p-4">Quantity Sold</th>
                  <th className="p-4 text-right">Revenue Generated</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-stone-50/50 transition">
                    <td className="p-4 font-bold text-stone-900">{s.name}</td>
                    <td className="p-4 font-semibold text-stone-700">{s.qty} sold</td>
                    <td className="p-4 text-right font-black text-stone-900">{formatCurrency(s.revenue)}</td>
                  </tr>
                ))}
                {sellers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-muted-foreground">
                      No sales logged for this date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Methods breakdown */}
        <div className="space-y-4">
          <h2 className="font-extrabold text-lg text-stone-900">Sales Source Breakdown</h2>
          <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
            <div className="flex justify-between border-b pb-2 text-sm font-semibold">
              <span className="text-stone-500">Source / Type</span>
              <span>Count</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-bold">POS Orders</span>
              <span className="font-semibold">{orders.filter(o => o.source === "pos").length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-bold">Online / Website</span>
              <span className="font-semibold">{orders.filter(o => o.source === "website").length}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="font-bold">Dine In</span>
              <span className="font-semibold">{orders.filter(o => o.type === "dine_in").length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-bold">Takeaway</span>
              <span className="font-semibold">{orders.filter(o => o.type === "takeaway").length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-bold">Delivery</span>
              <span className="font-semibold">{orders.filter(o => o.type === "delivery").length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
