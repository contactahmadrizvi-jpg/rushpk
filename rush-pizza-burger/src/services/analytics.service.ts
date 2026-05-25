import type { Order, DashboardStats } from "@/types";
import { getTodayOrders } from "./orders.service";
import { getLowStockItems } from "./inventory.service";

export async function getDashboardStats(): Promise<DashboardStats> {
  const orders = await getTodayOrders();
  const lowStock = await getLowStockItems();

  const todayRevenue = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);

  const onlinePayments = orders
    .filter((o) => o.paymentMethod === "online" && o.paymentStatus === "paid")
    .reduce((sum, o) => sum + o.total, 0);

  const cashPayments = orders
    .filter((o) => o.paymentMethod === "cash")
    .reduce((sum, o) => sum + o.total, 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  return {
    todayRevenue,
    todayOrders: orders.length,
    monthlyRevenue: todayRevenue,
    pendingOrders: orders.filter(
      (o) => !["delivered", "served", "cancelled"].includes(o.status)
    ).length,
    lowStockCount: lowStock.length,
    onlinePayments,
    cashPayments,
  };
}

export function getBestSellers(orders: Order[], limit = 10) {
  const counts: Record<string, { name: string; qty: number; revenue: number }> =
    {};

  for (const order of orders) {
    for (const item of order.items) {
      if (!counts[item.menuItemId]) {
        counts[item.menuItemId] = {
          name: item.name,
          qty: 0,
          revenue: 0,
        };
      }
      counts[item.menuItemId]!.qty += item.quantity;
      counts[item.menuItemId]!.revenue += item.subtotal;
    }
  }

  return Object.entries(counts)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

export function getRevenueByHour(orders: Order[]) {
  const hours: Record<number, number> = {};
  for (let i = 0; i < 24; i++) hours[i] = 0;

  for (const order of orders) {
    const hour = new Date(order.createdAt).getHours();
    hours[hour] = (hours[hour] ?? 0) + order.total;
  }

  return Object.entries(hours).map(([hour, revenue]) => ({
    hour: `${hour}:00`,
    revenue,
  }));
}

export function getOrdersByType(orders: Order[]) {
  const types: Record<string, number> = {};
  for (const o of orders) {
    types[o.type] = (types[o.type] ?? 0) + 1;
  }
  return Object.entries(types).map(([type, count]) => ({ type, count }));
}
