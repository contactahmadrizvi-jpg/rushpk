"use client";

import { useEffect, useState } from "react";
import { subscribeOrders } from "@/services/orders.service";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS } from "@/constants";
import { useAuthStore } from "@/stores/auth-store";
import { canViewOrders, ordersFilterForUser } from "@/lib/permissions";
import type { Order } from "@/types";
import { OrderListSkeleton } from "@/components/ui/loading-skeletons";

export default function AdminOrdersPage() {
  const profile = useAuthStore((s) => s.profile);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const filter = ordersFilterForUser(profile);

  useEffect(() => {
    if (filter === "none") {
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeOrders((list) => {
      if (filter === "online") {
        setOrders(list.filter((o) => o.source === "website"));
      } else {
        setOrders(list);
      }
      setLoading(false);
    });
  }, [filter]);

  if (!canViewOrders(profile)) {
    return <p className="text-muted-foreground">No access to orders.</p>;
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="mt-6">
          <OrderListSkeleton count={5} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Orders</h1>
      <p className="text-sm text-muted-foreground">{orders.length} total</p>
      <div className="mt-6 space-y-4">
        {orders.map((o) => (
          <div key={o.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-lg">
                  Order #{o.dailyOrderNumber ?? o.orderNumber}
                </p>
                <p className="text-sm">
                  {o.customerName} · {o.customerPhone}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(o.createdAt)}
                </p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {o.type.replace("_", " ")} · {o.source}
                </p>
              </div>
              <div className="text-right">
                <Badge>{ORDER_STATUS_LABELS[o.status] ?? o.status}</Badge>
                <p className="mt-2 text-xl font-bold text-primary">
                  {formatCurrency(o.total)}
                </p>
              </div>
            </div>
            <ul className="mt-4 divide-y rounded-lg border bg-muted/30 text-sm">
              {o.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-3 py-2"
                >
                  <span>
                    <span className="font-bold">{item.quantity}×</span> {item.name}
                  </span>
                  <span className="shrink-0 font-medium">
                    {formatCurrency(item.subtotal)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!orders.length && (
          <p className="py-12 text-center text-muted-foreground">No orders yet</p>
        )}
      </div>
    </div>
  );
}
