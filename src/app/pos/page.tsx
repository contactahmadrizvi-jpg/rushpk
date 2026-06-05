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
  MapPin,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePOSStore } from "@/stores/pos-store";
import { subscribeMenuItems, getActiveCategories, getActiveDeals } from "@/services/menu.service";
import type { CreateOrderInput } from "@/services/orders.service";
import { subscribeKitchenOrders } from "@/services/orders.service";
import { preloadPrintHeader, printKOT } from "@/lib/print";
import { buildInstantPosOrder } from "@/lib/pos-instant";
import { startPosSyncWorker } from "@/services/pos-sync.service";
import { formatCurrency, cn } from "@/lib/utils";
import { getFirestoreDb } from "@/lib/firebase/config";
import type { Deal, MenuItem, OrderItem, OrderType, MenuCategory } from "@/types";
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

const DEALS_CATEGORY_ID = "__deals__";

export default function POSPage() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [paying, setPaying] = useState(false);
  const [menuLoading, setMenuLoading] = useState(true);
  const [showDialpad, setShowDialpad] = useState(false);
  const [cartStep, setCartStep] = useState<"cart" | "details">("cart");

  // Delivery state
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("Sheikhupura");
  const [deliveryCharges, setDeliveryCharges] = useState(150);

  // Autocomplete
  const [savedCustomers, setSavedCustomers] = useState<any[]>([]);
  const [phoneSuggestions, setPhoneSuggestions] = useState<any[]>([]);

  // Active orders for table occupation
  const [activeOrders, setActiveOrders] = useState<any[]>([]);

  const {
    items,
    orderType,
    customerName,
    customerPhone,
    tableNumber,
    setOrderType,
    setTableNumber,
    addItem,
    addDeal,
    removeItem,
    updateQty,
    clearOrder,
    getSubtotal,
    setCustomer,
  } = usePOSStore();

  useEffect(() => {
    if (profile && !userHasPermission(profile, "pos") && !userHasPermission(profile, "*")) {
      router.replace("/admin");
      return;
    }
    preloadPrintHeader();
    const stopSync = startPosSyncWorker();
    getActiveCategories().then(setCategories);
    getActiveDeals().then(setDeals);
    const unsub = subscribeMenuItems((items) => {
      setMenu(items);
      setMenuLoading(false);
    });
    const unsubKitchen = subscribeKitchenOrders((orders) => {
      setActiveOrders(orders);
    });
    const loaded = JSON.parse(localStorage.getItem("pos_saved_customers") || "[]");
    setSavedCustomers(loaded);
    return () => {
      unsub();
      unsubKitchen();
      stopSync();
    };
  }, [profile, router, setCustomer]);

  const subtotal = getSubtotal();
  const originalSubtotal = useMemo(() => items.reduce((s, i) => s + (i.unitPrice * i.quantity), 0), [items]);
  const totalItemDiscounts = useMemo(() => items.reduce((s, i) => s + (i.discountAmount || 0), 0), [items]);
  const total = subtotal;
  const discount = totalItemDiscounts;

  const occupiedTables = useMemo(() => {
    return activeOrders
      .filter((o) => o.type === "dine_in" && o.tableNumber != null)
      .map((o) => o.tableNumber as number);
  }, [activeOrders]);

  const isDealsTab = activeCategory === DEALS_CATEGORY_ID;

  const filtered = useMemo(() => {
    if (isDealsTab) return [];
    let list = menu;
    if (activeCategory !== "all") {
      list = list.filter((m) => m.categoryId === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q));
    }
    return list;
  }, [menu, activeCategory, search, isDealsTab]);

  const filteredDeals = useMemo(() => {
    if (!isDealsTab) return [];
    if (!search.trim()) return deals;
    const q = search.toLowerCase();
    return deals.filter((d) => d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q));
  }, [deals, isDealsTab, search]);

  const selectSuggestion = (s: any) => {
    setCustomer(s.name, s.phone);
    setStreet(s.street || "");
    setCity(s.city || "Sheikhupura");
    setDeliveryCharges(s.deliveryCharges || 150);
    setPhoneSuggestions([]);
  };

  const handleDialpadPress = (val: string) => {
    let current = String(tableNumber ?? "");
    if (val === "C") {
      setTableNumber(undefined);
    } else if (val === "back") {
      const next = current.slice(0, -1);
      setTableNumber(next ? Number(next) : undefined);
    } else {
      const next = current + val;
      setTableNumber(Number(next));
    }
  };

  const placeOrder = useCallback(async () => {
    if (paying) return;
    if (!items.length) { toast.error("Tap items to add to cart"); return; }
    if (orderType === "dine_in" && tableNumber == null) { toast.error("Table number is required for Dine-in orders"); return; }
    if (orderType === "dine_in" && tableNumber != null && occupiedTables.includes(tableNumber)) {
      toast.error(`Table #${tableNumber} is already occupied/reserved! Please choose another table.`);
      return;
    }
    if (orderType === "delivery") {
      if (!customerName.trim()) { toast.error("Customer name is required for delivery orders"); return; }
      if (!customerPhone.trim()) { toast.error("Customer phone is required for delivery orders"); return; }
      if (!street.trim()) { toast.error("Street / House No. / Address is required for delivery orders"); return; }
      if (!city.trim()) { toast.error("City is required for delivery orders"); return; }
    }

    const nameToUse = customerName.trim() || "Walk-in Customer";
    const phoneToUse = customerPhone.trim() || "";

    if (orderType === "delivery" && phoneToUse) {
      const newSaved = { phone: phoneToUse, name: nameToUse, street, city, deliveryCharges };
      const filteredList = savedCustomers.filter((c: any) => c.phone !== phoneToUse);
      const updatedList = [newSaved, ...filteredList];
      localStorage.setItem("pos_saved_customers", JSON.stringify(updatedList));
      setSavedCustomers(updatedList);
    }

    const orderItems: OrderItem[] = items.map((line, i) => ({
      id: `pos-${i}`,
      menuItemId: line.menuItem.id,
      name: line.menuItem.name,
      price: line.unitPrice,
      quantity: line.quantity,
      customization: line.customization,
      subtotal: line.subtotal,
    }));

    const deliveryCharge = orderType === "delivery" ? deliveryCharges : 0;
    const finalTotal = total + deliveryCharge;

    setPaying(true);

    const inputData: CreateOrderInput = {
      customerName: nameToUse,
      customerPhone: phoneToUse,
      type: orderType,
      items: orderItems,
      subtotal: originalSubtotal,
      tax: 0,
      deliveryCharge,
      discount,
      total: finalTotal,
      source: "pos",
      paymentMethod: "cash",
      status: "received",
      kitchenStatus: "new",
      createdBy: profile?.id,
      ...(orderType === "dine_in" && tableNumber ? { tableNumber } : {}),
      ...(orderType === "delivery" ? {
        deliveryAddress: { id: "pos-delivery", label: "POS Delivery", street, area: "", city, phone: phoneToUse }
      } : {}),
    };

    try {
      const { order } = buildInstantPosOrder(inputData);
      const num = order.dailyOrderNumber ?? order.orderNumber;

      const confirmed = window.confirm(
        `Send Order #${num} to Kitchen?\n\nClick OK to print KOT & send to kitchen.\nClick Cancel to discard this order.`
      );
      if (!confirmed) {
        const m = await import("@/lib/pos-instant");
        m.removePendingByLocalId(order.id);
        window.dispatchEvent(new CustomEvent("rush-pos-pending"));
        toast.error("Order cancelled. Nothing was sent to kitchen.");
        setPaying(false);
        return;
      }

      await printKOT(order);
      if (orderType === "delivery") {
        try {
          const { doc: fsDoc, setDoc } = await import("firebase/firestore");
          const deliveryRef = fsDoc(getFirestoreDb(), "deliveries", order.id);
          await setDoc(deliveryRef, {
            orderId: order.id, orderNumber: num, customerName: nameToUse, customerPhone: phoneToUse,
            address: `${street}, ${city}`, deliveryCharge, total: finalTotal, createdAt: new Date().toISOString(),
          });
        } catch (e) {
          console.error("Failed to saves delivery order info globally:", e);
        }
      }
      clearOrder();
      setShowDialpad(false);
      setStreet("");
      setCity("Sheikhupura");
      setDeliveryCharges(150);
      setPaying(false);
      setCartStep("cart");
      toast.success(`Order #${num} sent to Kitchen successfully!`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit order");
      setPaying(false);
    }
  }, [
    paying, items, customerName, customerPhone, orderType, subtotal, discount, total,
    tableNumber, profile, street, city, deliveryCharges, savedCustomers, occupiedTables, clearOrder, originalSubtotal,
  ]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        if (cartStep === "cart") {
          if (items.length > 0) {
            setCartStep("details");
          } else {
            toast.error("Tap items to add to cart");
          }
        } else {
          placeOrder();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [placeOrder, cartStep, items.length]);

  // Compute deal total price for display
  const getDealTotal = (deal: Deal) => {
    const dealItems = menu.filter((m) => deal.menuItemIds?.includes(m.id));
    const rawTotal = dealItems.reduce((sum, item) => {
      const custom = deal.itemPrices?.[item.id];
      if (custom !== undefined) return sum + custom;
      const varId = deal.selectedVariants?.[item.id];
      const mod = varId ? (item.variants?.find((v) => v.id === varId)?.priceModifier ?? 0) : 0;
      return sum + item.price + mod;
    }, 0);
    return deal.discountPercent
      ? Math.round(rawTotal * (1 - deal.discountPercent / 100))
      : (deal.fixedPrice ?? rawTotal);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f8f4ef]">

      {/* ── Top Header ── */}
      <header className="shrink-0 border-b border-stone-200/80 bg-white/90 px-3 py-3 backdrop-blur-md sm:px-5">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-600 transition hover:bg-stone-200">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black text-stone-900 sm:text-xl">{RESTAURANT.name}</h1>
            <p className="flex items-center gap-1 text-xs text-stone-500">
              <Sparkles className="h-3 w-3 text-primary" /> Point of Sale
            </p>
          </div>
        </div>

        {/* Order type selector */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {ORDER_TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => setOrderType(t.id)}
              className={cn("rounded-xl py-2.5 text-sm font-bold transition-all",
                orderType === t.id ? "bg-primary text-white shadow-md shadow-primary/30" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              )}>
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {/* Categories + Deals tab */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={() => { setActiveCategory("all"); setSearch(""); }}
            className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-bold transition",
              activeCategory === "all" ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"
            )}>All</button>

          {/* Deals tab — shown first, highlighted */}
          {deals.length > 0 && (
            <button type="button" onClick={() => { setActiveCategory(DEALS_CATEGORY_ID); setSearch(""); }}
              className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-bold transition flex items-center gap-1.5",
                activeCategory === DEALS_CATEGORY_ID
                  ? "bg-amber-500 text-white shadow-md shadow-amber-500/30"
                  : "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
              )}>
              <Tag className="h-3.5 w-3.5" /> Deals
              <span className={cn("flex h-4 min-w-4 items-center justify-center rounded-full text-[9px] font-black px-1",
                activeCategory === DEALS_CATEGORY_ID ? "bg-white/30 text-white" : "bg-amber-200 text-amber-800"
              )}>{deals.length}</span>
            </button>
          )}

          {categories.map((cat) => (
            <button key={cat.id} type="button" onClick={() => { setActiveCategory(cat.id); setSearch(""); }}
              className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-bold transition",
                activeCategory === cat.id ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"
              )}>
              {CATEGORY_LABEL[cat.id] ?? cat.name}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main Split Layout ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ height: "calc(100% - 150px)", maxHeight: "calc(100% - 150px)" }}>

        {/* ── LEFT: Menu Grid (60%) ── */}
        <main className="flex flex-col overflow-hidden" style={{ width: "60%" }}>
          {/* Search */}
          <div className="shrink-0 p-3 sm:p-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
              <Input
                className="h-12 rounded-2xl border-0 bg-white pl-12 text-base shadow-sm ring-1 ring-stone-200/80"
                placeholder={isDealsTab ? "Search deals..." : "Search menu..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Deals Grid */}
          {isDealsTab ? (
            <div className="grid grid-cols-1 gap-3 overflow-y-auto px-3 pb-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDeals.map((deal) => {
                const dealTotal = getDealTotal(deal);
                const dealItems = menu.filter((m) => deal.menuItemIds?.includes(m.id));
                return (
                  <div key={deal.id}
                    className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-amber-200/60 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-amber-400/50"
                    style={{ height: "235px" }}>
                    {/* Deal header */}
                    <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 shrink-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-white/80" />
                          <span className="text-sm font-black text-white truncate">{deal.title}</span>
                        </div>
                        {deal.discountPercent && (
                          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-black text-white shrink-0">
                            {deal.discountPercent}% OFF
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-white/80 line-clamp-1">{deal.description}</p>
                    </div>

                    {/* Items preview */}
                    {dealItems.length > 0 && (
                      <div className="flex flex-1 gap-1.5 overflow-x-auto px-3 py-2 items-center [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {dealItems.map((item) => (
                          <div key={item.id} className="flex-shrink-0 flex flex-col items-center">
                            <div className="h-10 w-10 overflow-hidden rounded-lg bg-stone-100">
                              {item.imageUrl
                                ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                                : <div className="flex h-full w-full items-center justify-center text-lg">🍔</div>}
                            </div>
                            <span className="mt-0.5 max-w-[44px] truncate text-[8px] text-stone-500 text-center">{item.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add button with TOTAL price */}
                    <button type="button"
                      className="mt-auto shrink-0 flex items-center justify-between bg-amber-50 px-4 py-3 hover:bg-amber-100 active:bg-amber-200 transition border-t border-amber-100"
                      onClick={() => {
                        addDeal(deal, menu);
                        toast.success(`"${deal.title}" added to cart`);
                      }}
                    >
                      <div className="flex flex-col items-start">
                        <span className="text-base font-black text-amber-700">{formatCurrency(dealTotal)}</span>
                        <span className="text-[10px] text-amber-500 font-semibold">Total deal price</span>
                      </div>
                      <span className="flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-black text-white shadow-sm hover:bg-amber-600 active:scale-95 transition">
                        <Plus className="h-3.5 w-3.5" /> Add Deal
                      </span>
                    </button>
                  </div>
                );
              })}
              {filteredDeals.length === 0 && (
                <p className="col-span-full py-16 text-center text-stone-400">No deals found</p>
              )}
            </div>
          ) : (
            /* Regular Menu Grid */
            <div className="grid grid-cols-2 gap-3 overflow-y-auto px-3 pb-4 sm:grid-cols-3 sm:px-4 lg:grid-cols-4">
              {menuLoading ? (
                <div className="col-span-full p-2"><FoodGridSkeleton count={8} /></div>
              ) : filtered.map((item) => (
                <div key={item.id}
                  className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/60 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/40"
                  style={{ height: "220px" }}
                >
                  <button
                    type="button"
                    className="relative flex-1 w-full overflow-hidden bg-stone-100 active:scale-[0.98] transition"
                    onClick={() => {
                      const custom = item.variants?.length ? { variantId: item.variants[0].id, variantName: item.variants[0].name } : {};
                      addItem(item, 1, custom);
                    }}
                  >
                    <MenuItemImage src={item.imageUrl} alt={item.name} fill />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <span className="absolute bottom-2 left-2 right-2 truncate text-sm font-black text-white drop-shadow">{item.name}</span>
                    <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow opacity-0 transition group-hover:opacity-100 active:scale-90">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                  </button>
                  {item.variants && item.variants.length > 0 ? (
                    <div className="flex shrink-0 items-center gap-1 bg-stone-50 p-1.5" style={{ height: "52px" }}>
                      {item.variants.map((v) => (
                        <button key={v.id} type="button"
                          onClick={() => addItem(item, 1, { variantId: v.id, variantName: v.name })}
                          className="flex-1 rounded-lg bg-white py-1.5 text-xs font-black text-stone-700 ring-1 ring-stone-200 hover:bg-primary hover:text-white hover:ring-primary active:scale-95 transition"
                        >{v.name}</button>
                      ))}
                    </div>
                  ) : (
                    <button type="button"
                      className="flex shrink-0 items-center justify-between bg-white px-3 py-2 hover:bg-orange-50 active:bg-stone-50 transition"
                      style={{ height: "52px" }}
                      onClick={() => addItem(item)}
                    >
                      <span className="text-sm font-black text-primary">{formatCurrency(item.price)}</span>
                      <span className="rounded-lg bg-orange-50 border border-orange-100 px-2 py-0.5 text-xs font-black text-orange-700">+ Add</span>
                    </button>
                  )}
                </div>
              ))}
              {!menuLoading && !filtered.length && (
                <p className="col-span-full py-16 text-center text-stone-400">No items found</p>
              )}
            </div>
          )}
        </main>

        {/* ── RIGHT: Cart Sidebar (40%) ── */}
        <aside
          className="flex flex-col h-full overflow-hidden bg-white border-l-2 border-stone-200 shadow-[-4px_0_20px_rgba(0,0,0,0.06)]"
          style={{ width: "40%", minWidth: "360px" }}
        >
          {cartStep === "cart" ? (
            <>
              {/* Cart Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100 bg-stone-50/60 shrink-0">
                <span className="text-sm font-black uppercase tracking-wider text-stone-600 flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-primary" /> Order Cart
                  {items.length > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white px-1.5">
                      {items.length}
                    </span>
                  )}
                </span>
                {items.length > 0 && (
                  <button type="button" onClick={() => clearOrder()}
                    className="text-xs font-bold text-red-400 hover:text-red-600 transition flex items-center gap-1">
                    <Trash2 className="h-3.5 w-3.5" /> Clear all
                  </button>
                )}
              </div>

              {/* Cart Items (scrollable) */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="flex h-full min-h-[200px] flex-col items-center justify-center p-8 text-center">
                    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-stone-100">
                      <ShoppingBag className="h-9 w-9 text-stone-300" />
                    </div>
                    <p className="font-black text-stone-400 text-base">Cart is empty</p>
                    <p className="mt-1 text-sm text-stone-300">Tap a product to add it</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {items.map((line) => (
                      <li key={line.id} className="px-4 py-3.5 hover:bg-stone-50/80 transition-colors">
                        {/* Item row */}
                        <div className="flex items-center gap-3">
                          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-stone-100 bg-stone-50">
                            {line.isDeal
                              ? <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-100 to-orange-100 text-2xl">🎁</div>
                              : <MenuItemImage src={line.menuItem.imageUrl} alt="" fill />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-stone-900 leading-tight">
                              {line.menuItem.name}
                              {line.isDeal && (
                                <span className="ml-1 text-[10px] font-black text-amber-600 bg-amber-50 rounded px-1 border border-amber-200">DEAL</span>
                              )}
                              {!line.isDeal && line.customization?.variantName && (
                                <span className="ml-1 text-[10px] font-semibold text-stone-400 bg-stone-100 rounded px-1">
                                  {line.customization.variantName}
                                </span>
                              )}
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                              {/* For deals, always show total; for items, show subtotal */}
                              <span className="text-base font-black text-primary">{formatCurrency(line.subtotal)}</span>
                              {!line.isDeal && line.discountAmount ? (
                                <span className="text-xs font-bold text-stone-400 line-through">{formatCurrency(line.unitPrice * line.quantity)}</span>
                              ) : !line.isDeal ? (
                                <span className="text-xs text-stone-400">{formatCurrency(line.unitPrice)} ea</span>
                              ) : (
                                <span className="text-xs text-amber-500 font-semibold">deal price</span>
                              )}
                            </div>
                          </div>
                          {/* Qty */}
                          <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-0.5">
                            <button type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-stone-700 shadow-sm active:scale-90 transition hover:bg-stone-50"
                              onClick={() => updateQty(line.id, Math.max(1, line.quantity - 1))}>
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-7 text-center text-sm font-black text-stone-900">{line.quantity}</span>
                            <button type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white shadow-sm active:scale-90 transition"
                              onClick={() => updateQty(line.id, line.quantity + 1)}>
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                          {/* Remove */}
                          <button type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 active:scale-90 transition"
                            onClick={() => removeItem(line.id)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Per-item Discount — only for non-deal items */}
                        {!line.isDeal && (
                          <div className="mt-2 flex items-center justify-between gap-2 pl-[76px]">
                            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Disc</span>
                            <div className="flex items-center gap-1">
                              {/* Type toggle */}
                              <div className="flex rounded-lg overflow-hidden border border-stone-200 bg-stone-50">
                                <button type="button"
                                  onClick={() => { const { updateLineDiscount } = usePOSStore.getState(); updateLineDiscount(line.id, "percent", line.discountValue ?? 0); }}
                                  className={cn("px-2.5 py-1 text-[10px] font-black transition-all",
                                    line.discountType === "percent" ? "bg-primary text-white" : "text-stone-400 hover:text-stone-600"
                                  )}>%</button>
                                <button type="button"
                                  onClick={() => { const { updateLineDiscount } = usePOSStore.getState(); updateLineDiscount(line.id, "cash", line.discountValue ?? 0); }}
                                  className={cn("px-2.5 py-1 text-[10px] font-black transition-all",
                                    line.discountType === "cash" ? "bg-primary text-white" : "text-stone-400 hover:text-stone-600"
                                  )}>Rs</button>
                              </div>
                              {/* Value input */}
                              <input
                                type="number" min="0" value={line.discountValue || ""} placeholder="0"
                                onChange={(e) => {
                                  const { updateLineDiscount } = usePOSStore.getState();
                                  let val = parseInt(e.target.value) || 0;
                                  if (line.discountType === "percent") val = Math.min(100, Math.max(0, val));
                                  else val = Math.min(line.unitPrice, Math.max(0, val));
                                  updateLineDiscount(line.id, line.discountType || "percent", val);
                                }}
                                className="w-16 h-7 text-right px-2 font-bold rounded-lg border border-stone-200 bg-white text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Pay Bar - Step 1 */}
              <div className="shrink-0 border-t bg-white px-5 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
                {items.length > 0 && (
                  <div className="mb-3 space-y-1 rounded-xl bg-stone-50 px-4 py-3 border border-stone-100 text-sm">
                    <div className="flex justify-between text-stone-500">
                      <span>Subtotal</span>
                      <span className="font-semibold">{formatCurrency(originalSubtotal)}</span>
                    </div>
                    {totalItemDiscounts > 0 && (
                      <div className="flex justify-between font-bold text-green-600">
                        <span>Discount</span>
                        <span>-{formatCurrency(totalItemDiscounts)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-stone-200 pt-2 font-black text-stone-900 text-base">
                      <span>Total</span>
                      <span className="text-primary">{formatCurrency(total)}</span>
                    </div>
                  </div>
                )}
                <Button size="lg" disabled={!items.length}
                  className="h-14 w-full rounded-2xl text-base font-bold shadow-lg shadow-primary/25"
                  onClick={() => setCartStep("details")}>
                  Next (Add Details) →
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Back Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 bg-stone-50/60 shrink-0">
                <button type="button" onClick={() => setCartStep("cart")}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-stone-600 shadow-sm border border-stone-200/80 hover:bg-stone-50 transition active:scale-95">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-black text-stone-800">Order Details</span>
                  <p className="text-[10px] text-stone-400 font-semibold">{items.length} items selected</p>
                </div>
              </div>

              {/* Order Details Body */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-850">
                  <User className="h-3.5 w-3.5" /> Customer Info
                  {orderType === "delivery" && <span className="text-red-500 font-black text-[10px]">* required</span>}
                </p>

                {/* Name + Phone */}
                <div className="grid gap-3 grid-cols-1">
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <Input className="h-12 rounded-xl border-stone-200 bg-white pl-10 text-sm"
                      placeholder={orderType === "delivery" ? "Name *" : "Name (optional)"}
                      value={customerName}
                      onChange={(e) => setCustomer(e.target.value, customerPhone)}
                    />
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <Input className="h-12 rounded-xl border-stone-200 bg-white pl-10 text-sm"
                      placeholder={orderType === "delivery" ? "Phone *" : "Phone (optional)"}
                      value={customerPhone}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomer(customerName, val);
                        if (val.length >= 2) {
                          setPhoneSuggestions(savedCustomers.filter((c) => c.phone.toLowerCase().includes(val.toLowerCase())));
                        } else {
                          setPhoneSuggestions([]);
                        }
                      }}
                    />
                    {phoneSuggestions.length > 0 && (
                      <ul className="absolute left-0 right-0 top-13 z-50 max-h-40 overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-xl">
                        {phoneSuggestions.map((s, idx) => (
                          <li key={idx}>
                            <button type="button" onClick={() => selectSuggestion(s)}
                              className="w-full px-3 py-2.5 text-left text-xs text-stone-800 hover:bg-stone-50 border-b border-stone-50 font-bold flex flex-col">
                              <span>📞 {s.phone}</span>
                              <span className="text-stone-400 font-normal text-[10px]">{s.name} - {s.street}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Delivery Address */}
                {orderType === "delivery" && (
                  <div className="space-y-3 border-t pt-4 border-stone-100">
                    <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-orange-850">
                      <MapPin className="h-3 w-3" /> Delivery Address
                    </p>
                    <Input className="h-12 rounded-xl border-stone-200 bg-white text-sm" placeholder="Street / House No. / Address *"
                      value={street} onChange={(e) => setStreet(e.target.value)} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input className="h-12 rounded-xl border-stone-200 bg-white text-sm" placeholder="City *"
                        value={city} onChange={(e) => setCity(e.target.value)} />
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-extrabold text-stone-400">Rs.</span>
                        <Input type="number" min="0" className="h-12 rounded-xl border-stone-200 bg-white text-sm pl-9 font-black text-primary"
                          placeholder="Charges" value={deliveryCharges || ""}
                          onChange={(e) => setDeliveryCharges(Math.max(0, parseInt(e.target.value) || 0))} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Dine-in Table selector */}
                {orderType === "dine_in" && (
                  <div className="border-t pt-4 border-stone-100 mb-10">
                    <button type="button" onClick={() => setShowDialpad(true)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-sm font-bold hover:opacity-90 transition",
                        tableNumber != null && occupiedTables.includes(tableNumber)
                          ? "bg-red-50 border-red-200 text-red-700"
                          : "bg-orange-50/70 border-orange-100/70 text-orange-900/80"
                      )}>
                      <span className="flex items-center gap-2 uppercase tracking-wider">
                        <Utensils className="h-4 w-4" />
                        Table: {tableNumber != null ? `#${tableNumber}` : "Select Table *"}
                      </span>
                      <span className="text-xs font-black opacity-60">▼ Tap</span>
                    </button>
                    {tableNumber != null && occupiedTables.includes(tableNumber) && (
                      <div className="text-xs font-bold text-red-600 bg-red-50/60 p-2.5 rounded-xl border border-red-100/40">
                        ⚠️ Table #{tableNumber} is already occupied!
                      </div>
                    )}
                    {occupiedTables.length > 0 && (
                      <div className="text-[10px] font-bold text-stone-400 bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                        Occupied: {occupiedTables.sort((a, b) => a - b).map((t) => `#${t}`).join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Pay Bar - Step 2 */}
              <div className="shrink-0 border-t bg-white px-5 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
                <div className="mb-3 space-y-1 rounded-xl bg-stone-50 px-4 py-3 border border-stone-100 text-sm">
                  <div className="flex justify-between text-stone-500">
                    <span>Subtotal</span>
                    <span className="font-semibold">{formatCurrency(originalSubtotal)}</span>
                  </div>
                  {totalItemDiscounts > 0 && (
                    <div className="flex justify-between font-bold text-green-600">
                      <span>Discount</span>
                      <span>-{formatCurrency(totalItemDiscounts)}</span>
                    </div>
                  )}
                  {orderType === "delivery" && (
                    <div className="flex justify-between text-stone-500">
                      <span>Delivery</span>
                      <span className="font-semibold">{formatCurrency(deliveryCharges)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-stone-200 pt-2 font-black text-stone-900 text-base">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(total + (orderType === "delivery" ? deliveryCharges : 0))}</span>
                  </div>
                </div>
                <Button size="lg" disabled={paying || !items.length}
                  className="h-14 w-full rounded-2xl text-base font-bold shadow-lg shadow-primary/25"
                  onClick={placeOrder}>
                  {paying ? "Processing..." : `Send to Kitchen · F2`}
                </Button>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Table Dialpad Modal */}
      {showDialpad && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-stone-900 flex items-center gap-2">
                <Utensils className="h-4 w-4 text-primary" /> Select Dine-in Table
              </h3>
              <button type="button" onClick={() => setShowDialpad(false)} className="text-xs font-bold text-stone-400 hover:text-stone-700">✕ Close</button>
            </div>
            <div className="text-center bg-stone-50 py-4 rounded-2xl border border-stone-100">
              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Selected Table</span>
              <p className="text-4xl font-black text-primary mt-1">{tableNumber != null ? `#${tableNumber}` : "—"}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "back"].map((k) => {
                const num = k === "back" || k === "C" ? null : Number(k);
                const isOccupied = num !== null && occupiedTables.includes(num);
                return (
                  <button key={k} type="button" onClick={() => handleDialpadPress(k)}
                    className={cn("flex h-14 items-center justify-center rounded-2xl text-lg font-black shadow-sm active:scale-95 border transition",
                      isOccupied ? "bg-red-50 text-red-500 border-red-200 hover:bg-red-100" : "bg-stone-50 hover:bg-stone-100 border-stone-200/60 text-stone-800"
                    )}>
                    {k === "back" ? "⌫" : k}
                  </button>
                );
              })}
            </div>
            {occupiedTables.length > 0 && (
              <div className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-2xl border border-red-100 max-h-24 overflow-y-auto">
                ⚠️ Occupied: {occupiedTables.sort((a, b) => a - b).map((t) => `#${t}`).join(", ")}
              </div>
            )}
            <Button className="w-full h-12 rounded-xl font-bold" onClick={() => setShowDialpad(false)}>
              ✓ Confirm Table
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
