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
  X,
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

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 p-4">
      {nav.map((item) => (
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
