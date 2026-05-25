"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getActiveTrackedOrders } from "@/lib/order-tracking";
import { getOrderById } from "@/services/orders.service";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/constants";
import type { Order } from "@/types";
import { Badge } from "@/components/ui/badge";

export default function TrackOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refs = getActiveTrackedOrders();
    if (!refs.length) {
      setLoading(false);
      return;
    }
    Promise.all(refs.map((r) => getOrderById(r.orderId)))
      .then((list) => setOrders(list.filter(Boolean) as Order[]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold">Track your orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Active orders stay here until delivered.
      </p>

      {loading ? (
        <p className="mt-8 text-muted-foreground">Loading...</p>
      ) : orders.length === 0 ? (
        <div className="mt-10 rounded-2xl border bg-card p-8 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-4 font-medium">No active orders</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Place an order online and it will appear here automatically.
          </p>
          <Link href="/menu" className="mt-6 inline-block">
            <Button>Order now</Button>
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/track/${o.id}`}
              className="block rounded-xl border bg-card p-4 transition hover:border-primary"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">Order #{o.dailyOrderNumber ?? o.orderNumber}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(o.createdAt)}</p>
                  <p className="mt-1 text-sm">{o.items.length} items · {formatCurrency(o.total)}</p>
                </div>
                <Badge>{ORDER_STATUS_LABELS[o.status] ?? o.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
