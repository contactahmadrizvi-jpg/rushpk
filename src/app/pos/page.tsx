"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MenuItemImage } from "@/components/menu-item-image";
import { toast } from "sonner";
import {
  Search,
  Trash2,
  ShoppingBag,
  User,
  Phone,
  Utensils,
  ArrowLeft,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { FoodGridSkeleton } from "@/components/ui/loading-skeletons";

const CATEGORY_LABEL: Record<string, string> = {
  "cat-shawarma": "Shawarma",
  "cat-wraps": "Wraps",
  "cat-beef-burger": "Burgers",
  "cat-chicken-burger": "Chicken",
  "cat-paratha": "Paratha",
  "cat-sides": "Sides",
  "cat-pizza": "Pizza",
  "cat-premium-pizza": "Premium",
};

const ORDER_TYPES: { id: OrderType; label: string; icon: string }[] = [
  { id: "dine_in", label: "Dine in", icon: "🍽️" },
  { id: "takeaway", label: "Takeaway", icon: "🥡" },
  { id: "delivery", label: "Delivery", icon: "🛵" },
];

export default function POSPage() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [paying, setPaying] = useState(false);
  const [menuLoading, setMenuLoading] = useState(true);
  const [showCartMobile, setShowCartMobile] = useState(false);

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
    getActiveCategories().then(setCategories);
    const unsub = subscribeMenuItems((items) => {
      setMenu(items);
      setMenuLoading(false);
    });
    return () => {
      unsub();
      stopSync();
    };
  }, [profile, router, setCustomer]);

  const filtered = useMemo(() => {
    let list = menu;
    if (activeCategory !== "all") {
      list = list.filter((m) => m.categoryId === activeCategory);
    }
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
      toast.error("Add customer name & phone");
      return;
    }
    if (!items.length) {
      toast.error("Tap items to add to cart");
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
    setShowCartMobile(false);
    toast.success(`Order #${num} — printing`);
    requestAnimationFrame(() => void printPosDocuments(order));
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
    setCustomer,
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

  const cartPanel = (
    <div className="flex h-full flex-col bg-white">
      {/* Customer — compact */}
      <div className="border-b bg-gradient-to-br from-orange-50 to-white p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-800/70">
          <User className="h-3.5 w-3.5" /> Customer
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              className="h-11 rounded-xl border-stone-200 bg-white pl-9"
              placeholder="Name"
              value={customerName}
              onChange={(e) => setCustomer(e.target.value, customerPhone)}
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              className="h-11 rounded-xl border-stone-200 bg-white pl-9"
              placeholder="Phone"
              value={customerPhone}
              onChange={(e) => setCustomer(customerName, e.target.value)}
            />
          </div>
        </div>
        {orderType === "dine_in" && (
          <div className="relative mt-2">
            <Utensils className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              type="number"
              className="h-11 rounded-xl border-stone-200 bg-white pl-9"
              placeholder="Table no."
              value={tableNumber ?? ""}
              onChange={(e) =>
                setTableNumber(e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </div>
        )}
      </div>

      {/* Cart list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex h-full min-h-[140px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50/80 p-6 text-center">
            <ShoppingBag className="h-10 w-10 text-stone-300" />
            <p className="mt-3 font-medium text-stone-500">Cart is empty</p>
            <p className="mt-1 text-sm text-stone-400">Tap a product to add</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((line) => (
              <li
                key={line.id}
                className="flex items-center gap-3 rounded-2xl border border-stone-100 bg-stone-50/80 p-3 shadow-sm"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                  <MenuItemImage src={line.menuItem.imageUrl} alt="" fill />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-stone-900">{line.menuItem.name}</p>
                  <p className="text-sm font-semibold text-primary">
                    {formatCurrency(line.subtotal)}
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-xl bg-white p-0.5 shadow-sm">
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-lg font-bold active:scale-95"
                    onClick={() => updateQty(line.id, Math.max(1, line.quantity - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-lg font-black">{line.quantity}</span>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white active:scale-95"
                    onClick={() => updateQty(line.id, line.quantity + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                  onClick={() => removeItem(line.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pay bar */}
      <div className="border-t bg-white p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
        <div className="mb-3 flex items-end justify-between">
          <span className="text-sm font-medium text-stone-500">Total</span>
          <span className="text-3xl font-black tracking-tight text-primary">
            {formatCurrency(total)}
          </span>
        </div>
        <Button
          size="lg"
          disabled={paying || !items.length}
          className="h-14 w-full rounded-2xl text-lg font-bold shadow-lg shadow-primary/25"
          onClick={placeOrder}
        >
          {paying ? "Processing..." : `Pay & Print · F2`}
        </Button>
        {items.length > 0 && (
          <button
            type="button"
            className="mt-2 w-full text-center text-sm text-stone-400 hover:text-red-500"
            onClick={clearOrder}
          >
            Clear cart
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#f8f4ef]">
      {/* Top bar */}
      <header className="shrink-0 border-b border-stone-200/80 bg-white/90 px-3 py-3 backdrop-blur-md sm:px-5">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-600 transition hover:bg-stone-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black text-stone-900 sm:text-xl">
              {RESTAURANT.name}
            </h1>
            <p className="flex items-center gap-1 text-xs text-stone-500">
              <Sparkles className="h-3 w-3 text-primary" /> Point of Sale
            </p>
          </div>
          <button
            type="button"
            className="relative flex h-12 items-center gap-2 rounded-2xl bg-primary px-4 font-bold text-white shadow-md md:hidden"
            onClick={() => setShowCartMobile(true)}
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-stone-900 text-xs">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Order type */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {ORDER_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setOrderType(t.id)}
              className={cn(
                "rounded-xl py-2.5 text-sm font-bold transition-all",
                orderType === t.id
                  ? "bg-primary text-white shadow-md shadow-primary/30"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              )}
            >
              <span className="mr-1">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Categories */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => {
              setActiveCategory("all");
              setSearch("");
            }}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-bold transition",
              activeCategory === "all"
                ? "bg-stone-900 text-white"
                : "bg-white text-stone-600 ring-1 ring-stone-200"
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setActiveCategory(cat.id);
                setSearch("");
              }}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-bold transition",
                activeCategory === cat.id
                  ? "bg-primary text-white shadow-md"
                  : "bg-white text-stone-600 ring-1 ring-stone-200"
              )}
            >
              {CATEGORY_LABEL[cat.id] ?? cat.name}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Menu */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="p-3 sm:p-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
              <Input
                className="h-12 rounded-2xl border-0 bg-white pl-12 text-base shadow-sm ring-1 ring-stone-200/80"
                placeholder="Search menu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto px-3 pb-24 sm:grid-cols-3 sm:px-4 sm:pb-4 lg:grid-cols-3 xl:grid-cols-4">
            {menuLoading ? (
              <div className="col-span-full p-2">
                <FoodGridSkeleton count={8} />
              </div>
            ) : filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  addItem(item);
                  if (window.innerWidth < 768) setShowCartMobile(true);
                }}
                className="group flex flex-col h-52 overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-stone-200/60 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary/40 active:scale-[0.98]"
              >
                <div className="relative flex-1 w-full overflow-hidden bg-stone-100">
                  <MenuItemImage src={item.imageUrl} alt={item.name} fill />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent opacity-80" />
                  <span className="absolute bottom-2.5 left-3 right-3 truncate text-sm font-extrabold text-white drop-shadow-sm">
                    {item.name}
                  </span>
                  <span className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow-lg opacity-0 transition group-hover:opacity-100">
                    <Plus className="h-4 w-4" />
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 shrink-0 h-12 bg-white">
                  <span className="text-base font-black text-primary">
                    {formatCurrency(item.price)}
                  </span>
                  <span className="rounded-lg bg-orange-55 px-2 py-0.5 text-xs font-bold text-orange-700 bg-orange-50">
                    + Add
                  </span>
                </div>
              </button>
            ))}
            {!menuLoading && !filtered.length && (
              <p className="col-span-full py-16 text-center text-stone-400">No items found</p>
            )}
          </div>
        </main>

        {/* Cart — desktop */}
        <aside className="hidden w-[min(100%,400px)] shrink-0 border-l border-stone-200/80 shadow-xl md:flex md:flex-col">
          {cartPanel}
        </aside>
      </div>

      {/* Cart — mobile sheet */}
      {showCartMobile && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-label="Close cart"
            onClick={() => setShowCartMobile(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 flex max-h-[88vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
            <div className="flex justify-center py-3">
              <div className="h-1 w-12 rounded-full bg-stone-200" />
            </div>
            <div className="min-h-0 flex-1">{cartPanel}</div>
          </div>
        </div>
      )}
    </div>
  );
}
