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
import type { InventoryItem, Recipe, StockMovement, OrderItem, Deal } from "@/types";
import { BaseRepository, orderBy } from "./base.repository";

const inventoryRepo = new BaseRepository<InventoryItem>(
  COLLECTIONS.inventoryItems
);
const recipeRepo = new BaseRepository<Recipe>(COLLECTIONS.recipes);
const movementRepo = new BaseRepository<StockMovement>(
  COLLECTIONS.stockMovements
);
const dealsRepo = new BaseRepository<Deal>(COLLECTIONS.deals);

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

interface ResolvedRecipeItem {
  menuItemId: string;
  name: string;
  quantity: number;
  variantId?: string;
}

async function resolveOrderItemsToRecipes(items: OrderItem[]): Promise<ResolvedRecipeItem[]> {
  const resolved: ResolvedRecipeItem[] = [];
  for (const item of items) {
    if (item.menuItemId.startsWith("deal-")) {
      const dealId = item.menuItemId.slice(5);

      // ── Snapshot-first: use data stored on the order item at sale time ──
      // Falls back to Firestore only if no snapshot (older orders placed before this fix)
      let menuItemIds: string[] | undefined;
      let itemQuantities: Record<string, number> | undefined;
      let selectedVariants: Record<string, string> | undefined;

      if (item.dealSnapshot && item.dealSnapshot.menuItemIds.length > 0) {
        menuItemIds = item.dealSnapshot.menuItemIds;
        itemQuantities = item.dealSnapshot.itemQuantities;
        selectedVariants = item.dealSnapshot.selectedVariants;
      } else {
        // Fallback: fetch live deal from Firestore (deal may have been deleted/changed)
        const deal = await dealsRepo.getById(dealId);
        if (deal && deal.menuItemIds) {
          menuItemIds = deal.menuItemIds;
          itemQuantities = deal.itemQuantities as Record<string, number> | undefined;
          selectedVariants = deal.selectedVariants as Record<string, string> | undefined;
        }
      }

      if (menuItemIds) {
        for (const subId of menuItemIds) {
          const variantId = selectedVariants?.[subId];
          const subQty = itemQuantities?.[subId] ?? 1;
          resolved.push({
            menuItemId: subId,
            name: `${item.name} -> (Item in deal)`,
            quantity: item.quantity * subQty,
            variantId,
          });
        }
      }
    } else {
      resolved.push({
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
        variantId: item.customization?.variantId,
      });
    }
  }
  return resolved;
}

