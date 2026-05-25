import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase/config";
import { COLLECTIONS, ROLE_PERMISSIONS } from "@/constants";
import type { AppUser, UserRole } from "@/types";

export async function registerUser(
  email: string,
  password: string,
  displayName: string,
  phone?: string,
  role: UserRole = "customer"
): Promise<AppUser> {
  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });

  const now = new Date().toISOString();
  const userData: Omit<AppUser, "id"> = {
    email,
    displayName,
    phone,
    role,
    createdAt: now,
    updatedAt: now,
    isActive: true,
  };

  await setDoc(doc(getFirestoreDb(), COLLECTIONS.users, cred.user.uid), userData);

  return { id: cred.user.uid, ...userData };
}

export async function loginUser(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logoutUser(): Promise<void> {
  await signOut(getFirebaseAuth());
}

export async function getUserProfile(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(getFirestoreDb(), COLLECTIONS.users, uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    email: data.email ?? "",
    displayName: data.displayName ?? data.name ?? "User",
    phone: data.phone,
    role: (data.role as UserRole) ?? "customer",
    photoURL: data.photoURL,
    addresses: data.addresses,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
    isActive: data.isActive !== false,
  };
}

export function subscribeAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

export function hasPermission(role: UserRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes("*") || perms.includes(permission);
}
