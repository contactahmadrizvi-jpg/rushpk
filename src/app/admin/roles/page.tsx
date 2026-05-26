"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Shield, UserCheck, ShieldAlert, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { listAllRegisteredUsers, updateUserAccess } from "@/services/users.service";
import { useAuthStore } from "@/stores/auth-store";
import {
  canManageRoles,
  canAssignManagementRoles,
  isSuperAdmin,
  ROLE_LABELS,
} from "@/lib/permissions";
import {
  ASSIGNABLE_ROLES,
  ROLE_PERMISSIONS,
  STAFF_PERMISSION_OPTIONS,
  STAFF_ROLES,
} from "@/constants";
import type { AppUser, UserRole } from "@/types";
import { TableRowsSkeleton } from "@/components/ui/loading-skeletons";

export default function RolesPage() {
  const profile = useAuthStore((s) => s.profile);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");

  const load = () =>
    listAllRegisteredUsers()
      .then((list) => {
        setUsers(list);
        if (!selectedId && list.length) setSelectedId(list[0]!.id);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.phone?.includes(q) ||
        ROLE_LABELS[u.role].toLowerCase().includes(q)
    );
  }, [users, search]);

  const selected = users.find((u) => u.id === selectedId) ?? null;

  if (!canManageRoles(profile)) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-2">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="font-semibold text-muted-foreground">You do not have permission to manage roles.</p>
      </div>
    );
  }

  const assignableRoles = ASSIGNABLE_ROLES.filter((r) => {
    if (r.value === "admin" && !canAssignManagementRoles(profile)) return false;
    return true;
  });

  async function saveAccess(
    user: AppUser,
    role: UserRole,
    permissions: string[],
    isActive: boolean
  ) {
    if (role === "super_admin" && !isSuperAdmin(profile)) {
      toast.error("Only super admin can assign super admin role");
      return;
    }
    if (role === "admin" && !canAssignManagementRoles(profile)) {
      toast.error("Only super admin can assign admin role");
      return;
    }
    if (user.id === profile?.id && role !== "super_admin" && profile?.role === "super_admin") {
      toast.error("You cannot remove your own super admin access");
      return;
    }

    setSaving(true);
    try {
      await updateUserAccess(user.id, { role, permissions, isActive });
      toast.success(`${user.displayName} access updated`);
      await load();
      setSelectedId(user.id);
    } catch {
      toast.error("Save failed — check Firestore rules");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <Shield className="h-8 w-8 text-primary" />
          Roles & Access Control
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Manage system roles, configure combined duties, and define feature access levels for registered users.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Pane: User list (simple, easy selection) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">User Directory</CardTitle>
              <CardDescription>Select a user to review or update their access permissions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email or role..."
                  className="pl-9 rounded-xl"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {loading ? (
                <TableRowsSkeleton rows={4} />
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No users found</p>
              ) : (
                <div className="max-h-[500px] overflow-y-auto divide-y border rounded-xl bg-card">
                  {filtered.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedId(u.id)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-all hover:bg-muted/50 ${
                        u.id === selectedId ? "bg-primary/5 font-semibold text-primary border-l-4 border-primary" : "border-l-4 border-transparent"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.displayName}</p>
                        <p className="truncate text-xs text-muted-foreground mt-0.5">{u.email}</p>
                      </div>
                      <Badge variant={u.role === "customer" ? "secondary" : "default"} className="capitalize">
                        {ROLE_LABELS[u.role] || u.role}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Pane: User Access Editor */}
        <div className="lg:col-span-7">
          {loading && !selected ? (
            <Card className="shadow-md">
              <CardContent className="py-12">
                <TableRowsSkeleton rows={4} />
              </CardContent>
            </Card>
          ) : selected ? (
            <UserAccessEditor
              user={selected}
              assignableRoles={assignableRoles}
              saving={saving}
              isSelf={selected.id === profile?.id}
              canAssignAdmin={canAssignManagementRoles(profile)}
              onSave={saveAccess}
            />
          ) : (
            <Card className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground shadow-md border-dashed">
              <UserCheck className="h-10 w-10 text-muted-foreground/60 mb-2" />
              <p>Please select a user from the directory to configure their roles & access.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function UserAccessEditor({
  user,
  assignableRoles,
  saving,
  isSelf,
  canAssignAdmin,
  onSave,
}: {
  user: AppUser;
  assignableRoles: typeof ASSIGNABLE_ROLES;
  saving: boolean;
  isSelf: boolean;
  canAssignAdmin: boolean;
  onSave: (
    u: AppUser,
    role: UserRole,
    perms: string[],
    active: boolean
  ) => void;
}) {
  // Support multiple roles checkboxes
  // Determine which roles are currently applicable based on user.permissions
  // We initialize with the user's main role.
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);

  useEffect(() => {
    // Determine active roles based on existing permissions and the primary role
    const active: UserRole[] = [user.role];
    
    // Check if the user has custom permissions matching other roles
    const userPerms = user.permissions || [];
    if (userPerms.length > 0) {
      STAFF_ROLES.forEach((r) => {
        if (r === user.role) return;
        const defaults = ROLE_PERMISSIONS[r] || [];
        // If defaults is subset of userPerms, consider that role active
        if (defaults.length > 0 && defaults.every(p => userPerms.includes(p))) {
          if (!active.includes(r)) active.push(r);
        }
      });
    }

    setSelectedRoles(active.filter(r => r !== "super_admin"));
    setPerms(user.permissions?.length ? user.permissions : [...(ROLE_PERMISSIONS[user.role] ?? [])]);
    setIsActive(user.isActive);
    setUseCustomPerms(!!(user.permissions && user.permissions.length > 0));
  }, [user.id, user.role, user.permissions, user.isActive]);

  const [perms, setPerms] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(user.isActive);
  const [useCustomPerms, setUseCustomPerms] = useState(false);

  // Triggered when a checkbox for a role is toggled
  function toggleRole(roleVal: UserRole) {
    let nextRoles = [...selectedRoles];
    if (nextRoles.includes(roleVal)) {
      nextRoles = nextRoles.filter((r) => r !== roleVal);
    } else {
      nextRoles.push(roleVal);
    }

    if (nextRoles.length === 0) {
      nextRoles = ["employee"]; // Fallback default
    }

    setSelectedRoles(nextRoles);

    // Merge permissions of all selected roles
    const mergedPerms = new Set<string>();
    nextRoles.forEach((r) => {
      const defaults = ROLE_PERMISSIONS[r] || [];
      defaults.forEach((p) => mergedPerms.add(p));
    });

    setPerms(Array.from(mergedPerms));
  }

  function applyRoleDefaults() {
    const mergedPerms = new Set<string>();
    selectedRoles.forEach((r) => {
      const defaults = ROLE_PERMISSIONS[r] || [];
      defaults.forEach((p) => mergedPerms.add(p));
    });
    setPerms(Array.from(mergedPerms));
    setUseCustomPerms(false);
  }

  const groups = [...new Set(STAFF_PERMISSION_OPTIONS.map((o) => o.group))];
  const isCustomerOnly = selectedRoles.length === 1 && selectedRoles[0] === "customer";
  const showSuperAdmin = user.role === "super_admin";

  return (
    <Card className="border-primary/20 shadow-lg">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{user.displayName}</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
            {user.phone && <p className="text-xs text-muted-foreground mt-1">Phone: {user.phone}</p>}
          </div>
          {showSuperAdmin && <Badge className="bg-amber-600 hover:bg-amber-600 text-white">Super Admin (Protected)</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {showSuperAdmin && (
          <p className="rounded-xl bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
            This account is a protected Super Admin with absolute root privileges.
          </p>
        )}

        <div className="flex items-center gap-3 bg-muted/40 p-4 rounded-xl border">
          <input
            id="ac-active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={isSelf}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <Label htmlFor="ac-active" className="cursor-pointer font-semibold text-sm">
            Account Active (Permit sign-in to system)
          </Label>
        </div>

        {!showSuperAdmin && (
          <div className="space-y-3">
            <Label className="text-base font-bold text-foreground">Select Active Roles (Assign Multiple)</Label>
            <p className="text-xs text-muted-foreground">
              Select all duties this user operates. Checking multiple roles will automatically combine their default access scopes.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {assignableRoles.map((opt) => (
                <label
                  key={opt.value}
                  className={`relative flex cursor-pointer items-start rounded-xl border p-3 hover:bg-muted/30 transition-all ${
                    selectedRoles.includes(opt.value) ? "border-primary bg-primary/5" : "border-muted"
                  }`}
                >
                  <div className="flex h-5 items-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      checked={selectedRoles.includes(opt.value)}
                      onChange={() => toggleRole(opt.value)}
                    />
                  </div>
                  <div className="ml-3 text-xs leading-4">
                    <p className="font-semibold text-sm text-foreground">{opt.label}</p>
                    <p className="text-muted-foreground mt-0.5">{opt.hint}</p>
                    <Badge variant="outline" className="mt-1.5 text-[9px] uppercase tracking-wider scale-90 origin-left">
                      {opt.group}
                    </Badge>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {!isCustomerOnly && !showSuperAdmin && (
          <div className="space-y-4 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-base font-bold text-foreground">Custom Operations Sandbox</Label>
              <Button type="button" variant="outline" size="sm" onClick={applyRoleDefaults} className="rounded-xl">
                Reset to Combined Defaults
              </Button>
            </div>

            <div className="flex items-center gap-3 bg-muted/40 p-4 rounded-xl border">
              <input
                id="custom-perms-check"
                type="checkbox"
                checked={useCustomPerms}
                onChange={(e) => {
                  setUseCustomPerms(e.target.checked);
                  if (!e.target.checked) applyRoleDefaults();
                }}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="custom-perms-check" className="cursor-pointer font-semibold text-sm">
                Override Combined Defaults (Enable custom sandbox permissions)
              </Label>
            </div>

            {groups.map((group) => (
              <div key={group} className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{group} Modules</p>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                  {STAFF_PERMISSION_OPTIONS.filter((o) => o.group === group).map((opt) => {
                    const isChecked = perms.includes(opt.id) || perms.includes("*");
                    return (
                      <label
                        key={opt.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium hover:bg-muted/40 transition-all ${
                          isChecked ? "border-primary bg-primary/5 text-primary" : "border-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={!useCustomPerms}
                          checked={isChecked}
                          onChange={() => {
                            setPerms((p) =>
                              p.includes(opt.id)
                                ? p.filter((x) => x !== opt.id && x !== "*")
                                : [...p.filter((x) => x !== "*"), opt.id]
                            );
                          }}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="truncate">{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {isCustomerOnly && (
          <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-xl">
            Customer roles can only access public web modules (menu shopping, cart checkouts, tracking orders).
          </p>
        )}

        <Button
          disabled={saving || (isSelf && !showSuperAdmin)}
          className="w-full h-11 text-base rounded-xl font-semibold mt-4"
          onClick={() => {
            const finalRole = showSuperAdmin ? "super_admin" : selectedRoles[0] || "employee";
            const finalPerms = isCustomerOnly
              ? ["website"]
              : useCustomPerms
                ? perms.filter((p) => p !== "*")
                : perms; // Use combined perms

            onSave(user, finalRole, finalPerms, isActive);
          }}
        >
          {saving ? "Saving Updates..." : "Save Role & Access Configuration"}
        </Button>
      </CardContent>
    </Card>
  );
}
