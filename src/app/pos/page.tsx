"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { MenuItemImage } from "@/components/menu-item-image";
import { toast } from "sonner";
import { Search, Trash2, Pause, Banknote, X, Plus, User, Phone, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { usePOSStore } from "@/stores/pos-store";
import { subscribeMenuItems, getActiveCategories } from "@/services/menu.service";
import { createOrder } from "@/services/orders.service";
import { preloadPrintHeader, printPosDocuments } from "@/lib/print";
import { formatCurrency, cn } from "@/lib/utils";
import type { MenuItem, OrderItem, OrderType, MenuCategory } from "@/types";
import { useAuthStore } from "@/stores/auth-store";
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

function shortLabel(cat: MenuCategory) {
  return CATEGORY_SHORT[cat.id] ?? cat.name.split(" ")[0] ?? cat.name;
}

export default function POSPage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const profile = useAuthStore((s) => s.profile);

  const {
    items,
    orderType,
    customerName,
    customerPhone,
    tableNumber,
    discount,
    heldOrders,
    setOrderType,
    setCustomer,
    setTableNumber,
    addItem,
    removeItem,
    updateQty,
    clearOrder,
    holdOrder,
    restoreHeld,
    getSubtotal,
  } = usePOSStore();

  useEffect(() => {
    preloadPrintHeader();
    getActiveCategories().then((cats) => {
      setCategories(cats);
      setActiveCategory((prev) => prev || cats[0]?.id || "");
    });
    return subscribeMenuItems(setMenu);
  }, []);

  const countByCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const item of menu) {
      m[item.categoryId] = (m[item.categoryId] ?? 0) + 1;
    }
    return m;
  }, [menu]);

  const filtered = useMemo(() => {
    let list = menu;
    if (activeCategory) {
      list = list.filter((m) => m.categoryId === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [menu, activeCategory, search]);

  const activeCatName = categories.find((c) => c.id === activeCategory)?.name ?? "Menu";

  const subtotal = getSubtotal();
  const total = subtotal - discount;
  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  const placeOrder = useCallback(async () => {
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error("Customer name & phone required");
      return;
    }
    if (!items.length) {
      toast.error("Add items first");
      return;
    }
    try {
      const orderItems: OrderItem[] = items.map((line, i) => ({
        id: `pos-${i}`,
        menuItemId: line.menuItem.id,
        name: line.menuItem.name,
        price: line.unitPrice,
        quantity: line.quantity,
        customization: line.customization,
        subtotal: line.subtotal,
      }));

      const order = await createOrder({
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
      });

      const num = order.dailyOrderNumber ?? order.orderNumber;
      clearOrder();
      toast.success(`Order #${num} placed`);
      void printPosDocuments(order);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }, [items, customerName, customerPhone, orderType, subtotal, discount, total, tableNumber, profile, clearOrder]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        placeOrder();
      }
      if (e.key === "F3") holdOrder();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [placeOrder, holdOrder]);

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Header */}
      <header className="shrink-0 border-b bg-white px-4 py-2 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-xs font-medium text-slate-500 hover:text-primary">
              ← Admin
            </Link>
            <span className="font-bold text-slate-800">{RESTAURANT.name}</span>
            <Badge variant="secondary">{cartCount} items</Badge>
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {(["dine_in", "takeaway", "delivery"] as OrderType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setOrderType(t)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide",
                  orderType === t ? "bg-primary text-white shadow" : "text-slate-600"
                )}
              >
                {t === "dine_in" ? "Dine In" : t === "takeaway" ? "Takeaway" : "Delivery"}
              </button>
            ))}
          </div>
        </div>

        {/* Category menu buttons */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setActiveCategory(cat.id);
                setSearch("");
              }}
              className={cn(
                "shrink-0 rounded-xl px-5 py-3 text-sm font-bold transition shadow-sm",
                activeCategory === cat.id
                  ? "bg-primary text-white ring-2 ring-primary/30"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
              )}
            >
              {shortLabel(cat)}
              <span className={cn("ml-2 rounded-md px-1.5 py-0.5 text-xs", activeCategory === cat.id ? "bg-white/20" : "bg-slate-100")}>
                {countByCategory[cat.id] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Items list — tap row = add 1 */}
        <section className="flex min-w-0 flex-1 flex-col bg-white">
          <div className="flex items-center gap-3 border-b px-4 py-2">
            <h2 className="text-lg font-bold text-slate-800">{activeCatName}</h2>
            <span className="text-sm text-slate-500">{filtered.length} items</span>
            <div className="relative ml-auto max-w-xs flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search..."
                className="h-9 rounded-lg pl-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-3 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addItem(item)}
                className="flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:border-primary hover:shadow-md active:scale-[0.98]"
              >
                <div className="relative aspect-[5/4] bg-slate-100">
                  <MenuItemImage src={item.imageUrl} alt={item.name} fill />
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-bold leading-tight text-slate-900">
                      {item.name}
                    </p>
                    <p className="mt-1 text-base font-black text-primary">
                      {formatCurrency(item.price)}
                    </p>
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                    <Plus className="h-5 w-5" />
                  </span>
                </div>
              </button>
            ))}
            {!filtered.length && (
              <p className="col-span-full py-20 text-center text-slate-500">No items in this category</p>
            )}
          </div>
        </section>

        {/* Cart */}
        <aside className="flex w-[min(100%,360px)] shrink-0 flex-col border-l bg-white shadow-xl">
          <div className="grid gap-2 border-b p-3">
            <button
              type="button"
              className="text-left text-xs font-semibold text-slate-600 hover:text-primary"
              onClick={() => setCustomer("Walk-in", customerPhone || "03000000000")}
            >
              Walk-in customer
            </button>
            <Input
              aria-label="Customer name"
              className="h-10"
              value={customerName}
              onChange={(e) => setCustomer(e.target.value, customerPhone)}
            />
            <Input
              aria-label="Customer phone"
              className="h-10"
              value={customerPhone}
              onChange={(e) => setCustomer(customerName, e.target.value)}
            />
            {orderType === "dine_in" && (
              <Input
                aria-label="Table number"
                type="number"
                className="h-10"
                value={tableNumber ?? ""}
                onChange={(e) => setTableNumber(e.target.value ? Number(e.target.value) : undefined)}
              />
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-400">Tap items to add</p>
            ) : (
              <ul className="divide-y">
                {items.map((line) => (
                  <li key={line.id} className="flex items-center gap-2 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{line.menuItem.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatCurrency(line.unitPrice)} × {line.quantity} ={" "}
                        <strong>{formatCurrency(line.subtotal)}</strong>
                      </p>
                    </div>
                    <div className="flex items-center rounded-lg border bg-slate-50">
                      <button type="button" className="h-9 w-9 text-lg font-bold" onClick={() => updateQty(line.id, Math.max(1, line.quantity - 1))}>−</button>
                      <span className="w-7 text-center text-sm font-bold">{line.quantity}</span>
                      <button type="button" className="h-9 w-9 text-lg font-bold" onClick={() => updateQty(line.id, line.quantity + 1)}>+</button>
                    </div>
                    <button type="button" onClick={() => removeItem(line.id)} className="p-1 text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {heldOrders.length > 0 && (
            <div className="flex flex-wrap gap-1 border-t px-2 py-2">
              {heldOrders.map((h) => (
                <Badge key={h.id} variant="outline" className="cursor-pointer" onClick={() => restoreHeld(h.id)}>
                  {h.customerName || "Held"}
                </Badge>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t bg-slate-50 p-3">
            <div className="flex items-end justify-between">
              <span className="font-semibold text-slate-600">Total</span>
              <span className="text-3xl font-black text-primary">{formatCurrency(total)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={holdOrder}>
                <Pause className="mr-1 h-4 w-4" /> Hold
              </Button>
              <Button variant="outline" size="sm" onClick={clearOrder}>
                <X className="mr-1 h-4 w-4" /> Clear
              </Button>
            </div>
            <Button className="h-14 w-full text-lg font-bold" onClick={placeOrder}>
              <Banknote className="mr-2 h-6 w-6" />
              Pay · Print (F2)
            </Button>
            <p className="flex items-center justify-center gap-1 text-center text-[10px] text-slate-400">
              <Printer className="h-3 w-3" /> One print dialog (receipt + kitchen)
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
