"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listStaffUsers, updateUserAccess } from "@/services/users.service";
import { useAuthStore } from "@/stores/auth-store";
import { canManageRoles, ROLE_LABELS } from "@/lib/permissions";
import { STAFF_PERMISSION_OPTIONS, STAFF_ROLES } from "@/constants";
import type { AppUser, UserRole } from "@/types";

export default function RolesPage() {
  const profile = useAuthStore((s) => s.profile);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = () =>
    listStaffUsers()
      .then(setUsers)
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  if (!canManageRoles(profile)) {
    return (
      <p className="text-muted-foreground">You do not have permission to manage roles.</p>
    );
  }

  async function saveUser(user: AppUser, role: UserRole, permissions: string[]) {
    setSaving(user.id);
    try {
      await updateUserAccess(user.id, { role, permissions });
      toast.success(`Updated ${user.displayName}`);
      load();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(null);
    }
  }

  function togglePerm(user: AppUser, permId: string, current: string[]) {
    const next = current.includes(permId)
      ? current.filter((p) => p !== permId)
      : [...current, permId];
    return next;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Roles & access</h1>
        <p className="text-sm text-muted-foreground">
          Assign what each staff member can open — POS, kitchen, online orders, etc.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading users...</p>
      ) : (
        users.map((user) => (
          <UserAccessCard
            key={user.id}
            user={user}
            saving={saving === user.id}
            onSave={saveUser}
            onToggle={togglePerm}
          />
        ))
      )}
      {!loading && users.length === 0 && (
        <p className="text-muted-foreground">No staff users in Firestore yet.</p>
      )}
    </div>
  );
}

function UserAccessCard({
  user,
  saving,
  onSave,
  onToggle,
}: {
  user: AppUser;
  saving: boolean;
  onSave: (u: AppUser, role: UserRole, perms: string[]) => void;
  onToggle: (u: AppUser, id: string, current: string[]) => string[];
}) {
  const [role, setRole] = useState(user.role);
  const [perms, setPerms] = useState<string[]>(user.permissions ?? []);

  const groups = [...new Set(STAFF_PERMISSION_OPTIONS.map((o) => o.group))];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{user.displayName}</CardTitle>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Badge variant={user.isActive ? "success" : "destructive"}>
            {user.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Role</label>
          <select
            className="mt-1 flex h-10 w-full max-w-xs rounded-xl border px-3 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Custom checkboxes below override the role defaults when saved.
          </p>
        </div>

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
                    checked={perms.includes(opt.id)}
                    onChange={() => setPerms(onToggle(user, opt.id, perms))}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        ))}

        <Button disabled={saving} onClick={() => onSave(user, role, perms)}>
          {saving ? "Saving..." : "Save access"}
        </Button>
      </CardContent>
    </Card>
  );
}
