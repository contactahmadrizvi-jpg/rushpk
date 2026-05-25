/**
 * One-time: delete all Firestore documents from the old menu seed.
 * Run: node scripts/purge-seed-data.mjs
 * Requires .env.local with Firebase vars (loaded via dotenv if installed) or set env manually.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  writeBatch,
} from "firebase/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  try {
    const raw = readFileSync(join(root, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch {
    console.warn("No .env.local found — use environment variables");
  }
}

loadEnv();

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const COLLECTIONS = {
  menuItems: "menu_items",
  recipes: "recipes",
  inventoryItems: "inventory_items",
  menuCategories: "menu_categories",
  coupons: "coupons",
  tables: "tables",
};

const SEED_MENU_IDS = [
  "item-grill-shawarma", "item-zinger-shawarma", "item-chicken-shawarma",
  "item-arabian-wrap", "item-mexican-wrap",
  "item-carnivore", "item-jalapeno-beef", "item-rush-shroom", "item-beef-monster",
  "item-chicken-paratha", "item-zinger-paratha", "item-pizza-paratha",
  "item-wings", "item-nuggets", "item-plain-fries-m", "item-plain-fries-l",
  "item-loaded-fries-m", "item-loaded-fries-l",
  "item-chicken-tikka-small", "item-chicken-tikka-medium", "item-chicken-tikka-large", "item-chicken-tikka-family",
  "item-fajita-small", "item-fajita-medium", "item-fajita-large", "item-fajita-family",
  "item-rush-special-medium", "item-rush-special-large", "item-rush-special-family",
  "item-behari-stuffer-medium", "item-behari-stuffer-large", "item-behari-stuffer-family",
  "item-crown-crust-medium", "item-crown-crust-large", "item-crown-crust-family",
  "item-chicago-delight-small", "item-creamy-small", "item-classic-burger",
];

const SEED_CATEGORY_IDS = [
  "cat-shawarma", "cat-wraps", "cat-beef-burger", "cat-paratha", "cat-sides",
  "cat-classic-pizza", "cat-premium-pizza", "cat-super-pizza", "cat-pizza", "cat-burger",
];

const SEED_INVENTORY_IDS = [
  "inv-shawarma-bread", "inv-wrap", "inv-bun", "inv-paratha", "inv-cheese-gram",
  "inv-cheese-slice", "inv-chicken-boneless", "inv-zinger-piece", "inv-beef",
  "inv-pizza-dough", "inv-kabab", "inv-fries", "inv-loaded-fries", "inv-wing", "inv-nugget",
  "inv-cheese", "inv-patty", "inv-sauce",
];

const SEED_RECIPE_IDS = [...SEED_MENU_IDS.map((id) => `recipe-${id}`), "recipe-burger"];

async function batchDelete(db, collection, ids) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + 400)) {
      batch.delete(doc(db, collection, id));
      n++;
    }
    await batch.commit();
  }
  return n;
}

async function main() {
  if (!firebaseConfig.projectId) {
    console.error("Missing Firebase config in .env.local");
    process.exit(1);
  }
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  let total = 0;
  total += await batchDelete(db, COLLECTIONS.menuItems, SEED_MENU_IDS);
  total += await batchDelete(db, COLLECTIONS.recipes, SEED_RECIPE_IDS);
  total += await batchDelete(db, COLLECTIONS.inventoryItems, SEED_INVENTORY_IDS);
  total += await batchDelete(db, COLLECTIONS.menuCategories, SEED_CATEGORY_IDS);
  total += await batchDelete(db, COLLECTIONS.coupons, ["coupon-welcome"]);
  total += await batchDelete(
    db,
    COLLECTIONS.tables,
    Array.from({ length: 12 }, (_, i) => `table-${i + 1}`)
  );

  console.log(`Deleted ${total} seed documents from Firestore.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
