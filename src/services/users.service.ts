import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/config";
import { COLLECTIONS } from "@/constants";
import type { AppUser, UserRole } from "@/types";

export async function listStaffUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(getFirestoreDb(), COLLECTIONS.users));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        email: data.email ?? "",
        displayName: data.displayName ?? data.name ?? "User",
        phone: data.phone,
        role: (data.role as UserRole) ?? "customer",
        permissions: data.permissions as string[] | undefined,
        photoURL: data.photoURL,
        createdAt: data.createdAt ?? "",
        updatedAt: data.updatedAt ?? "",
        isActive: data.isActive !== false,
      } satisfies AppUser;
    })
    .filter((u) => u.role !== "customer")
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function updateUserAccess(
  userId: string,
  data: { role?: UserRole; permissions?: string[]; isActive?: boolean }
): Promise<void> {
  await updateDoc(doc(getFirestoreDb(), COLLECTIONS.users, userId), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}
