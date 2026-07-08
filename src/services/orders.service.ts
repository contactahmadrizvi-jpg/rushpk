import {
  doc,
  onSnapshot,
} from "firebase/firestore";
import { docToData } from "@/lib/firebase/converters";
import { getFirestoreDb } from "@/lib/firebase/config";
import { COLLECTIONS, RESTAURANT } from "@/constants";
import type { Order, OrderItem, Payment, OrderStatus, KitchenStatus } from "@/types";
import { BaseRepository, orderBy, limit, where } from "./base.repository";
import { deductInventoryForOrder, checkStockForOrderItems, restoreInventoryForOrder } from "./inventory.service";
import { getNextDailyOrderNumber } from "./order-sequence.service";

const ordersRepo = new BaseRepository<Order>(COLLECTIONS.orders);
const paymentsRepo = new BaseRepository<Payment>(COLLECTIONS.payments);

export interface CreateOrderInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  userId?: string;
  type: Order["type"];
  status?: Order["status"];
  kitchenStatus?: KitchenStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryCharge: number;
  discount: number;
  couponCode?: string;
  total: number;
  paymentMethod: Order["paymentMethod"];
  deliveryAddress?: Order["deliveryAddress"];
  deliveryNotes?: string;
  tableId?: string;
  tableNumber?: number;
  source: Order["source"];
  createdBy?: string;
  skipStockCheck?: boolean;
  predefinedDailyOrderNumber?: number;
  predefinedOrderNumber?: string;
  predefinedOrderId?: string;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  if (!input.skipStockCheck) {
    const stock = await checkStockForOrderItems(input.items);
    if (!stock.ok) {
      throw new Error(stock.shortages.join("; "));
    }
  }

  const now = new Date().toISOString();
  
  let dailyOrderNumber = input.predefinedDailyOrderNumber;
  let orderNumber = input.predefinedOrderNumber;

  if (dailyOrderNumber == null || !orderNumber) {
    const next = await getNextDailyOrderNumber();
    dailyOrderNumber = next.dailyOrderNumber;
    orderNumber = next.orderNumber;
  }

  const orderData: Omit<Order, "id"> = {
    orderNumber,
    dailyOrderNumber,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    type: input.type,
    status: input.status ?? "received",
    kitchenStatus: input.kitchenStatus ?? "new",
    items: input.items,
    subtotal: input.subtotal,
    tax: input.tax,
    deliveryCharge: input.deliveryCharge,
    discount: input.discount,
    total: input.total,
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentMethod === "cash" ? "pending" : "paid",
    branchId: RESTAURANT.defaultBranchId,
    source: input.source,
    priority: "normal",
    createdAt: now,
    updatedAt: now,
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
    ...(input.couponCode ? { couponCode: input.couponCode } : {}),
    ...(input.deliveryAddress ? { deliveryAddress: input.deliveryAddress } : {}),
    ...(input.deliveryNotes ? { deliveryNotes: input.deliveryNotes } : {}),
    ...(input.tableId ? { tableId: input.tableId } : {}),
    ...(input.tableNumber != null ? { tableNumber: input.tableNumber } : {}),
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
  };

  let orderId = input.predefinedOrderId;
  if (orderId) {
    const { setDoc, doc } = await import("firebase/firestore");
    const { stripUndefined } = await import("@/lib/utils");
    await setDoc(doc(getFirestoreDb(), COLLECTIONS.orders, orderId), stripUndefined({
      ...orderData,
      updatedAt: now,
    }));
  } else {
    orderId = await ordersRepo.create(orderData);
  }
  const order: Order = { id: orderId, ...orderData };

  if (input.paymentMethod !== "cash" || input.source === "pos") {
    await paymentsRepo.create({
      orderId,
      orderNumber,
      amount: input.total,
      method: input.paymentMethod,
      status: input.paymentMethod === "cash" ? "pending" : "paid",
      createdAt: now,
      createdBy: input.createdBy ?? "system",
    } as Omit<Payment, "id">);
  }

  await deductInventoryForOrder(orderId, input.items, input.createdBy ?? "system");

  return order;
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  kitchenStatus?: KitchenStatus
): Promise<void> {
  const update: Partial<Order> = { status };
  if (kitchenStatus) update.kitchenStatus = kitchenStatus;
  await ordersRepo.update(orderId, update);
}

export function subscribeOrders(
  callback: (orders: Order[]) => void,
  startIso?: string,
  endIso?: string
): () => void {
  const constraints: any[] = [];
  if (startIso) constraints.push(where("createdAt", ">=", startIso));
  if (endIso) constraints.push(where("createdAt", "<=", endIso));
  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(limit(500));

  return ordersRepo.subscribe(constraints, (orders) => {
    callback(orders);
  });
}

