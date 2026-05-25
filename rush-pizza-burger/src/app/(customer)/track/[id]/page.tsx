"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { getOrderById } from "@/services/orders.service";
import { ordersRepo } from "@/services/orders.service";
import type { Order } from "@/types";
import { ORDER_STATUS_LABELS } from "@/constants";
import { Skeleton } from "@/components/ui/skeleton";

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

  useEffect(() => {
    if (!id) return;
    getOrderById(id).then(setOrder);
    const unsub = ordersRepo.subscribe([], (orders) => {
      const found = orders.find((o) => o.id === id);
      if (found) setOrder(found);
    });
    return unsub;
  }, [id]);

  if (!order) return <div className="mx-auto max-w-lg p-8"><Skeleton className="h-64 w-full" /></div>;

  const stepIndex = STEPS.findIndex((s) => s.key === order.status);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold">Track Order</h1>
      <p className="text-muted-foreground">Order #{order.dailyOrderNumber ?? order.orderNumber}</p>
      <div className="mt-8 space-y-6">
        {STEPS.map((step, i) => {
          const done = i <= stepIndex || order.status === "delivered";
          return (
            <div key={step.key} className="flex gap-4">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-full border-2", done ? "border-primary bg-primary text-primary-foreground" : "border-muted")}>
                {done ? <Check className="h-5 w-5" /> : i + 1}
              </div>
              <div>
                <p className="font-semibold">{step.label}</p>
                <p className="text-sm text-muted-foreground">{ORDER_STATUS_LABELS[step.key]}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-8 rounded-2xl border p-4">
        <p className="font-bold">{order.customerName}</p>
        <p className="text-sm text-muted-foreground">{order.customerPhone}</p>
        <p className="mt-4 text-xl font-bold text-primary">{formatCurrency(order.total)}</p>
      </div>
    </div>
  );
}
