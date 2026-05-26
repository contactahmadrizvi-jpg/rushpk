import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/config";
import { COLLECTIONS, RESTAURANT } from "@/constants";
import type { RestaurantSettings } from "@/types";

const SETTINGS_DOC_ID = "main";

export async function getSettings(): Promise<RestaurantSettings | null> {
  const snap = await getDoc(
    doc(getFirestoreDb(), COLLECTIONS.settings, SETTINGS_DOC_ID)
  );
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as RestaurantSettings;
}

export async function saveSettings(
  settings: Partial<RestaurantSettings>
): Promise<void> {
  const existing = await getSettings();
  const now = new Date().toISOString();
  await setDoc(
    doc(getFirestoreDb(), COLLECTIONS.settings, SETTINGS_DOC_ID),
    {
      ...existing,
      ...settings,
      id: SETTINGS_DOC_ID,
      updatedAt: now,
    },
    { merge: true }
  );
}

export function getDefaultSettings(): RestaurantSettings {
  return {
    id: SETTINGS_DOC_ID,
    name: RESTAURANT.name,
    tagline: "Premium Pizza & Burgers in Sheikhupura",
    phone: RESTAURANT.phone,
    email: RESTAURANT.email,
    address: RESTAURANT.location,
    city: "",
    currency: "PKR",
    taxRate: 0,
    deliveryCharge: 150,
    freeDeliveryAbove: 2000,
    openingHours: Array.from({ length: 7 }, (_, day) => ({
      day,
      open: "11:00",
      close: "23:00",
      isClosed: false,
    })),
    branches: [
      {
        id: RESTAURANT.defaultBranchId,
        name: "Sheikhupura Main",
        address: "Sheikhupura, Pakistan",
        lat: 31.7131,
        lng: 73.9783,
        isDefault: true,
      },
    ],
    notificationSettings: {
      orderSound: true,
      whatsappOrders: true,
      lowStockAlerts: true,
    },
    printerSettings: {
      kotEnabled: true,
      receiptEnabled: true,
      restaurantName: RESTAURANT.name,
    },
    updatedAt: new Date().toISOString(),
  };
}
