import type { UserRole } from "@/types";

export const RESTAURANT = {
  name: "Rush Pizza and Burger",
  location: "Sheikhupura, Pakistan",
  phone: "+92 300 0000000",
  email: "orders@rushpizza.pk",
  defaultBranchId: "branch-sheikhupura",
} as const;

export const COLLECTIONS = {
  users: "users",
  employees: "employees",
  menuCategories: "menu_categories",
  menuItems: "menu_items",
  recipes: "recipes",
  inventoryItems: "inventory_items",
  suppliers: "suppliers",
  purchases: "purchases",
  stockMovements: "stock_movements",
  orders: "orders",
  tables: "tables",
  payments: "payments",
  expenses: "expenses",
  attendance: "attendance",
  notifications: "notifications",
  coupons: "coupons",
  deals: "deals",
  settings: "settings",
  auditLogs: "audit_logs",
} as const;

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ["*"],
  admin: ["*"],
  manager: [
    "dashboard",
    "menu",
    "orders",
    "inventory",
    "employees",
    "reports",
    "settings",
    "pos",
    "kitchen",
    "coupons",
    "deals",
  ],
  cashier: ["pos", "orders", "tables"],
  kitchen_staff: ["kitchen", "orders"],
  delivery_rider: ["orders", "delivery"],
  employee: ["attendance", "profile"],
  customer: ["website", "profile", "orders"],
};

export const ADMIN_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "manager",
  "cashier",
  "kitchen_staff",
  "delivery_rider",
  "employee",
];

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  received: "Order Received",
  preparing: "Preparing",
  in_kitchen: "In Kitchen",
  ready: "Ready",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  served: "Served",
  cancelled: "Cancelled",
  held: "On Hold",
};

export const KITCHEN_STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500",
  preparing: "bg-amber-500",
  ready: "bg-emerald-500",
  served: "bg-slate-500",
};

export const DEFAULT_TAX_RATE = 0;
export const DEFAULT_DELIVERY_CHARGE = 150;
