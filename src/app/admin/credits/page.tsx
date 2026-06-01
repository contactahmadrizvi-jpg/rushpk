"use client";

import { useEffect, useState } from "react";
import { subscribeOrders } from "@/services/orders.service";
import { formatCurrency } from "@/lib/utils";
import type { Order } from "@/types";
import { StatsGridSkeleton } from "@/components/ui/loading-skeletons";

export default function CreditPurchasesPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const unsub = subscribeOrders((list) => {
      setOrders(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Filter orders that were settled as "credit"
  const creditOrders = orders.filter(
    (o) => o.paymentStatus === ("credit" as any) || o.paymentMethod === ("credit" as any)
  );

  const totalCredit = creditOrders.reduce((s, o) => s + o.total, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Credit Purchases</h1>
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
          <h1 className="text-2xl font-bold">Credit Purchases</h1>
          <p className="text-sm text-muted-foreground">
            Orders settled on credit. Track outstanding amounts owed by customers.
          </p>
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
              </tr>
            ))}
            {creditOrders.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No credit purchases found. Credit orders will appear here when settled
                  with the "Credit Sale" option in Kitchen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