export async function checkStockForOrderItems(
  items: OrderItem[]
): Promise<{ ok: boolean; shortages: string[] }> {
  const shortages: string[] = [];
  const resolvedItems = await resolveOrderItemsToRecipes(items);

  for (const orderItem of resolvedItems) {
    // Try size-specific recipe first (e.g. menuItemId_small), then base recipe
    const variantId = orderItem.variantId;
    const sizeRecipeId = variantId ? `${orderItem.menuItemId}_${variantId}` : null;
    const recipe = (sizeRecipeId ? await getRecipeByMenuItemId(sizeRecipeId) : null)
      ?? await getRecipeByMenuItemId(orderItem.menuItemId);
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
  const now = new Date().toISOString();

  const resolvedItems = await resolveOrderItemsToRecipes(items);

  // Accumulate total deductions per inventory item across ALL products
  // (critical for deals: multiple products may share the same ingredient)
  const deductions = new Map<string, {
    inventoryItemId: string;
    inventoryItemName: string;
    unit: string;
    totalQty: number;
    notes: string[];
  }>();

  for (const orderItem of resolvedItems) {
    // Try size-specific recipe first, fall back to base recipe
    const variantId = orderItem.variantId;
    const sizeRecipeId = variantId ? `${orderItem.menuItemId}_${variantId}` : null;
    const recipe = (sizeRecipeId ? await getRecipeByMenuItemId(sizeRecipeId) : null)
      ?? await getRecipeByMenuItemId(orderItem.menuItemId);
    if (!recipe) continue;

    for (const ing of recipe.ingredients) {
      const deductQty = ing.quantity * orderItem.quantity;
      const existing = deductions.get(ing.inventoryItemId);
      if (existing) {
        existing.totalQty += deductQty;
        existing.notes.push(`${orderItem.name} x${orderItem.quantity}`);
      } else {
        deductions.set(ing.inventoryItemId, {
          inventoryItemId: ing.inventoryItemId,
          inventoryItemName: ing.inventoryItemName,
          unit: ing.unit,
          totalQty: deductQty,
          notes: [`${orderItem.name} x${orderItem.quantity}`],
        });
      }
    }
  }

  // Now write each inventory item exactly once with the correct total
  const batch = writeBatch(db);
  for (const d of deductions.values()) {
    const inv = await inventoryRepo.getById(d.inventoryItemId);
    if (!inv) continue;

    const newStock = Math.max(0, inv.currentStock - d.totalQty);
    batch.update(doc(db, COLLECTIONS.inventoryItems, d.inventoryItemId), {
      currentStock: newStock,
      updatedAt: now,
    });

    batch.set(doc(collection(db, COLLECTIONS.stockMovements)), {
      inventoryItemId: d.inventoryItemId,
      inventoryItemName: d.inventoryItemName,
      type: "sale_deduction",
      quantity: d.totalQty,
      unit: d.unit,
      referenceId: orderId,
      notes: `Order: ${d.notes.join(", ")}`,
      createdAt: now,
      createdBy,
    });
  }

  await batch.commit();
}

export async function restoreInventoryForOrder(
  orderId: string,
  items: OrderItem[],
  updatedBy: string
): Promise<void> {
  const db = getFirestoreDb();
  const now = new Date().toISOString();

  const resolvedItems = await resolveOrderItemsToRecipes(items);

  // Accumulate total restorations per inventory item across ALL products
  const restorations = new Map<string, {
    inventoryItemId: string;
    inventoryItemName: string;
    unit: string;
    totalQty: number;
    notes: string[];
  }>();

  for (const orderItem of resolvedItems) {
    // Try size-specific recipe first, fall back to base recipe
    const variantId = orderItem.variantId;
    const sizeRecipeId = variantId ? `${orderItem.menuItemId}_${variantId}` : null;
    const recipe = (sizeRecipeId ? await getRecipeByMenuItemId(sizeRecipeId) : null)
      ?? await getRecipeByMenuItemId(orderItem.menuItemId);
    if (!recipe) continue;

    for (const ing of recipe.ingredients) {
      const restoreQty = ing.quantity * orderItem.quantity;
      const existing = restorations.get(ing.inventoryItemId);
      if (existing) {
        existing.totalQty += restoreQty;
        existing.notes.push(`${orderItem.name} x${orderItem.quantity}`);
      } else {
        restorations.set(ing.inventoryItemId, {
          inventoryItemId: ing.inventoryItemId,
          inventoryItemName: ing.inventoryItemName,
          unit: ing.unit,
          totalQty: restoreQty,
          notes: [`${orderItem.name} x${orderItem.quantity}`],
        });
      }
    }
  }

  // Now write each inventory item exactly once with the correct total
  const batch = writeBatch(db);
  for (const r of restorations.values()) {
    const inv = await inventoryRepo.getById(r.inventoryItemId);
    if (!inv) continue;

    const newStock = inv.currentStock + r.totalQty;
    batch.update(doc(db, COLLECTIONS.inventoryItems, r.inventoryItemId), {
      currentStock: newStock,
      updatedAt: now,
    });

    batch.set(doc(collection(db, COLLECTIONS.stockMovements)), {
      inventoryItemId: r.inventoryItemId,
      inventoryItemName: r.inventoryItemName,
      type: "return",
      quantity: r.totalQty,
      unit: r.unit,
      referenceId: orderId,
      notes: `Order deleted: ${r.notes.join(", ")}`,
      createdAt: now,
      createdBy: updatedBy,
    });
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

  const updatePayload: Partial<InventoryItem> = {
    currentStock: newStock,
  };

  if (type === "purchase" || type === "return") {
    updatePayload.totalStock = (item.totalStock || item.currentStock) + quantity;
  }

  await inventoryRepo.update(inventoryItemId, updatePayload);

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
