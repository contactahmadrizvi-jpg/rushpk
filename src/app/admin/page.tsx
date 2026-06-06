"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { userHasPermission } from "@/lib/permissions";
import RiderDashboard from "@/components/admin/RiderDashboard";
import { DollarSign, ShoppingBag, AlertTriangle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPendingKitchenOrders } from "@/lib/pos-instant";
import { getRevenueByHour } from "@/services/analytics.service";
import { subscribeOrders } from "@/services/orders.service";
import { getLowStockItems } from "@/services/inventory.service";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

const COLORS = ["#dc2f02", "#e85d04", "#f48c06", "#2d6a4f"];

function getRevenueByDay(orders: any[]) {
  const daysMap: Record<string, number> = {};
  orders.forEach((o) => {
    if (o.status === "cancelled") return;
    // Exclude credit sales from collected revenue
    if (o.paymentMethod === "credit" || o.paymentStatus === "credit") return;
    const d = new Date(o.createdAt);
    const key = d.toLocaleDateString("en-PK", { day: "2-digit", month: "short" });
    daysMap[key] = (daysMap[key] || 0) + o.total;
  });
  return Object.entries(daysMap)
    .map(([day, revenue]) => ({ day, revenue }))
    .sort((a, b) => new Date(a.day + " " + new Date().getFullYear()).getTime() - new Date(b.day + " " + new Date().getFullYear()).getTime());
}

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [hourData, setHourData] = useState<{ hour?: string; day?: string; revenue: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [localTrigger, setLocalTrigger] = useState(0);
  const [viewMode, setViewMode] = useState<"day" | "this_month" | "prev_month">("day");

  // Date selection state
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  const profile = useAuthStore((s) => s.profile);

  useEffect(() => {
    const onPending = () => setLocalTrigger((prev) => prev + 1);
    window.addEventListener("rush-pos-pending", onPending);
    window.addEventListener("storage", onPending);
    return () => {
      window.removeEventListener("rush-pos-pending", onPending);
      window.removeEventListener("storage", onPending);
    };
  }, []);

  useEffect(() => {
    setLoading(true);

    let start: Date;
    let end: Date;

    if (viewMode === "this_month") {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (viewMode === "prev_month") {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else {
      start = new Date(`${selectedDate}T00:00:00`);
      end = new Date(`${selectedDate}T23:59:59.999`);
    }

    // Subscribe to selected range orders
    const unsub = subscribeOrders((list) => {
      const pendingLocal = getPendingKitchenOrders();
      const syncedIds = new Set(list.map((o) => o.id));
      const localOnly = pendingLocal.filter((p) => !syncedIds.has(p.id));

      const isTodaySelected = () => {
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const todayStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        return selectedDate === todayStr && viewMode === "day";
      };

      const finalLocal = isTodaySelected() ? localOnly : [];
      const merged = [...finalLocal, ...list];

      setOrders(merged);

      if (viewMode === "day") {
        setHourData(getRevenueByHour(merged));
      } else {
        setHourData(getRevenueByDay(merged) as any);
      }
      setLoading(false);
    }, start.toISOString(), end.toISOString());

    // Fetch low stock items count
    getLowStockItems().then(items => setLowStockCount(items.length));

    return () => unsub();
  }, [selectedDate, viewMode, localTrigger]);

  if (loading) return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;

  // Compute dashboard metrics dynamically from loaded orders
  // Exclude credit orders from collected revenue (credit = unpaid debt, not actual income)
  const todayRevenue = orders
    .filter((o) => o.status !== "cancelled" && o.paymentMethod !== "credit" && o.paymentStatus !== "credit")
    .reduce((sum, o) => sum + o.total, 0);

  const creditOutstanding = orders
    .filter((o) => o.status !== "cancelled" && (o.paymentMethod === "credit" || o.paymentStatus === "credit"))
    .reduce((sum, o) => sum + o.total, 0);

  const pendingOrders = orders.filter(
    (o) => !["delivered", "served", "cancelled"].includes(o.status)
  ).length;

  const onlinePayments = orders
    .filter((o) => o.paymentMethod === "online" && o.paymentStatus === "paid")
    .reduce((sum, o) => sum + o.total, 0);

  const cashPayments = orders
    .filter((o) => o.paymentMethod === "cash")
    .reduce((sum, o) => sum + o.total, 0);

  const cardPayments = orders
    .filter((o) => o.paymentMethod === "card")
    .reduce((sum, o) => sum + o.total, 0);

  const cards = [
    { label: viewMode === "day" ? "Collected Revenue" : "Collected Revenue", value: formatCurrency(todayRevenue), icon: DollarSign },
    { label: viewMode === "day" ? "Selected Date Orders" : "Selected Period Orders", value: String(orders.filter(o => o.status !== "cancelled").length), icon: ShoppingBag },
    { label: "Pending Orders Count", value: String(pendingOrders), icon: TrendingUp },
    { label: "Low Stock Alert Items", value: String(lowStockCount), icon: AlertTriangle },
  ];

  const paymentData = [
    { name: "Cash", value: cashPayments },
    { name: "Online", value: onlinePayments },
    { name: "Card", value: cardPayments },
  ].filter(p => p.value > 0);

  // If no payment data exists, show dummy/empty structure
  const displayPaymentData = paymentData.length > 0 ? paymentData : [{ name: "No Sales", value: 1 }];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-muted-foreground">Select a range or date to view complete statistics and analytics.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as any)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm font-semibold text-stone-850"
          >
            <option value="day">Single Day</option>
            <option value="this_month">This Month</option>
            <option value="prev_month">Previous Month</option>
          </select>
          {viewMode === "day" && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm font-semibold text-stone-850"
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent><p className="text-2xl font-black">{c.value}</p></CardContent>
          </Card>
        ))}
      </div>
      {creditOutstanding > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-red-500">Credit Outstanding (Not Collected)</p>
            <p className="mt-1 text-2xl font-black text-red-600">{formatCurrency(creditOutstanding)}</p>
          </div>
          <p className="text-xs text-red-400 font-semibold max-w-[200px] text-right">This amount is owed by customers on credit — excluded from revenue.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base font-bold">{viewMode === "day" ? "Revenue by Hour" : "Revenue by Day"}</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourData}>
                <XAxis dataKey={viewMode === "day" ? "hour" : "day"} fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="revenue" fill="#dc2f02" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base font-bold">Payments Breakdown</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={displayPaymentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {displayPaymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => typeof v === "number" ? formatCurrency(v) : v} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
