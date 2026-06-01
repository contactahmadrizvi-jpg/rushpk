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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePOSStore } from "@/stores/pos-store";
import { subscribeMenuItems, getActiveCategories } from "@/services/menu.service";
import type { CreateOrderInput } from "@/services/orders.service";
import { subscribeKitchenOrders } from "@/services/orders.service";
import { preloadPrintHeader, printKOT } from "@/lib/print";
import { buildInstantPosOrder } from "@/lib/pos-instant";
import { startPosSyncWorker } from "@/services/pos-sync.service";
import { formatCurrency, cn } from "@/lib/utils";
import { getFirestoreDb } from "@/lib/firebase/config";
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
  const [showDialpad, setShowDialpad] = useState(false);

  // Delivery Address State
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("Sheikhupura");
  const [deliveryCharges, setDeliveryCharges] = useState(150);

  // Autocomplete Suggestions State
  const [savedCustomers, setSavedCustomers] = useState<any[]>([]);
  const [phoneSuggestions, setPhoneSuggestions] = useState<any[]>([]);

  // Active Orders subscription for Table reservations
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
    const unsub = subscribeMenuItems((items) => {
      setMenu(items);
      setMenuLoading(false);
    });

    // Subscribe to active kitchen orders
    const unsubKitchen = subscribeKitchenOrders((orders) => {
      setActiveOrders(orders);
    });

    // Load saved customers
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
  const total = subtotal; // subtotal is already post-discount
  const discount = totalItemDiscounts;

  const occupiedTables = useMemo(() => {
    return activeOrders
      .filter((o) => o.type === "dine_in" && o.tableNumber != null)
      .map((o) => o.tableNumber as number);
  }, [activeOrders]);

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

  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

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
    if (!items.length) {
      toast.error("Tap items to add to cart");
      return;
    }

    // Check if table is occupied for dine-in
    if (orderType === "dine_in" && tableNumber != null && occupiedTables.includes(tableNumber)) {
      toast.error(`Table #${tableNumber} is already occupied/reserved! Please choose another table.`);
      return;
    }

    // Delivery validation
    if (orderType === "delivery") {
      if (!customerName.trim()) {
        toast.error("Customer name is required for delivery orders");
        return;
      }
      if (!customerPhone.trim()) {
        toast.error("Customer phone is required for delivery orders");
        return;
      }
      if (!street.trim()) {
        toast.error("Street / House No. / Address is required for delivery orders");
        return;
      }
      if (!city.trim()) {
        toast.error("City is required for delivery orders");
        return;
      }
    }

    const nameToUse = customerName.trim() || "Walk-in Customer";
    const phoneToUse = customerPhone.trim() || "";

    // Save Delivery Address if filled
    if (orderType === "delivery" && phoneToUse) {
      const newSaved = {
        phone: phoneToUse,
        name: nameToUse,
        street,
        city,
        deliveryCharges,
      };
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
        deliveryAddress: {
          id: "pos-delivery",
          label: "POS Delivery",
          street,
          area: "",
          city,
          phone: phoneToUse,
        }
      } : {}),
    };

    try {
      const { order } = buildInstantPosOrder(inputData);
      const num = order.dailyOrderNumber ?? order.orderNumber;

      // Auto-print kitchen order ticket (KOT)
      await printKOT(order);

      // Ask if KOT printed successfully
      const confirmed = window.confirm(
        `Did you successfully print the kitchen order ticket (KOT)?\nClick 'OK' to send Order #${num} to kitchen, or 'Cancel' to discard the order.`
      );

      if (!confirmed) {
        const m = await import("@/lib/pos-instant");
        m.removePendingByLocalId(order.id);
        window.dispatchEvent(new CustomEvent("rush-pos-pending"));
        toast.error("Order printing cancelled. Order was not sent to kitchen.");
        setPaying(false);
        return;
      }

      // If it is a delivery order, save daily delivery order to global deliveries collection in background
      if (orderType === "delivery") {
        try {
          const { doc: fsDoc, setDoc } = await import("firebase/firestore");
          const deliveryRef = fsDoc(getFirestoreDb(), "deliveries", order.id);
          await setDoc(deliveryRef, {
            orderId: order.id,
            orderNumber: num,
            customerName: nameToUse,
            customerPhone: phoneToUse,
            address: `${street}, ${city}`,
            deliveryCharge,
            total: finalTotal,
            createdAt: new Date().toISOString(),
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
      setShowCartMobile(false);
      toast.success(`Order #${num} sent to Kitchen successfully!`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit order");
      setPaying(false);
    }
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
    street,
    city,
    deliveryCharges,
    savedCustomers,
    occupiedTables,
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

  const cartPanel = (
    <div className="flex h-full flex-col bg-white relative">
      {/* Customer — compact */}
      <div className="border-b bg-gradient-to-br from-orange-50 to-white p-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-800/70">
          <User className="h-3.5 w-3.5" /> Customer {orderType === "delivery" ? <span className="text-red-500 font-black">*</span> : "(Optional)"}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 relative">
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              className="h-11 rounded-xl border-stone-200 bg-white pl-9"
              placeholder={orderType === "delivery" ? "Name *" : "Name"}
              value={customerName}
              onChange={(e) => setCustomer(e.target.value, customerPhone)}
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              className="h-11 rounded-xl border-stone-200 bg-white pl-9"
              placeholder={orderType === "delivery" ? "Phone *" : "Phone"}
              value={customerPhone}
              onChange={(e) => {
                const val = e.target.value;
                setCustomer(customerName, val);
                if (val.length >= 2) {
                  const matches = savedCustomers.filter((c) =>
                    c.phone.toLowerCase().includes(val.toLowerCase())
                  );
                  setPhoneSuggestions(matches);
                } else {
                  setPhoneSuggestions([]);
                }
              }}
            />
            {/* suggestions dropdown */}
            {phoneSuggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-12 z-50 max-h-40 overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-xl">
                {phoneSuggestions.map((s, idx) => (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => selectSuggestion(s)}
                      className="w-full px-3 py-2 text-left text-xs text-stone-800 hover:bg-stone-50 border-b border-stone-50 font-bold"
                    >
                      📞 {s.phone} <span className="text-stone-400 font-normal">({s.name})</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Delivery Address fields */}
        {orderType === "delivery" && (
          <div className="mt-3 space-y-2.5 border-t pt-3 border-stone-100">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-800/70">
              <MapPin className="h-3.5 w-3.5" /> Delivery Address <span className="text-red-500 font-black">*</span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                className="h-11 rounded-xl border-stone-200 bg-white text-xs col-span-2"
                placeholder="Street / House No. / Address *"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                className="h-11 rounded-xl border-stone-200 bg-white text-xs"
                placeholder="City *"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-extrabold text-stone-400">Rs.</span>
                <Input
                  type="number"
                  min="0"
                  className="h-11 rounded-xl border-stone-200 bg-white text-xs pl-9 font-black text-primary"
                  placeholder="Charges *"
                  value={deliveryCharges || ""}
                  onChange={(e) => setDeliveryCharges(Math.max(0, parseInt(e.target.value) || 0))}
                />
              </div>
            </div>
          </div>
        )}        {/* Dine-in Table selections with dialpad */}
        {orderType === "dine_in" && (
          <div className="mt-3 border-t pt-3 border-stone-100 space-y-2">
            <button
              type="button"
              onClick={() => setShowDialpad(!showDialpad)}
              className="flex w-full items-center justify-between rounded-xl bg-orange-50/70 border border-orange-100/70 px-3 py-2 text-xs font-bold text-orange-850 hover:bg-orange-100/80 transition active:scale-98"
            >
              <span className="flex items-center gap-2 uppercase tracking-wider text-orange-850">
                <Utensils className="h-3.5 w-3.5" /> Table: {tableNumber != null ? `#${tableNumber}` : "Select Table"}
              </span>
              <span className="text-[10px] text-orange-600/80 font-black">{showDialpad ? "▲ Hide Dialpad" : "▼ Show Dialpad"}</span>
            </button>

            {/* Visual Numerical Dialpad inline */}
            {showDialpad && (
              <div className="grid grid-cols-3 gap-1 bg-stone-50/50 p-1.5 rounded-xl border border-stone-100 animate-in fade-in slide-in-from-top-1 duration-200">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "back"].map((k) => {
                  const num = k === "back" || k === "C" ? null : Number(k);
                  const isOccupied = num !== null && occupiedTables.includes(num);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => handleDialpadPress(k)}
                      className={cn(
                        "flex h-8 items-center justify-center rounded-lg text-xs font-black shadow-xs active:scale-95 border",
                        isOccupied
                          ? "bg-red-50 text-red-500 border-red-200 hover:bg-red-100"
                          : "bg-white text-stone-800 border-stone-100/50 hover:bg-stone-50"
                      )}
                    >
                      {k === "back" ? "⌫" : k}
                    </button>
                  );
                })}
              </div>
            )}
            {occupiedTables.length > 0 && (
              <div className="mt-2 text-[10px] font-bold text-red-600 bg-red-50/60 p-2 rounded-xl border border-red-100/40">
                ⚠️ Occupied Tables: {occupiedTables.sort((a, b) => a - b).map((t) => `#${t}`).join(", ")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cart Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100 bg-stone-50/60">
        <span className="text-xs font-black uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
          <ShoppingBag className="h-3.5 w-3.5" /> Order Items
          {items.length > 0 && (
            <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[9px] font-black text-white px-1">
              {items.length}
            </span>
          )}
        </span>
        {items.length > 0 && (
          <button
            type="button"
            className="text-[10px] font-bold text-red-400 hover:text-red-600 transition flex items-center gap-1"
            onClick={() => clearOrder()}
          >
            <Trash2 className="h-3 w-3" /> Clear all
          </button>
        )}
      </div>

      {/* Cart list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center p-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-100">
              <ShoppingBag className="h-7 w-7 text-stone-300" />
            </div>
            <p className="font-bold text-stone-400">Cart is empty</p>
            <p className="mt-1 text-xs text-stone-300">Tap a product to add it</p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {items.map((line) => (
              <li key={line.id} className="group px-3 py-2.5 hover:bg-stone-50/80 transition-colors">
                <div className="flex items-center gap-3">
                  {/* Small Thumbnail */}
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-stone-100 bg-stone-50">
                    <MenuItemImage src={line.menuItem.imageUrl} alt="" fill />
                  </div>

                  {/* Name + Price */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-stone-900 leading-tight">
                      {line.menuItem.name}
                      {line.customization?.variantName && (
                        <span className="ml-1 text-[10px] font-semibold text-stone-400 bg-stone-100 rounded px-1">
                          {line.customization.variantName}
                        </span>
                      )}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-sm font-black text-primary">
                        {formatCurrency(line.subtotal)}
                      </span>
                      {line.discountAmount ? (
                        <span className="text-[10px] font-bold text-stone-400 line-through">
                          {formatCurrency(line.unitPrice * line.quantity)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-stone-400">
                          {formatCurrency(line.unitPrice)} ea
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Qty Controls */}
                  <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-0.5">
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-stone-700 shadow-sm active:scale-90 transition hover:bg-stone-50"
                      onClick={() => updateQty(line.id, Math.max(1, line.quantity - 1))}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-black text-stone-900">{line.quantity}</span>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white shadow-sm active:scale-90 transition"
                      onClick={() => updateQty(line.id, line.quantity + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Remove */}
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 active:scale-90 transition opacity-0 group-hover:opacity-100"
                    onClick={() => removeItem(line.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Inline Discount Controls */}
                <div className="mt-2 flex items-center justify-between gap-2 pl-[60px]">
                  <span className="text-[9px] font-black uppercase tracking-wider text-stone-400">Discount</span>
                  <div className="flex items-center gap-1.5">
                    {/* Toggle % / Rs */}
                    <div className="flex rounded-md bg-stone-100 p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const { updateLineDiscount } = usePOSStore.getState();
                          updateLineDiscount(line.id, "percent", line.discountValue ?? 0);
                        }}
                        className={cn(
                          "px-1.5 py-0.5 text-[9px] font-black rounded transition-all",
                          line.discountType === "percent"
                            ? "bg-white text-stone-900 shadow-xs"
                            : "text-stone-400 hover:text-stone-600"
                        )}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const { updateLineDiscount } = usePOSStore.getState();
                          updateLineDiscount(line.id, "cash", line.discountValue ?? 0);
                        }}
                        className={cn(
                          "px-1.5 py-0.5 text-[9px] font-black rounded transition-all",
                          line.discountType === "cash"
                            ? "bg-white text-stone-900 shadow-xs"
                            : "text-stone-400 hover:text-stone-600"
                        )}
                      >
                        Rs
                      </button>
                    </div>
                    {/* Value input */}
                    <div className="relative w-16">
                      <input
                        type="number"
                        min="0"
                        value={line.discountValue || ""}
                        placeholder="0"
                        onChange={(e) => {
                          const { updateLineDiscount } = usePOSStore.getState();
                          let val = parseInt(e.target.value) || 0;
                          if (line.discountType === "percent") {
                            val = Math.min(100, Math.max(0, val));
                          } else {
                            val = Math.min(line.unitPrice, Math.max(0, val));
                          }
                          updateLineDiscount(line.id, line.discountType || "percent", val);
                        }}
                        className="w-full h-6 text-right pr-5 font-bold rounded-md border border-stone-200 bg-white text-[10px] focus:ring-1 focus:ring-primary focus:outline-none"
                      />
                      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-extrabold text-stone-400">
                        {line.discountType === "percent" ? "%" : "₨"}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pay bar */}
      <div className="border-t bg-white p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
        {items.length > 0 && (
          <div className="mb-3 space-y-1 rounded-xl bg-stone-50 p-3 border border-stone-100 text-xs">
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
            <div className="flex justify-between border-t border-stone-200 pt-1.5 font-black text-stone-900">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(total + (orderType === "delivery" ? deliveryCharges : 0))}</span>
            </div>
          </div>
        )}

        <Button
          size="lg"
          disabled={paying || !items.length}
          className="h-14 w-full rounded-2xl text-base font-bold shadow-lg shadow-primary/25"
          onClick={placeOrder}
        >
          {paying ? "Processing..." : `Send to Kitchen · F2`}
        </Button>
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

          <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto px-3 pb-24 sm:grid-cols-2 sm:px-4 sm:pb-4 lg:grid-cols-2 xl:grid-cols-3">
            {menuLoading ? (
              <div className="col-span-full p-2">
                <FoodGridSkeleton count={8} />
              </div>
            ) : filtered.map((item) => (
              <div
                key={item.id}
                className="group flex flex-col h-64 overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-stone-200/60 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary/40"
              >
                <button
                  type="button"
                  className="relative flex-1 w-full overflow-hidden bg-stone-100 active:scale-[0.98]"
                  onClick={() => {
                    const custom = item.variants?.length ? { variantId: item.variants[0].id, variantName: item.variants[0].name } : {};
                    addItem(item, 1, custom);
                    if (window.innerWidth < 768) setShowCartMobile(true);
                  }}
                >
                  <MenuItemImage src={item.imageUrl} alt={item.name} fill />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent opacity-80" />
                  <span className="absolute bottom-3 left-4 right-4 truncate text-lg font-black text-white drop-shadow-sm">
                    {item.name}
                  </span>
                  <span className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-lg opacity-0 transition group-hover:opacity-100">
                    <Plus className="h-5 w-5" />
                  </span>
                </button>

                {item.variants && item.variants.length > 0 ? (
                  <div className="flex shrink-0 items-center gap-1.5 bg-stone-50 p-2 h-[58px]">
                    {item.variants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          addItem(item, 1, { variantId: v.id, variantName: v.name });
                          if (window.innerWidth < 768) setShowCartMobile(true);
                        }}
                        className="flex-1 rounded-lg bg-white py-2 text-xs font-black text-stone-700 shadow-sm ring-1 ring-stone-200 hover:bg-stone-100 active:scale-95 sm:text-sm"
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex shrink-0 items-center justify-between bg-white px-4 py-3 h-[58px] active:bg-stone-50"
                    onClick={() => {
                      addItem(item);
                      if (window.innerWidth < 768) setShowCartMobile(true);
                    }}
                  >
                    <span className="text-lg font-black text-primary">
                      {formatCurrency(item.price)}
                    </span>
                    <span className="rounded-xl bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
                      + Add
                    </span>
                  </button>
                )}
              </div>
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
