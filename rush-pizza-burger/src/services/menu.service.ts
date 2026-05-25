import { doc, getDoc, setDoc } from "firebase/firestore";
import { COLLECTIONS } from "@/constants";
import { DEFAULT_MENU_CATEGORIES } from "@/data/default-menu-categories";
import { getFirestoreDb } from "@/lib/firebase/config";
import { stripUndefined } from "@/lib/utils";
import type { MenuCategory, MenuItem, Deal } from "@/types";
import { BaseRepository, where, orderBy, limit } from "./base.repository";

const categoriesRepo = new BaseRepository<MenuCategory>(COLLECTIONS.menuCategories);
const itemsRepo = new BaseRepository<MenuItem>(COLLECTIONS.menuItems);
const dealsRepo = new BaseRepository<Deal>(COLLECTIONS.deals);

/** Creates default categories in Firestore when they do not exist yet. */
export async function ensureDefaultCategories(): Promise<void> {
  const db = getFirestoreDb();
  const now = new Date().toISOString();
  for (const def of DEFAULT_MENU_CATEGORIES) {
    const ref = doc(db, COLLECTIONS.menuCategories, def.id);
    const snap = await getDoc(ref);
    if (snap.exists()) continue;
    await setDoc(
      ref,
      stripUndefined({
        name: def.name,
        slug: def.slug,
        description: def.description ?? def.name,
        sortOrder: def.sortOrder,
        isActive: true,
        type: def.type,
        createdAt: now,
        updatedAt: now,
      })
    );
  }
}

export async function getActiveCategories(): Promise<MenuCategory[]> {
  await ensureDefaultCategories();
  const all = await categoriesRepo.getAll([orderBy("sortOrder")]);
  return all.filter((c) => c.isActive);
}

function normalizeMenuItem(item: MenuItem): MenuItem {
  const raw = item as MenuItem & { image?: string };
  const imageUrl = item.imageUrl?.trim() || raw.image?.trim() || undefined;
  return imageUrl ? { ...item, imageUrl } : item;
}

function normalizeMenuItems(items: MenuItem[]): MenuItem[] {
  return items.map(normalizeMenuItem);
}

export async function getMenuItems(categoryId?: string): Promise<MenuItem[]> {
  const all = normalizeMenuItems(await itemsRepo.getAll([orderBy("sortOrder")]));
  if (categoryId) return all.filter((i) => i.categoryId === categoryId);
  return all;
}

export async function getAvailableMenuItems(): Promise<MenuItem[]> {
  const all = normalizeMenuItems(await itemsRepo.getAll([orderBy("sortOrder")]));
  return all.filter((i) => i.isAvailable);
}

export async function getPopularItems(): Promise<MenuItem[]> {
  const all = await getAvailableMenuItems();
  return all.filter((i) => i.isPopular).slice(0, 8);
}

export async function getFeaturedItems(): Promise<MenuItem[]> {
  const all = await getAvailableMenuItems();
  return all.filter((i) => i.isFeatured).slice(0, 8);
}

export function subscribeMenuItems(callback: (items: MenuItem[]) => void): () => void {
  return itemsRepo.subscribe([orderBy("sortOrder")], (items) => {
    callback(
      normalizeMenuItems(items.filter((i) => i.isAvailable !== false))
    );
  });
}

export async function getActiveDeals(): Promise<Deal[]> {
  const now = new Date().toISOString();
  const deals = await dealsRepo.getAll([where("isActive", "==", true)]);
  return deals.filter((d) => d.validFrom <= now && d.validTo >= now);
}

export { categoriesRepo, itemsRepo, dealsRepo };
