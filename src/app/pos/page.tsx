"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MenuItemImage } from "@/components/menu-item-image";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, Trash2, Banknote, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { usePOSStore } from "@/stores/pos-store";
import { subscribeMenuItems, getActiveCategories } from "@/services/menu.service";
import type { CreateOrderInput } from "@/services/orders.service";
import { preloadPrintHeader, printPosDocuments } from "@/lib/print";
import { buildInstantPosOrder } from "@/lib/pos-instant";
import { startPosSyncWorker } from "@/services/pos-sync.service";
import { formatCurrency, cn } from "@/lib/utils";
import type { MenuItem, OrderItem, OrderType, MenuCategory } from "@/types";
import { useAuthStore } from "@/stores/auth-store";
import { userHasPermission } from "@/lib/permissions";
import { RESTAURANT } from "@/constants";

const CATEGORY_SHORT: Record<string, string> = {
  "cat-shawarma": "Shawarma",
  "cat-wraps": "Wraps",
  "cat-beef-burger": "Beef",
  "cat-chicken-burger": "Chicken",
  "cat-paratha": "Paratha",
  "cat-sides": "Sides",
  "cat-pizza": "Pizza",
  "cat-premium-pizza": "Premium",
};

export default function POSPage() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [paying, setPaying] = useState(false);

  const {
    items,
    orderType,
    customerName,
    customerPhone,
    tableNumber,
    discount,
    setOrderType,
    setCustomer,
    setTableNumber,
    addItem,
    removeItem,
    updateQty,
    clearOrder,
    getSubtotal,
  } = usePOSStore();

  useEffect(() => {
    if (profile && !userHasPermission(profile, "pos") && !userHasPermission(profile, "*")) {
      router.replace("/admin");
      return;
    }
    preloadPrintHeader();
    const stopSync = startPosSyncWorker();
    getActiveCategories().then((cats) => {
      setCategories(cats);
      setActiveCategory((prev) => prev || cats[0]?.id || "");
    });
    const unsub = subscribeMenuItems(setMenu);
    return () => {
      unsub();
      stopSync();
    };
  }, [profile, router]);

  const filtered = useMemo(() => {
    let list = menu;
    if (activeCategory) list = list.filter((m) => m.categoryId === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q));
    }
    return list;
  }, [menu, activeCategory, search]);

  const subtotal = getSubtotal();
  const total = subtotal - discount;
  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  const placeOrder = useCallback(() => {
    if (paying) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error("Enter customer name and phone");
      return;
    }
    if (!items.length) {
      toast.error("Add items to cart");
      return;
    }

    setPaying(true);

    const orderItems: OrderItem[] = items.map((line, i) => ({
      id: `pos-${i}`,
      menuItemId: line.menuItem.id,
      name: line.menuItem.name,
      price: line.unitPrice,
      quantity: line.quantity,
      customization: line.customization,
      subtotal: line.subtotal,
    }));

    const input: CreateOrderInput = {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      type: orderType,
      items: orderItems,
      subtotal,
      tax: 0,
      deliveryCharge: 0,
      discount,
      total,
      paymentMethod: "cash",
      tableNumber,
      source: "pos",
      createdBy: profile?.id,
    };

    const { order } = buildInstantPosOrder(input);
    const num = order.dailyOrderNumber ?? order.orderNumber;

    clearOrder();
    setPaying(false);
    toast.success(`Order #${num}`);

    requestAnimationFrame(() => {
      void printPosDocuments(order);
    });
  }, [
    paying,
    items,
    customerName,
    customerPhone,
    orderType,
    subtotal,
    discount,
    total,
    tableNumber,
    profile,
    clearOrder,
  ]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        placeOrder();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [placeOrder]);

  return (
    <div className="flex h-screen flex-col bg-neutral-100">
      <header className="shrink-0 border-b bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <Link href="/admin" className="text-xs text-neutral-500">
            ← Back
          </Link>
          <span className="font-bold">{RESTAURANT.name}</span>
          <Badge>{cartCount}</Badge>
        </div>
        <div className="mt-2 flex gap-1">
          {(["dine_in", "takeaway", "delivery"] as OrderType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={cn(
                "flex-1 rounded-lg py-2 text-xs font-bold",
                orderType === t ? "bg-primary text-white" : "bg-neutral-100"
              )}
            >
              {t === "dine_in" ? "Dine in" : t === "takeaway" ? "Takeaway" : "Delivery"}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setActiveCategory(cat.id);
                setSearch("");
              }}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-xs font-bold",
                activeCategory === cat.id ? "bg-primary text-white" : "bg-neutral-100"
              )}
            >
              {CATEGORY_SHORT[cat.id] ?? cat.name}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section className="flex min-h-0 flex-1 flex-col bg-white md:min-w-0">
          <div className="border-b p-2">
            <Label htmlFor="pos-search" className="text-xs">
              Search items
            </Label>
            <div className="relative mt-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                id="pos-search"
                className="h-9 pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-2 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addItem(item)}
                className="rounded-xl border p-2 text-left active:bg-primary/5"
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-neutral-100">
                  <MenuItemImage src={item.imageUrl} alt={item.name} fill />
                </div>
                <p className="mt-2 line-clamp-2 text-xs font-bold">{item.name}</p>
                <p className="text-sm font-black text-primary">{formatCurrency(item.price)}</p>
              </button>
            ))}
          </div>
        </section>

        <aside className="flex max-h-[45vh] flex-col border-t bg-white md:max-h-none md:w-80 md:shrink-0 md:border-l md:border-t-0">
          <div className="space-y-2 border-b p-3">
            <button
              type="button"
              className="w-full rounded-lg bg-neutral-100 py-1.5 text-xs font-semibold"
              onClick={() => setCustomer("Walk-in", customerPhone || "03001234567")}
            >
              Walk-in
            </button>
            <div>
              <Label htmlFor="cust-name">Customer name</Label>
              <Input
                id="cust-name"
                className="mt-1 h-10"
                value={customerName}
                onChange={(e) => setCustomer(e.target.value, customerPhone)}
              />
            </div>
            <div>
              <Label htmlFor="cust-phone">Phone number</Label>
              <Input
                id="cust-phone"
                className="mt-1 h-10"
                value={customerPhone}
                onChange={(e) => setCustomer(customerName, e.target.value)}
              />
            </div>
            {orderType === "dine_in" && (
              <div>
                <Label htmlFor="table-num">Table number</Label>
                <Input
                  id="table-num"
                  type="number"
                  className="mt-1 h-10"
                  value={tableNumber ?? ""}
                  onChange={(e) =>
                    setTableNumber(e.target.value ? Number(e.target.value) : undefined)
                  }
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-neutral-400">Tap items to add</p>
            ) : (
              <ul className="divide-y">
                {items.map((line) => (
                  <li key={line.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{line.menuItem.name}</p>
                      <p className="text-xs text-neutral-500">
                        {line.quantity} × {formatCurrency(line.unitPrice)}
                      </p>
                    </div>
                    <div className="flex rounded border text-sm font-bold">
                      <button
                        type="button"
                        className="px-2 py-1"
                        onClick={() => updateQty(line.id, Math.max(1, line.quantity - 1))}
                      >
                        −
                      </button>
                      <span className="px-2 py-1">{line.quantity}</span>
                      <button
                        type="button"
                        className="px-2 py-1"
                        onClick={() => updateQty(line.id, line.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <button type="button" onClick={() => removeItem(line.id)} className="text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t p-3">
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
            <Button
              className="mt-2 h-12 w-full text-base font-bold"
              disabled={paying}
              onClick={placeOrder}
            >
              <Banknote className="mr-2 h-5 w-5" />
              {paying ? "..." : "Pay & print (F2)"}
            </Button>
            <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={clearOrder}>
              <X className="mr-1 h-4 w-4" /> Clear cart
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
