import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { subscribeDeliveryOrders, updateOrderStatus } from "@/services/orders.service";
import type { Order } from "@/types";
import { Phone, MapPin, Check, Truck, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS } from "@/constants";
import { toast } from "sonner";

export function RiderDeliveries() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeDeliveryOrders((data) => {
      setOrders(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function handleUpdateStatus(orderId: string, newStatus: Order["status"]) {
    try {
      await updateOrderStatus(orderId, newStatus);
      toast.success(`Order marked as ${ORDER_STATUS_LABELS[newStatus]}`);
    } catch (e) {
      toast.error("Failed to update status");
    }
  }

  function openMaps(address: string) {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, "_blank");
  }

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center h-screen bg-stone-50">
        <div className="text-primary font-semibold animate-pulse">Loading deliveries...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      <header className="bg-primary px-4 py-4 text-primary-foreground shadow-md sticky top-0 z-10 flex items-center justify-between">
        <h2 className="text-xl font-bold">Rider Deliveries</h2>
      </header>
      <main className="p-4 space-y-4 max-w-lg mx-auto">
        {orders.length === 0 ? (
          <div className="text-center mt-12 text-stone-400">
            <Truck className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="font-semibold text-xl text-stone-600">No active deliveries</p>
            <p className="text-sm mt-1">All clear! 🎉</p>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
              <div className="bg-stone-100 px-4 py-3 border-b flex items-center justify-between">
                <div>
                  <span className="font-black text-lg">#{order.dailyOrderNumber ?? order.orderNumber}</span>
                  <span className="text-xs font-semibold text-stone-500 block">{formatDate(order.createdAt)}</span>
                </div>
                <Badge className="font-bold uppercase tracking-wider text-[10px]" variant={order.status === 'ready' ? 'default' : order.status === 'out_for_delivery' ? 'warning' : 'secondary'}>
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </Badge>
              </div>

              <div className="p-4 space-y-4">
                <div className="flex gap-3 items-start">
                  <div className="mt-0.5 p-2 bg-primary/10 rounded-full"><Phone className="h-4 w-4 text-primary" /></div>
                  <div className="flex-1">
                    <p className="font-bold text-stone-900">{order.customerName}</p>
                    <a href={`tel:${order.customerPhone}`} className="text-primary font-semibold text-sm hover:underline">{order.customerPhone}</a>
                  </div>
                </div>
                {order.deliveryAddress && (
                  <div className="flex gap-3 items-start">
                    <div className="mt-0.5 p-2 bg-primary/10 rounded-full"><MapPin className="h-4 w-4 text-primary" /></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-stone-700 leading-snug">
                        {order.deliveryAddress.street}, {order.deliveryAddress.area}, {order.deliveryAddress.city}
                      </p>
                      {order.deliveryNotes && (
                        <p className="mt-1.5 text-xs font-bold text-amber-700 bg-amber-50 p-2 rounded-md">Note: {order.deliveryNotes}</p>
                      )}
                    </div>
                    <Button size="icon" variant="outline" className="shrink-0" onClick={() => openMaps(`${order.deliveryAddress?.street}, ${order.deliveryAddress?.area}, ${order.deliveryAddress?.city}`)}>
                      <Navigation className="h-4 w-4 text-blue-600" />
                    </Button>
                  </div>
                )}
                <div className="pt-3 border-t border-stone-100">
                  <p className="text-[10px] font-black text-stone-400 uppercase mb-2 tracking-widest">Order Items</p>
                  <ul className="text-sm space-y-1.5">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex justify-between">
                        <span className="text-stone-700 font-medium">
                          <span className="font-black text-stone-900">{item.quantity}×</span> {item.name} {item.customization?.variantName ? `(${item.customization.variantName})` : ""}
                        </span>
                        <span className="shrink-0 font-black text-lg text-primary">{formatCurrency(item.subtotal)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex justify-between items-center bg-stone-50 p-2 rounded-lg border border-stone-100">
                    <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Total to Collect</span>
                    <span className="font-black text-2xl text-primary">{formatCurrency(order.total)}</span>
                  </div>
                </div>
                <div className="pt-2 flex gap-2">
                  {(order.status === "ready" || order.status === "preparing" || order.status === "in_kitchen" || order.status === "pending" || order.status === "received") && (
                    <Button className="flex-1 h-12 font-bold text-base" onClick={() => handleUpdateStatus(order.id, "out_for_delivery")} disabled={order.status !== "ready"} variant={order.status === "ready" ? "default" : "secondary"}>
                      <Truck className="h-5 w-5 mr-2" />
                      {order.status === "ready" ? "Start Delivery" : "Waiting for Kitchen"}
                    </Button>
                  )}
                  {order.status === "out_for_delivery" && (
                    <Button className="flex-1 h-12 font-bold text-base bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20" onClick={() => handleUpdateStatus(order.id, "delivered")}>
                      <Check className="h-5 w-5 mr-2" /> Mark Delivered
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
