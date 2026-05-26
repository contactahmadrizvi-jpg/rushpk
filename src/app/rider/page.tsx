"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatDate, parseDate } from "@/lib/utils";
import { subscribeDeliveryOrders, updateOrderStatus } from "@/services/orders.service";
import type { Order } from "@/types";
import { Phone, MapPin, Check, Truck, LogOut, Navigation, Clock, ChefHat, Package, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS } from "@/constants";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { logoutUser } from "@/services/auth.service";
import { useRouter } from "next/navigation";

function getElapsedMinutes(createdAt: string): number {
  const created = parseDate(createdAt)?.getTime() ?? Date.now();
  return Math.floor((Date.now() - created) / 60000);
}

function KitchenStatusIndicator({ order }: { order: Order }) {
  const kitchenStatus = order.kitchenStatus ?? "new";

  if (kitchenStatus === "ready" || order.status === "ready") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border-2 border-emerald-400 px-4 py-3 animate-pulse">
        <div className="p-1.5 bg-emerald-500 rounded-full">
          <Package className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-black text-emerald-800 uppercase tracking-wide">🟢 Go Pickup!</p>
          <p className="text-[11px] font-medium text-emerald-600">Kitchen has marked this order ready</p>
        </div>
      </div>
    );
  }

  if (kitchenStatus === "preparing") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-300 px-4 py-3">
        <div className="p-1.5 bg-amber-500 rounded-full">
          <ChefHat className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-amber-800">🍳 Kitchen Preparing</p>
          <p className="text-[11px] font-medium text-amber-600">Order is being cooked</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
      <div className="p-1.5 bg-blue-500 rounded-full">
        <Clock className="h-4 w-4 text-white" />
      </div>
      <div>
        <p className="text-sm font-bold text-blue-800">⏳ Waiting for Kitchen</p>
        <p className="text-[11px] font-medium text-blue-600">Order not started yet</p>
      </div>
    </div>
  );
}

