"use client";

import { useEffect, useState } from "react";
import { subscribeOrders } from "@/services/orders.service";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Order } from "@/types";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => subscribeOrders(setOrders), []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Orders</h1>
      <div className="mt-6 space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
            <div>
              <p className="font-bold">Order #{o.dailyOrderNumber ?? o.orderNumber}</p>
              <p className="text-sm">{o.customerName} • {o.customerPhone}</p>
              <p className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</p>
            </div>
            <Badge>{o.status}</Badge>
            <p className="font-bold text-primary">{formatCurrency(o.total)}</p>
          </div>
        ))}
        {!orders.length && <p className="text-muted-foreground">No orders yet</p>}
      </div>
    </div>
  );
}
