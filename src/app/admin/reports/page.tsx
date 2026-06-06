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
  const [viewMode, setViewMode] = useState<"day" | "this_month" | "prev_month">("day");

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  useEffect(() => {
    setLoading(true);

    let start: Date;
    let end: Date;

    if (viewMode === "this_month") {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (viewMode === "prev_month") {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else {
      start = new Date(`${selectedDate}T00:00:00`);
      end = new Date(`${selectedDate}T23:59:59.999`);
    }

    const unsub = subscribeOrders((list) => {
      setOrders(list);
      setSellers(getBestSellers(list));
      setLoading(false);
    }, start.toISOString(), end.toISOString());

    return () => unsub();
  }, [selectedDate, viewMode]);

  function exportCSV() {
    const rows = [["Order", "Customer", "Phone", "Total", "Payment", "Date"]];
    orders.forEach((o) => rows.push([o.orderNumber, o.customerName, o.customerPhone, String(o.total), o.paymentMethod, o.createdAt]));
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const rangeName = viewMode === "day" ? selectedDate : viewMode === "this_month" ? "this-month" : "previous-month";
    a.download = `sales-${rangeName}.csv`;
    a.click();
  }

  // Exclude credit orders from collected revenue (credit = unpaid debt, not actual income)
  const cash = orders.filter((o) => o.paymentMethod === "cash" && o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const online = orders.filter((o) => o.paymentMethod === "online" && o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const card = orders.filter((o) => o.paymentMethod === "card" && o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const creditOutstanding = orders.filter((o) => (o.paymentMethod === "credit" || o.paymentStatus === "credit") && o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const creditCount = orders.filter((o) => (o.paymentMethod === "credit" || o.paymentStatus === "credit") && o.status !== "cancelled").length;
  const websiteRevenue = orders.filter((o) => o.source === "website" && o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const websiteCount = orders.filter((o) => o.source === "website" && o.status !== "cancelled").length;
  const totalRevenue = cash + online + card; // credit excluded — it's outstanding debt

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Reports</h1>
          <div className="flex items-center gap-3">
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as any)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              <option value="day">Single Day</option>
              <option value="this_month">This Month</option>
              <option value="prev_month">Previous Month</option>
            </select>
            {viewMode === "day" && (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
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

  const headingDateText =
    viewMode === "day"
      ? selectedDate
      : viewMode === "this_month"
      ? "This Month"
      : "Previous Month";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports & Sales</h1>
          <p className="text-sm text-muted-foreground">Select date or range to analyze revenue performance and best selling items.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as any)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm font-semibold text-stone-850"
          >
            <option value="day">Single Day</option>
            <option value="this_month">This Month</option>
            <option value="prev_month">Previous Month</option>
          </select>
          {viewMode === "day" && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm font-semibold text-stone-850"
            />
          )}
          <Button variant="outline" onClick={exportCSV} disabled={!orders.length}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Revenue</p>
          <p className="mt-2 text-2xl font-black text-primary">{formatCurrency(totalRevenue)}</p>
          <p className="mt-1 text-[10px] text-muted-foreground font-semibold">Credit excluded</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cash Revenue</p>
          <p className="mt-2 text-2xl font-bold text-stone-900">{formatCurrency(cash)}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Card Revenue</p>
          <p className="mt-2 text-2xl font-bold text-stone-900">{formatCurrency(card)}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Online Revenue</p>
          <p className="mt-2 text-2xl font-bold text-stone-900">{formatCurrency(online)}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Website Orders</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">{formatCurrency(websiteRevenue)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{websiteCount} orders</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Orders</p>
          <p className="mt-2 text-2xl font-bold text-stone-900">{orders.length}</p>
        </div>
      </div>
      {creditOutstanding > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-red-500">Credit Outstanding (Not Collected)</p>
            <p className="mt-1 text-2xl font-black text-red-600">{formatCurrency(creditOutstanding)}</p>
            <p className="mt-0.5 text-xs text-red-400">{creditCount} credit order{creditCount !== 1 ? "s" : ""} — not included in Total Revenue</p>
          </div>
          <p className="text-xs text-red-400 font-semibold max-w-[200px] text-right">These are outstanding debts owed by customers. Manage them in Credit Sales.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3 mt-6">
        {/* Best Sellers */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-extrabold text-lg text-stone-900">Best Sellers for {headingDateText}</h2>
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
                      No sales logged for this selection.
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
                <span className="font-semibold">{orders.filter((o) => o.source === "pos").length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-bold">Online / Website</span>
                <span className="font-semibold">{orders.filter((o) => o.source === "website").length}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-3">
                <span className="font-bold">Dine In</span>
                <span className="font-semibold">{orders.filter((o) => o.type === "dine_in").length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-bold">Takeaway</span>
                <span className="font-semibold">{orders.filter((o) => o.type === "takeaway").length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-bold">Delivery</span>
                <span className="font-semibold">{orders.filter((o) => o.type === "delivery").length}</span>
              </div>
              {creditCount > 0 && (
                <div className="flex justify-between text-sm border-t pt-3">
                  <span className="font-bold text-red-600">Credit Sales (Unpaid)</span>
                  <span className="font-semibold text-red-600">{creditCount} · {formatCurrency(creditOutstanding)}</span>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}
