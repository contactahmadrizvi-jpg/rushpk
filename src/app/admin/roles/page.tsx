"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/constants";
import type { AppUser, UserRole } from "@/types";

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
      <p className="text-muted-foreground">You do not have permission to manage roles.</p>
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
      toast.success(`${user.displayName} updated`);
      await load();
      setSelectedId(user.id);
    } catch {
      toast.error("Save failed — check Firestore rules");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Shield className="h-7 w-7 text-primary" />
          User roles & access
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select any registered Firebase user, assign Admin or Staff role, and choose which
          operations they can use.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select user</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="user-search">Search by name, email or role</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="user-search"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="user-pick">Registered user ({filtered.length})</Label>
            <select
              id="user-pick"
              className="mt-1 flex h-11 w-full rounded-xl border bg-background px-3 text-sm"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={loading}
            >
              {loading ? (
                <option>Loading...</option>
              ) : filtered.length === 0 ? (
                <option value="">No users found</option>
              ) : (
                filtered.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} — {u.email} ({ROLE_LABELS[u.role]})
                  </option>
                ))
              )}
            </select>
          </div>
        </CardContent>
      </Card>

      {selected && (
        <UserAccessEditor
          user={selected}
          assignableRoles={assignableRoles}
          saving={saving}
          isSelf={selected.id === profile?.id}
          canAssignAdmin={canAssignManagementRoles(profile)}
          onSave={saveAccess}
        />
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All registered users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-64 overflow-y-auto divide-y">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setSelectedId(u.id)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50 ${
                  u.id === selectedId ? "bg-primary/5" : ""
                }`}
              >
                <div>
                  <p className="font-semibold">{u.displayName}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <Badge variant={u.role === "customer" ? "secondary" : "default"}>
                  {ROLE_LABELS[u.role]}
                </Badge>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
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
  const [role, setRole] = useState<UserRole>(user.role === "super_admin" ? "admin" : user.role);
  const [perms, setPerms] = useState<string[]>(
    user.permissions?.length ? user.permissions : [...(ROLE_PERMISSIONS[user.role] ?? [])]
  );
  const [isActive, setIsActive] = useState(user.isActive);
  const [useCustomPerms, setUseCustomPerms] = useState(
    !!(user.permissions && user.permissions.length > 0)
  );

  useEffect(() => {
    const r = user.role === "super_admin" ? "admin" : user.role;
    setRole(r);
    setPerms(
      user.permissions?.length ? user.permissions : [...(ROLE_PERMISSIONS[user.role] ?? [])]
    );
    setIsActive(user.isActive);
    setUseCustomPerms(!!(user.permissions && user.permissions.length > 0));
  }, [user.id, user.role, user.permissions, user.isActive]);

  function onRoleChange(newRole: UserRole) {
    setRole(newRole);
    if (!useCustomPerms) {
      setPerms([...(ROLE_PERMISSIONS[newRole] ?? [])]);
    }
    if (newRole === "customer") {
      setPerms(["website"]);
      setUseCustomPerms(true);
    }
  }

  function applyRoleDefaults() {
    setPerms([...(ROLE_PERMISSIONS[role] ?? [])]);
    setUseCustomPerms(false);
  }

  const groups = [...new Set(STAFF_PERMISSION_OPTIONS.map((o) => o.group))];
  const isCustomer = role === "customer";
  const showSuperAdmin = user.role === "super_admin";

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{user.displayName}</CardTitle>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            {user.phone && (
              <p className="text-xs text-muted-foreground">{user.phone}</p>
            )}
          </div>
          {showSuperAdmin && (
            <Badge>Super Admin (protected)</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {showSuperAdmin && (
          <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            This account is Super Admin with full system access.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={isSelf}
          />
          Account active (can sign in)
        </label>

        {!showSuperAdmin && (
          <div>
            <Label>Account type</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {assignableRoles.map((opt) => (
                <label
                  key={opt.value}
                  className={`cursor-pointer rounded-xl border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5 ${
                    role === opt.value ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    className="sr-only"
                    checked={role === opt.value}
                    onChange={() => onRoleChange(opt.value)}
                  />
                  <p className="font-semibold">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.hint}</p>
                  <p className="mt-1 text-[10px] uppercase text-muted-foreground">{opt.group}</p>
                </label>
              ))}
            </div>
            {!canAssignAdmin && (
              <p className="mt-2 text-xs text-muted-foreground">
                Only super admin can assign Admin role.
              </p>
            )}
          </div>
        )}

        {!isCustomer && !showSuperAdmin && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Operations this user can access</Label>
              <Button type="button" variant="outline" size="sm" onClick={applyRoleDefaults}>
                Reset to role defaults
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useCustomPerms}
                onChange={(e) => {
                  setUseCustomPerms(e.target.checked);
                  if (!e.target.checked) applyRoleDefaults();
                }}
              />
              Custom permissions (override role defaults)
            </label>

            {groups.map((group) => (
              <div key={group}>
                <p className="text-xs font-bold uppercase text-muted-foreground">{group}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STAFF_PERMISSION_OPTIONS.filter((o) => o.group === group).map((opt) => (
                    <label
                      key={opt.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <input
                        type="checkbox"
                        disabled={!useCustomPerms && role === "admin"}
                        checked={
                          role === "admin" && !useCustomPerms
                            ? true
                            : perms.includes(opt.id) || perms.includes("*")
                        }
                        onChange={() => {
                          setUseCustomPerms(true);
                          setPerms((p) =>
                            p.includes(opt.id)
                              ? p.filter((x) => x !== opt.id && x !== "*")
                              : [...p.filter((x) => x !== "*"), opt.id]
                          );
                        }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {role === "admin" && !useCustomPerms && (
              <p className="text-xs text-muted-foreground">
                Admin has full access by default. Enable custom permissions to limit access.
              </p>
            )}
          </div>
        )}

        {isCustomer && (
          <p className="text-sm text-muted-foreground">
            Customer accounts can only use the website (menu, cart, track order).
          </p>
        )}

        <Button
          disabled={saving || (isSelf && !showSuperAdmin)}
          onClick={() => {
            const finalRole = showSuperAdmin ? "super_admin" : role;
            const finalPerms = isCustomer
              ? ["website"]
              : useCustomPerms
                ? perms.filter((p) => p !== "*")
                : [];
            onSave(user, finalRole, finalPerms, isActive);
          }}
        >
          {saving ? "Saving..." : "Save role & access"}
        </Button>
      </CardContent>
    </Card>
  );
}