export default function RiderDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const profile = useAuthStore((s) => s.profile);
  const router = useRouter();

  useEffect(() => {
    const unsub = subscribeDeliveryOrders((data) => {
      setOrders(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Update elapsed time every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  async function handleUpdateStatus(orderId: string, newStatus: Order["status"]) {
    try {
      await updateOrderStatus(orderId, newStatus);
      toast.success(`Order marked as ${ORDER_STATUS_LABELS[newStatus]}`);
    } catch (e) {
      toast.error("Failed to update status");
    }
  }

  async function handleLogout() {
    await logoutUser();
    useAuthStore.getState().setProfile(null);
    router.push("/login");
  }

  function openMaps(address: string) {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
  }

  const readyOrders = orders.filter((o) => (o.kitchenStatus === "ready" || o.status === "ready") && o.status !== "out_for_delivery");
  const activeDeliveries = orders.filter((o) => o.status === "out_for_delivery");
  const waitingOrders = orders.filter(
    (o) => o.status !== "out_for_delivery" && o.kitchenStatus !== "ready" && o.status !== "ready"
  );

  if (loading) {
    return <div className="p-4 flex items-center justify-center h-screen bg-stone-50">
      <div className="text-primary font-semibold animate-pulse">Loading deliveries...</div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      <header className="bg-primary px-4 py-4 text-primary-foreground shadow-md sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Rider Dashboard</h1>
          <p className="text-xs opacity-90">Welcome, {profile?.displayName || "Rider"}</p>
        </div>
        <div className="flex items-center gap-3">
          {readyOrders.length > 0 && (
            <div className="bg-emerald-500 text-white rounded-full px-3 py-1 text-xs font-black animate-bounce shadow-lg">
              {readyOrders.length} PICKUP{readyOrders.length > 1 ? "S" : ""}
            </div>
          )}
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-2 p-3 max-w-lg mx-auto">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-emerald-700">{readyOrders.length}</p>
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Ready</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-blue-700">{activeDeliveries.length}</p>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Delivering</p>
        </div>
        <div className="bg-stone-100 border border-stone-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-stone-700">{waitingOrders.length}</p>
          <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Waiting</p>
        </div>
      </div>

      <main className="p-4 space-y-6 max-w-lg mx-auto">
        {orders.length === 0 ? (
          <div className="text-center mt-12 text-stone-400">
            <Truck className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="font-semibold text-xl text-stone-600">No active deliveries</p>
            <p className="text-sm mt-1">You're all caught up! Great job.</p>
          </div>
        ) : (
          <>
            {/* Ready for Pickup Section */}
            {readyOrders.length > 0 && (
              <div>
                <h2 className="text-xs font-black text-emerald-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Ready for Pickup ({readyOrders.length})
                </h2>
                <div className="space-y-4">
                  {readyOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onUpdateStatus={handleUpdateStatus}
                      onOpenMaps={openMaps}
                      highlight="ready"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Active Deliveries Section */}
            {activeDeliveries.length > 0 && (
              <div>
                <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5" />
                  Active Deliveries ({activeDeliveries.length})
                </h2>
                <div className="space-y-4">
                  {activeDeliveries.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onUpdateStatus={handleUpdateStatus}
                      onOpenMaps={openMaps}
                      highlight="delivering"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Waiting for Kitchen Section */}
            {waitingOrders.length > 0 && (
              <div>
                <h2 className="text-xs font-black text-stone-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  Waiting for Kitchen ({waitingOrders.length})
                </h2>
                <div className="space-y-4">
                  {waitingOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onUpdateStatus={handleUpdateStatus}
                      onOpenMaps={openMaps}
                      highlight="waiting"
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function OrderCard({
  order,
  onUpdateStatus,
  onOpenMaps,
  highlight,
}: {
  order: Order;
  onUpdateStatus: (id: string, status: Order["status"]) => void;
  onOpenMaps: (address: string) => void;
  highlight: "ready" | "delivering" | "waiting";
}) {
  const elapsed = getElapsedMinutes(order.createdAt);
  const isOnline = order.source === "website";
  const isReady = order.kitchenStatus === "ready" || order.status === "ready";

  const borderClass =
    highlight === "ready"
      ? "border-emerald-400 shadow-emerald-100 shadow-lg"
      : highlight === "delivering"
      ? "border-blue-400 shadow-blue-100 shadow-md"
      : "border-stone-200";

  return (
    <div className={`bg-white rounded-2xl border-2 overflow-hidden ${borderClass}`}>
      {/* Header */}
      <div className="bg-stone-100 px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-black text-lg">#{order.dailyOrderNumber ?? order.orderNumber}</span>
          {isOnline && (
            <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase">
              <Globe className="h-3 w-3" /> Website
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-lg px-2 py-1 font-mono text-xs font-bold ${
              elapsed > 30
                ? "bg-red-100 text-red-700"
                : elapsed > 15
                ? "bg-amber-100 text-amber-800"
                : "bg-stone-200 text-stone-600"
            }`}
          >
            {elapsed}m ago
          </span>
          <Badge
            className="font-bold uppercase tracking-wider text-[10px]"
            variant={
              order.status === "ready"
                ? "default"
                : order.status === "out_for_delivery"
                ? "warning"
                : "secondary"
            }
          >
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </Badge>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Kitchen Status Sync Indicator */}
        {order.status !== "out_for_delivery" && <KitchenStatusIndicator order={order} />}

        {/* Customer Info */}
        <div className="flex gap-3 items-start">
          <div className="mt-0.5 p-2 bg-primary/10 rounded-full"><Phone className="h-4 w-4 text-primary" /></div>
          <div className="flex-1">
            <p className="font-bold text-stone-900">{order.customerName}</p>
            <a href={`tel:${order.customerPhone}`} className="text-primary font-semibold text-sm hover:underline">{order.customerPhone}</a>
          </div>
        </div>

        {/* Delivery Address */}
        {order.deliveryAddress && (
          <div className="flex gap-3 items-start">
            <div className="mt-0.5 p-2 bg-primary/10 rounded-full"><MapPin className="h-4 w-4 text-primary" /></div>
            <div className="flex-1">
              <p className="text-sm font-medium text-stone-700 leading-snug">
                {order.deliveryAddress.street}, {order.deliveryAddress.area}, {order.deliveryAddress.city}
              </p>
              {order.deliveryNotes && (
                <p className="mt-1.5 text-xs font-bold text-amber-700 bg-amber-50 p-2 rounded-md">
                  Note: {order.deliveryNotes}
                </p>
              )}
            </div>
            <Button size="icon" variant="outline" className="shrink-0" onClick={() => onOpenMaps(`${order.deliveryAddress?.street}, ${order.deliveryAddress?.area}, ${order.deliveryAddress?.city}`)}>
              <Navigation className="h-4 w-4 text-blue-600" />
            </Button>
          </div>
        )}

        {/* Order Time */}
        <div className="flex gap-3 items-center">
          <div className="p-2 bg-primary/10 rounded-full"><Clock className="h-4 w-4 text-primary" /></div>
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Order Time</p>
            <p className="text-sm font-semibold text-stone-700">{formatDate(order.createdAt)}</p>
          </div>
        </div>

        {/* Items */}
        <div className="pt-3 border-t border-stone-100">
          <p className="text-[10px] font-black text-stone-400 uppercase mb-2 tracking-widest">Order Items</p>
          <ul className="text-sm space-y-1.5">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between">
                <span className="text-stone-700 font-medium">
                  <span className="font-black text-stone-900">{item.quantity}×</span> {item.name} {item.customization?.variantName ? `(${item.customization.variantName})` : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between items-center bg-stone-50 p-2 rounded-lg border border-stone-100">
             <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Total to Collect</span>
             <span className="font-black text-lg text-primary">{formatCurrency(order.total)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex gap-2">
          {(order.status === "ready" || order.status === "preparing" || order.status === "in_kitchen" || order.status === "pending" || order.status === "received") && (
            <Button 
              className={`flex-1 h-12 font-bold text-base ${
                isReady
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20"
                  : ""
              }`}
              onClick={() => onUpdateStatus(order.id, "out_for_delivery")}
              disabled={!isReady}
              variant={isReady ? "default" : "secondary"}
            >
              {isReady ? (
                <>
                  <Package className="h-5 w-5 mr-2" /> Go Pickup & Deliver
                </>
              ) : (
                <>
                  <ChefHat className="h-5 w-5 mr-2" /> Waiting for Kitchen
                </>
              )}
            </Button>
          )}
          {order.status === "out_for_delivery" && (
            <Button 
              className="flex-1 h-12 font-bold text-base bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20" 
              onClick={() => onUpdateStatus(order.id, "delivered")}
            >
              <Check className="h-5 w-5 mr-2" /> Mark Delivered
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
