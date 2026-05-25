import { create } from "zustand";
import type { CartItemCustomization, MenuItem, OrderType, Table } from "@/types";

export interface POSLine {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  customization: CartItemCustomization;
  unitPrice: number;
  subtotal: number;
  notes?: string;
}

interface POSState {
  orderType: OrderType;
  tableId?: string;
  tableNumber?: number;
  customerName: string;
  customerPhone: string;
  items: POSLine[];
  discount: number;
  heldOrders: HeldOrder[];
  setOrderType: (type: OrderType) => void;
  setTable: (table: Table | null) => void;
  setTableNumber: (n?: number) => void;
  setCustomer: (name: string, phone: string) => void;
  addItem: (item: MenuItem, qty?: number, custom?: CartItemCustomization, notes?: string) => void;
  removeItem: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  clearOrder: () => void;
  holdOrder: () => void;
  restoreHeld: (id: string) => void;
  getSubtotal: () => number;
}

interface HeldOrder {
  id: string;
  items: POSLine[];
  customerName: string;
  customerPhone: string;
  orderType: OrderType;
  tableNumber?: number;
  heldAt: string;
}

function calcPrice(item: MenuItem, custom: CartItemCustomization) {
  let p = item.price;
  if (custom.variantId && item.variants) {
    const v = item.variants.find((x) => x.id === custom.variantId);
    if (v) p += v.priceModifier;
  }
  if (custom.addonIds && item.addons) {
    for (const aid of custom.addonIds) {
      const a = item.addons.find((x) => x.id === aid);
      if (a) p += a.price;
    }
  }
  if (custom.extraCheese && item.extraCheesePrice) p += item.extraCheesePrice;
  return p;
}

export const usePOSStore = create<POSState>((set, get) => ({
  orderType: "dine_in",
  customerName: "",
  customerPhone: "",
  items: [],
  discount: 0,
  heldOrders: [],
  setOrderType: (orderType) => set({ orderType }),
  setTable: (table) =>
    set({
      tableId: table?.id,
      tableNumber: table?.number,
    }),
  setTableNumber: (tableNumber) => set({ tableNumber }),
  setCustomer: (customerName, customerPhone) =>
    set({ customerName, customerPhone }),
  addItem: (menuItem, quantity = 1, customization = {}, notes) => {
    const unitPrice = calcPrice(menuItem, customization);
    set((s) => {
      const existing = s.items.find(
        (line) =>
          line.menuItem.id === menuItem.id &&
          !line.notes &&
          JSON.stringify(line.customization) === JSON.stringify(customization)
      );
      if (existing) {
        return {
          items: s.items.map((line) =>
            line.id === existing.id
              ? {
                  ...line,
                  quantity: line.quantity + quantity,
                  subtotal: line.unitPrice * (line.quantity + quantity),
                }
              : line
          ),
        };
      }
      return {
        items: [
          ...s.items,
          {
            id: `${menuItem.id}-${Date.now()}`,
            menuItem,
            quantity,
            customization,
            unitPrice,
            subtotal: unitPrice * quantity,
            notes,
          },
        ],
      };
    });
  },
  removeItem: (id) =>
    set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  updateQty: (id, quantity) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? { ...i, quantity, subtotal: i.unitPrice * quantity }
          : i
      ),
    })),
  clearOrder: () =>
    set({
      items: [],
      customerName: "",
      customerPhone: "",
      discount: 0,
      tableId: undefined,
      tableNumber: undefined,
    }),
  holdOrder: () => {
    const state = get();
    if (!state.items.length) return;
    const held: HeldOrder = {
      id: `held-${Date.now()}`,
      items: state.items,
      customerName: state.customerName,
      customerPhone: state.customerPhone,
      orderType: state.orderType,
      tableNumber: state.tableNumber,
      heldAt: new Date().toISOString(),
    };
    set((s) => ({
      heldOrders: [...s.heldOrders, held],
      items: [],
      customerName: "",
      customerPhone: "",
    }));
  },
  restoreHeld: (id) => {
    const held = get().heldOrders.find((h) => h.id === id);
    if (!held) return;
    set({
      items: held.items,
      customerName: held.customerName,
      customerPhone: held.customerPhone,
      orderType: held.orderType,
      tableNumber: held.tableNumber,
      heldOrders: get().heldOrders.filter((h) => h.id !== id),
    });
  },
  getSubtotal: () => get().items.reduce((s, i) => s + i.subtotal, 0),
}));
