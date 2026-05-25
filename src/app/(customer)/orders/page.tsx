"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { getOrdersByUser } from "@/services/orders.service";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Order } from "@/types";

export default function OrdersHistoryPage() {
  const { profile, loading } = useAuthStore();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!loading && !profile) router.replace("/login");
    if (profile) getOrdersByUser(profile.id).then(setOrders);
  }, [profile, loading, router]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Order History</h1>
      <div className="mt-6 space-y-3">
        {orders.map((o) => (
          <Link key={o.id} href={`/track/${o.id}`} className="block rounded-xl border p-4 hover:border-primary">
            <div className="flex justify-between">
              <span className="font-bold">{o.orderNumber}</span>
              <span className="text-primary">{formatCurrency(o.total)}</span>
            </div>
            <p className="text-sm text-muted-foreground">{formatDate(o.createdAt)} — {o.status}</p>
          </Link>
        ))}
        {!orders.length && <p className="text-muted-foreground">No orders yet</p>}
      </div>
    </div>
  );
}
