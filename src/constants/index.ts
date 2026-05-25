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
    "online_orders",
    "inventory",
    "employees",
    "roles",
    "reports",
    "settings",
    "pos",
    "kitchen",
    "attendance",
  ],
  cashier: ["pos", "orders"],
  kitchen_staff: ["kitchen", "orders"],
  delivery_rider: ["orders", "delivery"],
  employee: ["attendance"],
  customer: ["website"],
};

/** Permissions admin can assign per staff user */
export const STAFF_PERMISSION_OPTIONS = [
  { id: "dashboard", label: "Dashboard", group: "Admin" },
  { id: "menu", label: "Menu management", group: "Admin" },
  { id: "inventory", label: "Inventory", group: "Admin" },
  { id: "orders", label: "All orders", group: "Orders" },
  { id: "online_orders", label: "Online orders only", group: "Orders" },
  { id: "employees", label: "Employees", group: "Admin" },
  { id: "roles", label: "Roles & access", group: "Admin" },
  { id: "reports", label: "Reports", group: "Admin" },
  { id: "attendance", label: "Attendance", group: "Admin" },
  { id: "settings", label: "Settings", group: "Admin" },
  { id: "pos", label: "POS", group: "Operations" },
  { id: "kitchen", label: "Kitchen display", group: "Operations" },
] as const;

export const STAFF_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "manager",
  "cashier",
  "kitchen_staff",
  "delivery_rider",
  "employee",
];

/** Roles super admin can assign to any registered user */
export const ASSIGNABLE_ROLES: {
  value: UserRole;
  label: string;
  group: "Management" | "Staff" | "Other";
  hint: string;
}[] = [
  { value: "admin", label: "Admin", group: "Management", hint: "Full access (use permissions to limit)" },
  { value: "manager", label: "Manager", group: "Management", hint: "Runs restaurant operations" },
  { value: "cashier", label: "Cashier / POS", group: "Staff", hint: "POS & orders" },
  { value: "kitchen_staff", label: "Kitchen staff", group: "Staff", hint: "Kitchen display" },
  { value: "delivery_rider", label: "Delivery rider", group: "Staff", hint: "Delivery orders" },
  { value: "employee", label: "Employee", group: "Staff", hint: "Attendance only by default" },
  { value: "customer", label: "Customer (website only)", group: "Other", hint: "No admin/POS access" },
];

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
