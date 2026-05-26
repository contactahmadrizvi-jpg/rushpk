import { ROLE_PERMISSIONS } from "@/constants";
import type { AppUser, UserRole } from "@/types";

export function resolveUserPermissions(user: AppUser | null | undefined): string[] {
  if (!user) return [];
  if (user.permissions && user.permissions.length > 0) return user.permissions;
  return ROLE_PERMISSIONS[user.role] ?? [];
}

export function userHasPermission(
  user: AppUser | null | undefined,
  permission: string
): boolean {
  const perms = resolveUserPermissions(user);
  return perms.includes("*") || perms.includes(permission);
}

export function isSuperAdmin(user: AppUser | null | undefined): boolean {
  return user?.role === "super_admin";
}

export function canManageRoles(user: AppUser | null | undefined): boolean {
  return isSuperAdmin(user) || userHasPermission(user, "roles");
}

/** Only super admin may grant admin / super_admin roles */
export function canAssignManagementRoles(user: AppUser | null | undefined): boolean {
  return isSuperAdmin(user);
}

export function getStaffHomeRoute(user: AppUser | null | undefined): string {
  if (userHasPermission(user, "*") || userHasPermission(user, "dashboard")) return "/admin";
  if (userHasPermission(user, "pos")) return "/pos";
  if (userHasPermission(user, "kitchen")) return "/kitchen";
  if (userHasPermission(user, "delivery")) return "/admin";
  if (userHasPermission(user, "*") || userHasPermission(user, "dashboard")) return "/admin";
  if (userHasPermission(user, "pos")) return "/pos";
  if (userHasPermission(user, "kitchen")) return "/kitchen";
  if (userHasPermission(user, "delivery")) return "/rider";
  if (userHasPermission(user, "orders") || userHasPermission(user, "online_orders")) {
    return "/admin/orders";
  }
  return "/admin";
}

export function canViewOrders(user: AppUser | null | undefined): boolean {
  return (
    userHasPermission(user, "*") ||
    userHasPermission(user, "orders") ||
    userHasPermission(user, "online_orders")
  );
}

export function ordersFilterForUser(
  user: AppUser | null | undefined
): "all" | "online" | "none" {
  if (!user) return "none";
  if (userHasPermission(user, "*") || userHasPermission(user, "orders")) return "all";
  if (userHasPermission(user, "online_orders")) return "online";
  return "none";
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  cashier: "Cashier",
  kitchen_staff: "Kitchen",
  delivery_rider: "Delivery",
  employee: "Employee",
  customer: "Customer",
};
