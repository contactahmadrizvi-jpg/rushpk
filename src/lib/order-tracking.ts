const STORAGE_KEY = "rush_active_orders";

export type TrackedOrderRef = {
  orderId: string;
  placedAt: string;
};

const DONE_STATUSES = new Set(["delivered", "served", "cancelled"]);

export function isOrderComplete(status: string): boolean {
  return DONE_STATUSES.has(status);
}

export function getActiveTrackedOrders(): TrackedOrderRef[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as TrackedOrderRef[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addTrackedOrder(orderId: string): void {
  if (typeof window === "undefined" || !orderId) return;
  const list = getActiveTrackedOrders().filter((o) => o.orderId !== orderId);
  list.unshift({ orderId, placedAt: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 20)));
}

export function removeTrackedOrder(orderId: string): void {
  if (typeof window === "undefined") return;
  const list = getActiveTrackedOrders().filter((o) => o.orderId !== orderId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function pruneCompletedOrders(orders: { orderId: string; status: string }[]): void {
  for (const o of orders) {
    if (isOrderComplete(o.status)) removeTrackedOrder(o.orderId);
  }
}
