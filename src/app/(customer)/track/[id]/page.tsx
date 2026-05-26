"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { subscribeOrderById } from "@/services/orders.service";
import {
  addTrackedOrder,
  isOrderComplete,
  removeTrackedOrder,
} from "@/lib/order-tracking";
import type { Order } from "@/types";
import { ORDER_STATUS_LABELS } from "@/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  { key: "received", label: "Order Received" },
  { key: "preparing", label: "Preparing" },
  { key: "in_kitchen", label: "In Kitchen" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

export default function TrackOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    addTrackedOrder(id);
    const unsub = subscribeOrderById(id, (found) => {
      setOrder(found);
      setLoading(false);
      if (found && isOrderComplete(found.status)) {
        removeTrackedOrder(found.id);
      }
    });
    return unsub;
  }, [id]);

  if (loading && !order) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8 text-center">
        <h1 className="text-xl font-bold">Order not found</h1>
        <Link href="/track" className="mt-4 inline-block text-primary hover:underline">
          View all tracked orders
        </Link>
      </div>
    );
  }

  const stepIndex = Math.max(
    0,
    STEPS.findIndex((s) => s.key === order.status)
  );
  const isDone = isOrderComplete(order.status);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Link href="/track" className="text-sm text-primary hover:underline">
        ← All active orders
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Order #{order.dailyOrderNumber ?? order.orderNumber}</h1>
      <p className="text-sm text-muted-foreground">Placed {formatDate(order.createdAt)}</p>
      <Badge className="mt-2">{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge>

      <div className="mt-8 space-y-5">
        {STEPS.map((step, i) => {
          const done = isDone || i <= stepIndex;
          const active = !isDone && i === stepIndex;
          return (
            <div key={step.key} className="flex gap-4">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2",
                  done ? "border-primary bg-primary text-primary-foreground" : "border-muted",
                  active && "ring-2 ring-primary/30"
                )}
              >
                {done ? <Check className="h-5 w-5" /> : i + 1}
              </div>
              <div>
                <p className="font-semibold">{step.label}</p>
                {active && (
                  <p className="text-sm text-primary">In progress</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl border bg-card p-4">
        <h2 className="font-bold">Order details</h2>
        <p className="mt-2 text-sm">
          <span className="text-muted-foreground">Customer:</span> {order.customerName}
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Phone:</span> {order.customerPhone}
        </p>
        {order.deliveryAddress && (
          <p className="mt-1 text-sm text-muted-foreground">
            {order.deliveryAddress.street}, {order.deliveryAddress.area},{" "}
            {order.deliveryAddress.city}
          </p>
        )}
        <ul className="mt-4 divide-y text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 py-2">
              <span>
                <span className="font-semibold">{item.quantity}×</span> {item.name}
              </span>
              <span className="shrink-0 font-medium">{formatCurrency(item.subtotal)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t pt-3 text-lg font-bold text-primary">
          <span>Total</span>
          <span>{formatCurrency(order.total)}</span>
        </div>
      </div>
    </div>
  );
}
