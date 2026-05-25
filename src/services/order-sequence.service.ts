import { doc, runTransaction } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/config";
import { COLLECTIONS } from "@/constants";

const SEQUENCE_DOC = "order_sequence";
const WINDOW_MS = 24 * 60 * 60 * 1000;

interface SequenceState {
  windowStartAt: string;
  lastNumber: number;
}

/** Daily order # starting at 1; resets 24h after first order in window */
export async function getNextDailyOrderNumber(): Promise<{
  dailyOrderNumber: number;
  orderNumber: string;
}> {
  const db = getFirestoreDb();
  const ref = doc(getFirestoreDb(), COLLECTIONS.settings, SEQUENCE_DOC);
  const now = Date.now();

  const dailyOrderNumber = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    let state: SequenceState = snap.exists()
      ? (snap.data() as SequenceState)
      : { windowStartAt: new Date(now).toISOString(), lastNumber: 0 };

    const windowStart = new Date(state.windowStartAt).getTime();
    if (!snap.exists() || now - windowStart >= WINDOW_MS) {
      state = { windowStartAt: new Date(now).toISOString(), lastNumber: 0 };
    }

    const next = state.lastNumber + 1;
    tx.set(ref, {
      windowStartAt: state.windowStartAt,
      lastNumber: next,
      updatedAt: new Date(now).toISOString(),
    });

    return next;
  });

  return {
    dailyOrderNumber,
    orderNumber: String(dailyOrderNumber),
  };
}
