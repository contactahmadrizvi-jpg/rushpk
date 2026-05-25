"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, UtensilsCrossed, ShoppingBag, Package, Users,
  ClipboardList, BarChart3, Settings, Monitor, ChefHat, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RESTAURANT } from "@/constants";

const nav = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/admin/orders", icon: ShoppingBag, label: "Orders" },
  { href: "/admin/menu", icon: UtensilsCrossed, label: "Menu" },
  { href: "/admin/inventory", icon: Package, label: "Inventory" },
  { href: "/admin/employees", icon: Users, label: "Employees" },
  { href: "/admin/attendance", icon: Clock, label: "Attendance" },
  { href: "/admin/reports", icon: BarChart3, label: "Reports" },
  { href: "/pos", icon: Monitor, label: "POS" },
  { href: "/kitchen", icon: ChefHat, label: "Kitchen" },
  { href: "/admin/settings", icon: Settings, label: "Settings" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-card lg:flex">
      <div className="border-b p-6">
        <p className="font-bold text-primary">{RESTAURANT.name}</p>
        <p className="text-xs text-muted-foreground">Admin Panel</p>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent",
              pathname === item.href && "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
