import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/config";
import { COLLECTIONS } from "@/constants";
import type { AppUser, UserRole } from "@/types";

function mapUserDoc(d: { id: string; data: () => Record<string, unknown> }): AppUser {
  const data = d.data();
  return {
    id: d.id,
    email: (data.email as string) ?? "",
    displayName: (data.displayName as string) ?? (data.name as string) ?? "User",
    phone: data.phone as string | undefined,
    role: (data.role as UserRole) ?? "customer",
    permissions: data.permissions as string[] | undefined,
    photoURL: data.photoURL as string | undefined,
    createdAt: (data.createdAt as string) ?? "",
    updatedAt: (data.updatedAt as string) ?? "",
    isActive: data.isActive !== false,
  };
}

/** Every user document in Firestore `users` collection */
export async function listAllRegisteredUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(getFirestoreDb(), COLLECTIONS.users));
  return snap.docs
    .map((docSnap) => mapUserDoc({ id: docSnap.id, data: () => docSnap.data() }))
    .sort((a, b) => {
      const aStaff = a.role !== "customer" ? 0 : 1;
      const bStaff = b.role !== "customer" ? 0 : 1;
      if (aStaff !== bStaff) return aStaff - bStaff;
      return a.displayName.localeCompare(b.displayName);
    });
}

export async function listStaffUsers(): Promise<AppUser[]> {
  const all = await listAllRegisteredUsers();
  return all.filter((u) => u.role !== "customer");
}

export async function updateUserAccess(
  userId: string,
  data: { role?: UserRole; permissions?: string[]; isActive?: boolean }
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (data.role !== undefined) payload.role = data.role;
  if (data.permissions !== undefined) payload.permissions = data.permissions;
  if (data.isActive !== undefined) payload.isActive = data.isActive;

  await updateDoc(doc(getFirestoreDb(), COLLECTIONS.users, userId), payload);
}
