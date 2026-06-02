import { doc, runTransaction } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/config";
import { COLLECTIONS } from "@/constants";

const SEQUENCE_DOC = "order_sequence";

interface SequenceState {
  windowStartAt: string; // stored as "YYYY-MM-DD" in PKT
  lastNumber: number;
}

/** Returns today's date string in Pakistan Standard Time (UTC+5). */
function todayPKT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

/**
 * Daily order # starting at 1.
 * Resets at midnight Pakistan Standard Time (00:00 PKT = UTC+5).
 */
export async function getNextDailyOrderNumber(): Promise<{
  dailyOrderNumber: number;
  orderNumber: string;
}> {
  const db = getFirestoreDb();
  const ref = doc(getFirestoreDb(), COLLECTIONS.settings, SEQUENCE_DOC);
  const todayKey = todayPKT();

  const dailyOrderNumber = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    let state: SequenceState = snap.exists()
      ? (snap.data() as SequenceState)
      : { windowStartAt: todayKey, lastNumber: 0 };

    // Reset if we've rolled over to a new calendar day in PKT
    if (!snap.exists() || state.windowStartAt !== todayKey) {
      state = { windowStartAt: todayKey, lastNumber: 0 };
    }

    const next = state.lastNumber + 1;
    tx.set(ref, {
      windowStartAt: state.windowStartAt,
      lastNumber: next,
      updatedAt: new Date().toISOString(),
    });

    return next;
  });

  return {
    dailyOrderNumber,
    orderNumber: String(dailyOrderNumber),
  };
}
