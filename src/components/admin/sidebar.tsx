"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UtensilsCrossed,
  ShoppingBag,
  Package,
  Users,
  BarChart3,
  Settings,
  Monitor,
  ChefHat,
  Clock,
  Shield,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RESTAURANT } from "@/constants";
import { useAuthStore } from "@/stores/auth-store";
import { userHasPermission } from "@/lib/permissions";

const nav = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard", perm: "dashboard" },
  { href: "/admin/orders", icon: ShoppingBag, label: "Orders", perm: "orders" },
  { href: "/admin/menu", icon: UtensilsCrossed, label: "Menu", perm: "menu" },
  { href: "/admin/inventory", icon: Package, label: "Inventory", perm: "inventory" },
  { href: "/admin/employees", icon: Users, label: "Employees", perm: "employees" },
  { href: "/admin/roles", icon: Shield, label: "Roles", perm: "roles" },
  { href: "/admin/attendance", icon: Clock, label: "Attendance", perm: "attendance" },
  { href: "/admin/reports", icon: BarChart3, label: "Reports", perm: "reports" },
  { href: "/pos", icon: Monitor, label: "POS", perm: "pos" },
  { href: "/kitchen", icon: ChefHat, label: "Kitchen", perm: "kitchen" },
  { href: "/admin/settings", icon: Settings, label: "Settings", perm: "settings" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const profile = useAuthStore((s) => s.profile);

  const visible = nav.filter((item) => {
    if (item.perm === "orders") {
      return (
        userHasPermission(profile, "orders") ||
        userHasPermission(profile, "online_orders")
      );
    }
    return userHasPermission(profile, item.perm);
  });

  return (
    <nav className="flex-1 space-y-1 p-4">
      {visible.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
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
  );
}

export function AdminSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-card lg:flex">
      <div className="border-b p-6">
        <p className="font-bold text-primary">{RESTAURANT.name}</p>
        <p className="text-xs text-muted-foreground">Management</p>
      </div>
      <NavLinks />
    </aside>
  );
}

export function AdminMobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside className="absolute left-0 top-0 flex h-full w-[min(85vw,280px)] flex-col bg-card shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <p className="font-bold text-primary">{RESTAURANT.name}</p>
            <p className="text-xs text-muted-foreground">Menu</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <NavLinks onNavigate={onClose} />
      </aside>
    </div>
  );
}
