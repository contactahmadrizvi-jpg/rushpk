import { create } from "zustand";
import type { CartItemCustomization, Deal, MenuItem, OrderType, Table } from "@/types";

export interface POSLine {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  customization: CartItemCustomization;
  unitPrice: number;
  subtotal: number;
  discountType?: "cash" | "percent";
  discountValue?: number;
  discountAmount?: number;
  notes?: string;
  isDeal?: boolean;
  dealTitle?: string;
  /** Snapshot of deal sub-items saved at sale time — for correct inventory deduction/restoration */
  dealSnapshot?: {
    menuItemIds: string[];
    itemQuantities: Record<string, number>;
    selectedVariants: Record<string, string>;
  };
}

interface POSState {
  orderType: OrderType;
  tableId?: string;
  tableNumber?: number;
  customerName: string;
  customerPhone: string;
  items: POSLine[];
  discount: number; // overall calculated cart discount
  heldOrders: HeldOrder[];
  setOrderType: (type: OrderType) => void;
  setTable: (table: Table | null) => void;
  setTableNumber: (n?: number) => void;
  setCustomer: (name: string, phone: string) => void;
  addItem: (item: MenuItem, qty?: number, custom?: CartItemCustomization, notes?: string) => void;
  addDeal: (deal: Deal, menuItems: MenuItem[]) => void;
  removeItem: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  updateLineDiscount: (id: string, discountType: "cash" | "percent", discountValue: number) => void;
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

export function calcLineSubtotal(unitPrice: number, quantity: number, discountType: "cash" | "percent" = "percent", discountValue = 0) {
  let discountEach = 0;
  if (discountType === "percent") {
    discountEach = Math.round((unitPrice * discountValue) / 100);
  } else {
    discountEach = discountValue;
  }
  const priceAfterDiscount = Math.max(0, unitPrice - discountEach);
  return priceAfterDiscount * quantity;
}

export function calcLineDiscountAmount(unitPrice: number, quantity: number, discountType: "cash" | "percent" = "percent", discountValue = 0) {
  let discountEach = 0;
  if (discountType === "percent") {
    discountEach = Math.round((unitPrice * discountValue) / 100);
  } else {
    discountEach = discountValue;
  }
  return Math.min(unitPrice, discountEach) * quantity;
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
          !line.isDeal &&
          JSON.stringify(line.customization) === JSON.stringify(customization) &&
          line.discountType === "percent" &&
          (line.discountValue ?? 0) === 0
      );
      if (existing) {
        const nextQty = existing.quantity + quantity;
        return {
          items: s.items.map((line) =>
            line.id === existing.id
              ? {
                  ...line,
                  quantity: nextQty,
                  subtotal: calcLineSubtotal(line.unitPrice, nextQty, line.discountType, line.discountValue),
                  discountAmount: calcLineDiscountAmount(line.unitPrice, nextQty, line.discountType, line.discountValue),
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
            discountType: "percent",
            discountValue: 0,
            discountAmount: 0,
            subtotal: unitPrice * quantity,
            notes,
          },
        ],
      };
    });
  },
  addDeal: (deal, menuItems) => {
    // Compute the total deal price
    const dealItems = menuItems.filter((m) => deal.menuItemIds?.includes(m.id));
    const rawTotal = dealItems.reduce((sum, item) => {
      const custom = deal.itemPrices?.[item.id];
      const qty = deal.itemQuantities?.[item.id] ?? 1;
      const price = custom !== undefined
        ? custom
        : item.price + (deal.selectedVariants?.[item.id] ? (item.variants?.find((v) => v.id === deal.selectedVariants?.[item.id])?.priceModifier ?? 0) : 0);
      return sum + price * qty;
    }, 0);
    const dealPrice = deal.discountPercent
      ? Math.round(rawTotal * (1 - deal.discountPercent / 100))
      : (deal.fixedPrice ?? rawTotal);

    // Use the first item as the "representative" menu item for the cart line
    const firstItem = dealItems[0];
    if (!firstItem) return;

    const fakeDealItem: MenuItem = {
      ...firstItem,
      id: `deal-${deal.id}`,
      name: deal.title,
      price: dealPrice,
    };

    set((s) => ({
      items: [
        ...s.items,
        {
          id: `deal-${deal.id}-${Date.now()}`,
          menuItem: fakeDealItem,
          quantity: 1,
          customization: {},
          unitPrice: dealPrice,
          discountType: "percent",
          discountValue: 0,
          discountAmount: 0,
          subtotal: dealPrice,
          isDeal: true,
          dealTitle: deal.title,
          // Snapshot of deal contents at time of sale — used for inventory deduction/restoration
          // even if the deal is later deleted or modified in the admin panel
          dealSnapshot: {
            menuItemIds: deal.menuItemIds ?? [],
            itemQuantities: (deal.itemQuantities as Record<string, number>) ?? {},
            selectedVariants: (deal.selectedVariants as Record<string, string>) ?? {},
          },
        },
      ],
    }));
  },
  removeItem: (id) =>
    set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  updateQty: (id, quantity) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? {
              ...i,
              quantity,
              subtotal: calcLineSubtotal(i.unitPrice, quantity, i.discountType, i.discountValue),
              discountAmount: calcLineDiscountAmount(i.unitPrice, quantity, i.discountType, i.discountValue),
            }
          : i
      ),
    })),
  updateLineDiscount: (id, discountType, discountValue) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? {
              ...i,
              discountType,
              discountValue,
              subtotal: calcLineSubtotal(i.unitPrice, i.quantity, discountType, discountValue),
              discountAmount: calcLineDiscountAmount(i.unitPrice, i.quantity, discountType, discountValue),
            }
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
