"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, User, Menu as MenuIcon, Moon, Sun, X, Package } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCartStore } from "@/stores/cart-store";
import { useAuthStore } from "@/stores/auth-store";
import { getActiveTrackedOrders } from "@/lib/order-tracking";
import { cn } from "@/lib/utils";
import { RESTAURANT } from "@/constants";

const links = [
  { href: "/home", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/deals", label: "Deals" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function CustomerHeader() {
  const pathname = usePathname();
  const count = useCartStore((s) => s.getItemCount());
  const profile = useAuthStore((s) => s.profile);
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [trackedCount, setTrackedCount] = useState(0);

  useEffect(() => {
    const update = () => setTrackedCount(getActiveTrackedOrders().length);
    update();
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 lg:px-8">
          <Link href="/home" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-black text-primary-foreground">
              R
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold leading-tight">{RESTAURANT.name}</p>
              <p className="text-xs text-muted-foreground">{RESTAURANT.location}</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent",
                  pathname === l.href && "bg-accent text-accent-foreground"
                )}
              >
                {l.label}
              </Link>
            ))}
            {trackedCount > 0 && (
              <Link
                href="/track"
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-primary hover:bg-accent"
              >
                <Package className="h-4 w-4" />
                Track ({trackedCount})
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Link href={profile ? "/profile" : "/login"}>
              <Button variant="ghost" size="icon">
                <User className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="/cart" className="relative">
              <Button size="icon" className="rounded-xl">
                <ShoppingBag className="h-5 w-5" />
              </Button>
              {count > 0 && (
                <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center px-1 text-[10px]">
                  {count}
                </Badge>
              )}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <MenuIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute right-0 top-0 flex h-full w-[min(85vw,300px)] flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between border-b p-4">
              <span className="font-bold">Menu</span>
              <button type="button" onClick={() => setMobileOpen(false)} className="p-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-4">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-lg px-4 py-3 font-medium",
                    pathname === l.href && "bg-primary text-primary-foreground"
                  )}
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/track"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-lg px-4 py-3 font-medium text-primary"
              >
                <Package className="h-4 w-4" />
                Track order{trackedCount > 0 ? ` (${trackedCount})` : ""}
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
