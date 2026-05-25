"use client";

import { useEffect, useState } from "react";
import { getTodayOrders } from "@/services/orders.service";
import { getBestSellers } from "@/services/analytics.service";
import { formatCurrency } from "@/lib/utils";
import type { Order } from "@/types";
import { Button } from "@/components/ui/button";

export default function ReportsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [sellers, setSellers] = useState<ReturnType<typeof getBestSellers>>([]);

  useEffect(() => {
    getTodayOrders().then((o) => {
      setOrders(o);
      setSellers(getBestSellers(o));
    });
  }, []);

  function exportCSV() {
    const rows = [["Order", "Customer", "Phone", "Total", "Payment", "Date"]];
    orders.forEach((o) => rows.push([o.orderNumber, o.customerName, o.customerPhone, String(o.total), o.paymentMethod, o.createdAt]));
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sales-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const cash = orders.filter((o) => o.paymentMethod === "cash").reduce((s, o) => s + o.total, 0);
  const online = orders.filter((o) => o.paymentMethod === "online").reduce((s, o) => s + o.total, 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reports</h1>
        <Button variant="outline" onClick={exportCSV}>Export CSV</Button>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Cash</p><p className="text-xl font-bold">{formatCurrency(cash)}</p></div>
        <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Online</p><p className="text-xl font-bold">{formatCurrency(online)}</p></div>
        <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Orders Today</p><p className="text-xl font-bold">{orders.length}</p></div>
      </div>
      <h2 className="mt-8 font-bold">Best Sellers Today</h2>
      <ul className="mt-4 space-y-2">
        {sellers.map((s) => (
          <li key={s.id} className="flex justify-between rounded-lg border p-3">
            <span>{s.name}</span>
            <span>{s.qty} sold — {formatCurrency(s.revenue)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
