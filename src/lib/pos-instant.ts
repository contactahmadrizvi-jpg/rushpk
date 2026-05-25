import { RESTAURANT } from "@/constants";
import type { CreateOrderInput } from "@/services/orders.service";
import type { Order } from "@/types";

const PENDING_KEY = "rush_pos_pending_orders";
const DAILY_KEY_PREFIX = "rush_pos_daily_";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function bumpLocalDailyNumber(): number {
  const key = `${DAILY_KEY_PREFIX}${todayKey()}`;
  const next = (parseInt(localStorage.getItem(key) ?? "0", 10) || 0) + 1;
  localStorage.setItem(key, String(next));
  return next;
}

export type PendingPosOrder = {
  localId: string;
  input: CreateOrderInput;
  order: Order;
  createdAt: string;
  syncAttempts: number;
};

function readPending(): PendingPosOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingPosOrder[]) : [];
  } catch {
    return [];
  }
}

function writePending(list: PendingPosOrder[]) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(list));
}

export function buildInstantPosOrder(input: CreateOrderInput): PendingPosOrder {
  const now = new Date().toISOString();
  const dailyOrderNumber = bumpLocalDailyNumber();
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const order: Order = {
    id: localId,
    orderNumber: String(dailyOrderNumber),
    dailyOrderNumber,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    type: input.type,
    status: "received",
    kitchenStatus: "new",
    items: input.items,
    subtotal: input.subtotal,
    tax: input.tax,
    deliveryCharge: input.deliveryCharge,
    discount: input.discount,
    total: input.total,
    paymentMethod: input.paymentMethod,
    paymentStatus: "pending",
    branchId: RESTAURANT.defaultBranchId,
    source: "pos",
    priority: "normal",
    createdAt: now,
    updatedAt: now,
    tableNumber: input.tableNumber,
    createdBy: input.createdBy,
  };

  const pending: PendingPosOrder = {
    localId,
    input,
    order,
    createdAt: now,
    syncAttempts: 0,
  };

  const list = readPending();
  list.unshift(pending);
  writePending(list.slice(0, 50));

  window.dispatchEvent(new CustomEvent("rush-pos-pending", { detail: order }));
  return pending;
}

export function getPendingPosOrders(): PendingPosOrder[] {
  return readPending();
}

export function getPendingKitchenOrders(): Order[] {
  return readPending().map((p) => p.order);
}

export function removePendingByLocalId(localId: string) {
  writePending(readPending().filter((p) => p.localId !== localId));
}

export function markPendingFailed(localId: string) {
  const list = readPending().map((p) =>
    p.localId === localId ? { ...p, syncAttempts: p.syncAttempts + 1 } : p
  );
  writePending(list);
}
