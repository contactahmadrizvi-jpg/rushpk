import {
  type DocumentData,
  type QueryDocumentSnapshot,
  Timestamp,
} from "firebase/firestore";

export function docToData<T extends { id: string }>(
  snap: QueryDocumentSnapshot<DocumentData>
): T {
  const data = snap.data();
  return {
    id: snap.id,
    ...serializeTimestamps(data),
  } as T;
}

function isTimestampLike(value: unknown): value is { seconds: number; nanoseconds?: number } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.seconds === "number" || typeof v._seconds === "number";
}

function timestampToISO(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value && typeof value === "object" && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (isTimestampLike(value)) {
    const seconds = (value as { seconds?: number; _seconds?: number }).seconds
      ?? (value as { _seconds?: number })._seconds
      ?? 0;
    return new Date(seconds * 1000).toISOString();
  }
  return String(value);
}

function serializeTimestamps(data: DocumentData): DocumentData {
  const result: DocumentData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Timestamp || isTimestampLike(value) ||
        (value && typeof value === "object" && typeof (value as { toDate?: () => Date }).toDate === "function")) {
      result[key] = timestampToISO(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? serializeTimestamps(item as DocumentData)
          : item
      );
    } else if (value && typeof value === "object") {
      result[key] = serializeTimestamps(value as DocumentData);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function toFirestoreDate(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(iso));
}
