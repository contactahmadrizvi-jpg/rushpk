import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItemCustomization, MenuItem } from "@/types";

export interface CartLine {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  customization: CartItemCustomization;
  unitPrice: number;
  subtotal: number;
}

interface CartState {
  items: CartLine[];
  couponCode?: string;
  couponDiscount: number;
  addItem: (
    menuItem: MenuItem,
    quantity: number,
    customization: CartItemCustomization
  ) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  clearCart: () => void;
  setCoupon: (code: string, discount: number) => void;
  getSubtotal: () => number;
  getItemCount: () => number;
}

function calcUnitPrice(
  menuItem: MenuItem,
  customization: CartItemCustomization
): number {
  let price = menuItem.price;
  if (customization.variantId && menuItem.variants) {
    const v = menuItem.variants.find((x) => x.id === customization.variantId);
    if (v) price += v.priceModifier;
  }
  if (customization.addonIds && menuItem.addons) {
    for (const aid of customization.addonIds) {
      const addon = menuItem.addons.find((a) => a.id === aid);
      if (addon) price += addon.price;
    }
  }
  if (customization.extraCheese && menuItem.extraCheesePrice) {
    price += menuItem.extraCheesePrice;
  }
  return price;
}

function lineId(menuItemId: string, customization: CartItemCustomization) {
  return `${menuItemId}-${JSON.stringify(customization)}`;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      couponDiscount: 0,
      addItem: (menuItem, quantity, customization) => {
        const id = lineId(menuItem.id, customization);
        const unitPrice = calcUnitPrice(menuItem, customization);
        set((state) => {
          const existing = state.items.find((i) => i.id === id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === id
                  ? {
                      ...i,
                      quantity: i.quantity + quantity,
                      subtotal: (i.quantity + quantity) * unitPrice,
                    }
                  : i
              ),
            };
          }
          return {
            items: [
              ...state.items,
              {
                id,
                menuItem,
                quantity,
                customization,
                unitPrice,
                subtotal: quantity * unitPrice,
              },
            ],
          };
        });
      },
      removeItem: (lineId) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== lineId),
        })),
      updateQuantity: (lineId, quantity) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === lineId
              ? { ...i, quantity, subtotal: quantity * i.unitPrice }
              : i
          ),
        })),
      clearCart: () => set({ items: [], couponCode: undefined, couponDiscount: 0 }),
      setCoupon: (code, discount) =>
        set({ couponCode: code, couponDiscount: discount }),
      getSubtotal: () => get().items.reduce((s, i) => s + i.subtotal, 0),
      getItemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),
    }),
    { name: "rush-cart" }
  )
);