const ACTIVE_KITCHEN = new Set(["new", "preparing", "ready"]);
const DONE_STATUS = new Set(["served", "delivered", "cancelled"]);

export function subscribeKitchenOrders(callback: (orders: Order[]) => void): () => void {
  // Use a server-side `where` filter so the limit(100) applies only to active
  // kitchen orders — not all historical orders. Without this, once there are
  // >100 total orders in Firestore the 100-doc window fills up with old served/
  // delivered orders and today's new orders never come back after a refresh.
  // The composite index (kitchenStatus ASC, createdAt ASC) already exists in
  // firestore.indexes.json so this query works without deploying a new index.
  return ordersRepo.subscribe(
    [
      where("kitchenStatus", "in", ["new", "preparing", "ready"]),
      orderBy("createdAt", "asc"),
      limit(100),
    ],
    (orders) => {
      callback(
        orders
          .filter((o) => !DONE_STATUS.has(o.status))
          .sort((a, b) => (a.dailyOrderNumber ?? 0) - (b.dailyOrderNumber ?? 0))
      );
    }
  );
}

export function subscribeDeliveryOrders(callback: (orders: Order[]) => void): () => void {
  const ACTIVE_DELIVERY = new Set(["pending", "received", "preparing", "in_kitchen", "ready", "out_for_delivery"]);
  const DELIVERY_TYPES = new Set(["delivery", "online"]);
  return ordersRepo.subscribe([orderBy("createdAt", "desc"), limit(100)], (orders) => {
    callback(
      orders
        .filter((o) => DELIVERY_TYPES.has(o.type) && ACTIVE_DELIVERY.has(o.status))
        .sort((a, b) => (a.dailyOrderNumber ?? 0) - (b.dailyOrderNumber ?? 0))
    );
  });
}

export async function getOrdersByUser(userId: string): Promise<Order[]> {
  const orders = await ordersRepo.getAll([orderBy("createdAt", "desc"), limit(50)]);
  return orders.filter((o) => o.userId === userId);
}

export async function getOrderById(id: string): Promise<Order | null> {
  return ordersRepo.getById(id);
}

export function subscribeOrderById(
  orderId: string,
  callback: (order: Order | null) => void
): () => void {
  const ref = doc(getFirestoreDb(), COLLECTIONS.orders, orderId);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback(docToData<Order>(snap as never));
  });
}

export async function getTodayOrders(): Promise<Order[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();
  const orders = await ordersRepo.getAll([orderBy("createdAt", "desc"), limit(200)]);
  return orders.filter((o) => o.createdAt >= startIso);
}

export async function deleteOrder(id: string, deletedBy?: string): Promise<void> {
  // ── Step 1: Remove from local pending queue (instant, no network) ──
  if (typeof window !== "undefined") {
    try {
      const m = await import("@/lib/pos-instant");
      m.removePendingByLocalId(id);
      window.dispatchEvent(new CustomEvent("rush-pos-pending"));
    } catch (e) {
      console.error("Failed to remove local pending order:", e);
    }
  }

  // ── Step 2: Fetch order details (for inventory restore) ──
  let order: Order | null = null;
  try {
    order = await ordersRepo.getById(id);
  } catch (e) {
    console.error("Failed to fetch order for cleanup:", e);
  }

  // ── Step 3: DELETE THE ORDER FROM FIRESTORE FIRST ──
  // Do this before any cleanup so even if cleanup fails the order is gone.
  await ordersRepo.delete(id);

  // ── Step 4: Restore inventory asynchronously (non-blocking) ──
  if (order?.items?.length) {
    restoreInventoryForOrder(id, order.items, deletedBy ?? "system").catch((e) =>
      console.error("Failed to restore inventory on order delete:", e)
    );
  }

  // ── Step 5: Delete associated payment documents ──
  import("firebase/firestore")
    .then(async ({ getDocs, query, collection, where, writeBatch }) => {
      const { getFirestoreDb } = await import("@/lib/firebase/config");
      const db = getFirestoreDb();
      const q = query(collection(db, "payments"), where("orderId", "==", id));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        const batch = writeBatch(db);
        qSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    })
    .catch((e) => console.error("Failed to delete payments for order:", e));

  // ── Step 6: Delete delivery & credit records (best-effort) ──
  import("firebase/firestore")
    .then(async ({ doc, deleteDoc }) => {
      const { getFirestoreDb } = await import("@/lib/firebase/config");
      const db = getFirestoreDb();
      await Promise.allSettled([
        deleteDoc(doc(db, "deliveries", id)),
        deleteDoc(doc(db, "credits", id)),
      ]);
    })
    .catch((e) => console.error("Failed to delete delivery/credit records:", e));
}

export { ordersRepo, paymentsRepo };
