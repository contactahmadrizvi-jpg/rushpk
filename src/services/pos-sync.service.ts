import { createOrder } from "@/services/orders.service";
import {
  getPendingPosOrders,
  markPendingFailed,
  removePendingByLocalId,
} from "@/lib/pos-instant";

let syncing = false;

/** Saves pending POS orders to Firestore in the background */
export async function syncPendingPosOrders(): Promise<void> {
  if (syncing || typeof window === "undefined") return;
  const pending = getPendingPosOrders();
  if (!pending.length) return;

  syncing = true;
  try {
    for (const item of pending) {
      try {
        await createOrder({ ...item.input, skipStockCheck: true });
        removePendingByLocalId(item.localId);
      } catch {
        markPendingFailed(item.localId);
      }
    }
  } finally {
    syncing = false;
  }
}

export function startPosSyncWorker() {
  if (typeof window === "undefined") return () => {};
  void syncPendingPosOrders();
  const id = window.setInterval(() => void syncPendingPosOrders(), 8000);
  const onOnline = () => void syncPendingPosOrders();
  window.addEventListener("online", onOnline);
  return () => {
    window.clearInterval(id);
    window.removeEventListener("online", onOnline);
  };
}
