"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { userHasPermission } from "@/lib/permissions";
import RiderDashboard from "@/components/admin/RiderDashboard";
import { DollarSign, ShoppingBag, AlertTriangle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardStats, getBestSellers, getRevenueByHour } from "@/services/analytics.service";
import { getTodayOrders } from "@/services/orders.service";
import { formatCurrency } from "@/lib/utils";
import type { DashboardStats } from "@/types";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

const COLORS = ["#dc2f02", "#e85d04", "#f48c06", "#2d6a4f"];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [hourData, setHourData] = useState<{ hour: string; revenue: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ Hook must be called unconditionally — before any early returns
  const profile = useAuthStore((s) => s.profile);
  const showRider = profile && (profile.role === "delivery_rider" || userHasPermission(profile, "delivery"));

  useEffect(() => {
    Promise.all([getDashboardStats(), getTodayOrders()]).then(([s, orders]) => {
      setStats(s);
      setHourData(getRevenueByHour(orders));
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;

  const cards = [
    { label: "Today Revenue", value: formatCurrency(stats?.todayRevenue ?? 0), icon: DollarSign },
    { label: "Today Orders", value: String(stats?.todayOrders ?? 0), icon: ShoppingBag },
    { label: "Pending Orders", value: String(stats?.pendingOrders ?? 0), icon: TrendingUp },
    { label: "Low Stock", value: String(stats?.lowStockCount ?? 0), icon: AlertTriangle },
  ];

  const paymentData = [
    { name: "Cash", value: stats?.cashPayments ?? 0 },
    { name: "Online", value: stats?.onlinePayments ?? 0 },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">Live overview — Rush Pizza & Burger</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{c.value}</p></CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Revenue by Hour</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourData}>
                <XAxis dataKey="hour" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="revenue" fill="#dc2f02" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Payments Today</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paymentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      {showRider && (
        <section className="mt-12">
          <RiderDashboard />
        </section>
      )}
    </div>
  );
}
