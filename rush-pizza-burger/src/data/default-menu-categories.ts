import type { MenuCategory } from "@/types";

export type DefaultCategoryDef = {
  id: string;
  name: string;
  slug: string;
  type: MenuCategory["type"];
  sortOrder: number;
  description?: string;
};

/** Default Rush menu categories — created in Firestore if missing. */
export const DEFAULT_MENU_CATEGORIES: DefaultCategoryDef[] = [
  { id: "cat-shawarma", name: "Shawarma", slug: "shawarma", type: "other", sortOrder: 1 },
  { id: "cat-wraps", name: "Wraps", slug: "wraps", type: "other", sortOrder: 2 },
  { id: "cat-beef-burger", name: "Beef Burger", slug: "beef-burger", type: "burger", sortOrder: 3 },
  { id: "cat-chicken-burger", name: "Chicken Burger", slug: "chicken-burger", type: "burger", sortOrder: 4 },
  { id: "cat-paratha", name: "Parathas", slug: "parathas", type: "other", sortOrder: 5 },
  { id: "cat-sides", name: "Side Orders", slug: "side-orders", type: "sides", sortOrder: 6 },
  { id: "cat-pizza", name: "Pizzas", slug: "pizzas", type: "pizza", sortOrder: 7 },
  { id: "cat-premium-pizza", name: "Premium Pizzas", slug: "premium-pizzas", type: "pizza", sortOrder: 8 },
];

/** Category sections shown on the customer home page (in order). */
export const HOME_MENU_SECTION_IDS = [
  "cat-beef-burger",
  "cat-chicken-burger",
  "cat-paratha",
  "cat-pizza",
  "cat-premium-pizza",
  "cat-shawarma",
  "cat-wraps",
  "cat-sides",
] as const;
