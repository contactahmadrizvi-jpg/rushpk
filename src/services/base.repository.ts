import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type QueryConstraint,
  type Unsubscribe,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/config";
import { docToData } from "@/lib/firebase/converters";
import { stripUndefined } from "@/lib/utils";

export class BaseRepository<T extends { id: string }> {
  constructor(protected collectionName: string) {}

  protected get col() {
    return collection(getFirestoreDb(), this.collectionName);
  }

  async getById(id: string): Promise<T | null> {
    const snap = await getDoc(doc(getFirestoreDb(), this.collectionName, id));
    if (!snap.exists()) return null;
    return docToData<T>(snap as never);
  }

  async getAll(constraints: QueryConstraint[] = []): Promise<T[]> {
    const q = query(this.col, ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToData<T>(d));
  }

  subscribe(
    constraints: QueryConstraint[],
    callback: (items: T[]) => void
  ): Unsubscribe {
    const q = query(this.col, ...constraints);
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => docToData<T>(d)));
    });
  }

  async create(data: Omit<T, "id">): Promise<string> {
    const payload = stripUndefined({
      ...data,
      createdAt: (data as Record<string, unknown>).createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Record<string, unknown>);
    const ref = await addDoc(this.col, payload);
    return ref.id;
  }

  async update(id: string, data: Partial<T>): Promise<void> {
    const payload = stripUndefined({
      ...data,
      updatedAt: new Date().toISOString(),
    } as Record<string, unknown>);
    await updateDoc(doc(getFirestoreDb(), this.collectionName, id), payload);
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(getFirestoreDb(), this.collectionName, id));
  }
}

export { query, where, orderBy, limit, serverTimestamp };
