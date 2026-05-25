import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Firestore rejects undefined — remove those fields before write */
export function stripUndefined<T>(obj: T): T {
  if (obj === undefined) return obj;
  if (obj === null || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => stripUndefined(item)) as T;
  }

  if (obj instanceof Date) return obj;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value === undefined) continue;
    result[key] = stripUndefined(value);
  }
  return result as T;
}

export function formatCurrency(amount: number, currency = "PKR"): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Normalize Firestore Timestamp, ISO string, Date, or epoch ms */
export function parseDate(value: unknown): Date | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "object") {
    const v = value as Record<string, unknown>;

    if (typeof v.toDate === "function") {
      const d = (v.toDate as () => Date)();
      return Number.isNaN(d.getTime()) ? null : d;
    }

    const seconds = v.seconds ?? v._seconds;
    if (typeof seconds === "number") {
      const d = new Date(seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  return null;
}

export function formatDate(date: string | Date | unknown): string {
  const parsed = parseDate(date);
  if (!parsed) return "—";

  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function toISOString(date: unknown): string {
  return parseDate(date)?.toISOString() ?? new Date().toISOString();
}

export function generateOrderNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(2, 10).replace(/-/g, "");
  const time = now.getTime().toString().slice(-4);
  return `RPB-${date}-${time}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getWorkingMinutes(checkIn: string, checkOut: string): number {
  const start = parseDate(checkIn)?.getTime();
  const end = parseDate(checkOut)?.getTime();
  if (start == null || end == null) return 0;
  return Math.max(0, Math.floor((end - start) / 60000));
}
