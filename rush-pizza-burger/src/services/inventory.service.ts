import {
  doc,
  writeBatch,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/config";
import { COLLECTIONS } from "@/constants";
import type { InventoryItem, Recipe, StockMovement, OrderItem } from "@/types";
import { BaseRepository, orderBy } from "./base.repository";

const inventoryRepo = new BaseRepository<InventoryItem>(
  COLLECTIONS.inventoryItems
);
const recipeRepo = new BaseRepository<Recipe>(COLLECTIONS.recipes);
const movementRepo = new BaseRepository<StockMovement>(
  COLLECTIONS.stockMovements
);

export async function getInventoryItems(): Promise<InventoryItem[]> {
  return inventoryRepo.getAll([orderBy("name")]);
}

export async function getLowStockItems(): Promise<InventoryItem[]> {
  const items = await getInventoryItems();
  return items.filter((i) => i.isActive && i.currentStock <= i.minStock);
}

export async function getRecipeByMenuItemId(
  menuItemId: string
): Promise<Recipe | null> {
  const db = getFirestoreDb();
  const q = query(
    collection(db, COLLECTIONS.recipes),
    where("menuItemId", "==", menuItemId)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0]!;
  return { id: d.id, ...d.data() } as Recipe;
}

export async function checkStockForOrderItems(
  items: OrderItem[]
): Promise<{ ok: boolean; shortages: string[] }> {
  const shortages: string[] = [];

  for (const orderItem of items) {
    const recipe = await getRecipeByMenuItemId(orderItem.menuItemId);
    if (!recipe) continue;

    for (const ing of recipe.ingredients) {
      const inv = await inventoryRepo.getById(ing.inventoryItemId);
      if (!inv) continue;
      const needed = ing.quantity * orderItem.quantity;
      if (inv.preventSellWhenLow && inv.currentStock < needed) {
        shortages.push(
          `${orderItem.name}: insufficient ${inv.name} (need ${needed} ${inv.unit}, have ${inv.currentStock} ${inv.unit})`
        );
      }
    }
  }

  return { ok: shortages.length === 0, shortages };
}

export async function deductInventoryForOrder(
  orderId: string,
  items: OrderItem[],
  createdBy: string
): Promise<void> {
  const db = getFirestoreDb();
  const batch = writeBatch(db);
  const now = new Date().toISOString();

  for (const orderItem of items) {
    const recipe = await getRecipeByMenuItemId(orderItem.menuItemId);
    if (!recipe) continue;

    for (const ing of recipe.ingredients) {
      const inv = await inventoryRepo.getById(ing.inventoryItemId);
      if (!inv) continue;

      const deductQty = ing.quantity * orderItem.quantity;
      const newStock = Math.max(0, inv.currentStock - deductQty);

      batch.update(doc(db, COLLECTIONS.inventoryItems, ing.inventoryItemId), {
        currentStock: newStock,
        updatedAt: now,
      });

      batch.set(doc(collection(db, COLLECTIONS.stockMovements)), {
        inventoryItemId: ing.inventoryItemId,
        inventoryItemName: ing.inventoryItemName,
        type: "sale_deduction",
        quantity: deductQty,
        unit: ing.unit,
        referenceId: orderId,
        notes: `Order: ${orderItem.name} x${orderItem.quantity}`,
        createdAt: now,
        createdBy,
      });
    }
  }

  await batch.commit();
}

export async function adjustStock(
  inventoryItemId: string,
  quantity: number,
  type: StockMovement["type"],
  notes: string,
  createdBy: string
): Promise<void> {
  const item = await inventoryRepo.getById(inventoryItemId);
  if (!item) throw new Error("Inventory item not found");

  const delta =
    type === "purchase" || type === "return" ? quantity : -Math.abs(quantity);
  const newStock = Math.max(0, item.currentStock + delta);

  await inventoryRepo.update(inventoryItemId, {
    currentStock: newStock,
  } as Partial<InventoryItem>);

  await movementRepo.create({
    inventoryItemId,
    inventoryItemName: item.name,
    type,
    quantity: Math.abs(quantity),
    unit: item.unit,
    notes,
    createdAt: new Date().toISOString(),
    createdBy,
  } as Omit<StockMovement, "id">);
}

export async function saveRecipeForMenuItem(
  menuItemId: string,
  menuItemName: string,
  ingredients: Recipe["ingredients"]
): Promise<void> {
  const existing = await getRecipeByMenuItemId(menuItemId);
  const now = new Date().toISOString();
  if (existing) {
    await recipeRepo.update(existing.id, {
      menuItemName,
      ingredients,
      updatedAt: now,
    } as Partial<Recipe>);
  } else {
    await recipeRepo.create({
      menuItemId,
      menuItemName,
      ingredients,
      updatedAt: now,
    } as Omit<Recipe, "id">);
  }
}

export { inventoryRepo, recipeRepo, movementRepo };
