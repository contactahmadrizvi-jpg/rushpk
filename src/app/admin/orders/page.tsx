"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { subscribeOrders, deleteOrder } from "@/services/orders.service";
import { getPendingKitchenOrders } from "@/lib/pos-instant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS } from "@/constants";
import { useAuthStore } from "@/stores/auth-store";
import { canViewOrders, ordersFilterForUser } from "@/lib/permissions";
import type { Order } from "@/types";
import { OrderListSkeleton } from "@/components/ui/loading-skeletons";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

function AdminOrdersContent() {
  const profile = useAuthStore((s) => s.profile);
  const searchParams = useSearchParams();
  const filter = ordersFilterForUser(profile);
  const isAdminOrManager = profile && ["super_admin", "admin", "manager"].includes(profile.role);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Set tab dynamically based on URL parameter (?tab=pending)
  const [activeTab, setActiveTab] = useState<"all" | "pending">("all");

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    setActiveTab(tabParam === "pending" ? "pending" : "all");
  }, [searchParams]);

  useEffect(() => {
    if (filter === "none") {
      setLoading(false);
      return;
    }
    setLoading(true);

    let remoteList: Order[] = [];

    const apply = (remote: Order[]) => {
      let filteredRemote = remote;
      if (filter === "online") {
        filteredRemote = remote.filter((o) => o.source === "website");
      }

      const pendingLocal = getPendingKitchenOrders();
      const syncedIds = new Set(filteredRemote.map((o) => o.id));
      const localOnly = pendingLocal.filter((p) => !syncedIds.has(p.id));

      const isTodaySelected = () => {
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const todayStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        return selectedDate === todayStr;
      };

      const finalLocal = isTodaySelected() ? localOnly : [];
      const merged = [...finalLocal, ...filteredRemote].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setOrders(merged);
      setLoading(false);
    };

    const start = new Date(`${selectedDate}T00:00:00`);
    const end = new Date(`${selectedDate}T23:59:59.999`);

    const unsub = subscribeOrders((list) => {
      remoteList = list;
      apply(list);
    }, start.toISOString(), end.toISOString());

    const onPending = () => apply(remoteList);
    window.addEventListener("rush-pos-pending", onPending);
    window.addEventListener("storage", onPending);

    return () => {
      unsub();
      window.removeEventListener("rush-pos-pending", onPending);
      window.removeEventListener("storage", onPending);
    };
  }, [filter, selectedDate]);

  if (!canViewOrders(profile)) {
    return <p className="text-muted-foreground">No access to orders.</p>;
  }

  const isPending = (o: Order) => !["delivered", "served", "cancelled"].includes(o.status);
  const allCount = orders.length;
  const pendingCount = orders.filter(isPending).length;
  const displayedOrders = activeTab === "all" ? orders : orders.filter(isPending);

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Orders</h1>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="mt-6">
          <OrderListSkeleton count={5} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{activeTab === "pending" ? "Pending Orders" : "All Orders"}</h1>
          <p className="text-sm text-muted-foreground">{activeTab === "pending" ? `${pendingCount} pending` : `${allCount} total`} for this date</p>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm font-semibold text-stone-800"
        />
      </div>

      {/* Tabs */}
      <div className="mt-6 flex border-b">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
            activeTab === "all"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          All Orders ({allCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("pending")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
            activeTab === "pending"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Pending Orders ({pendingCount})
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {displayedOrders.map((o) => (
          <div key={o.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-lg text-stone-900">
                  Order #{o.dailyOrderNumber ?? o.orderNumber}
                </p>
                <p className="text-sm text-stone-700">
                  {o.customerName} · {o.customerPhone}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(o.createdAt)}
                </p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {o.type.replace("_", " ")} · {o.source}
                </p>
              </div>
              <div className="text-right flex flex-col items-end">
                <Badge>{ORDER_STATUS_LABELS[o.status] ?? o.status}</Badge>
                <p className="mt-2 text-xl font-bold text-primary">
                  {formatCurrency(o.total)}
                </p>
                {isAdminOrManager && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm(`Delete Order #${o.dailyOrderNumber ?? o.orderNumber}? This will restore inventory.`)) {
                        // Optimistic: remove from UI instantly
                        setOrders((prev) => prev.filter((item) => item.id !== o.id));
                        try {
                          await deleteOrder(o.id);
                          toast.success(`Order #${o.dailyOrderNumber ?? o.orderNumber} deleted`);
                        } catch (err: any) {
                          // If Firestore delete failed, put the order back
                          toast.error(err?.message || "Failed to delete order. Check your permissions.");
                        }
                      }
                    }}
                    className="mt-2 flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition active:scale-95"
                    title="Delete Order"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <ul className="mt-4 divide-y rounded-lg border bg-muted/30 text-sm">
              {o.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-3 py-2 text-stone-850 font-medium"
                >
                  <span>
                    <span className="font-bold text-stone-900">{item.quantity}×</span> {item.name} {item.customization?.variantName ? `(${item.customization.variantName})` : ""}
                  </span>
                  <span className="shrink-0 font-bold text-stone-900">
                    {formatCurrency(item.subtotal)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!displayedOrders.length && (
          <p className="py-12 text-center text-muted-foreground">No orders yet</p>
        )}
      </div>
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<div>Loading orders dashboard...</div>}>
      <AdminOrdersContent />
    </Suspense>
  );
}
