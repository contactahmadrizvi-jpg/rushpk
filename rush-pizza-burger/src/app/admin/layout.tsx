"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminSidebar } from "@/components/admin/sidebar";
import { useAuthStore, isAdminRole } from "@/stores/auth-store";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { profile, loading, firebaseUser, refreshProfile } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      router.replace("/login?redirect=/admin");
      return;
    }

    setChecked(true);
  }, [firebaseUser, loading, router]);

  if (loading || !checked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (!firebaseUser) return null;

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-bold">Admin profile not found</h1>
        <p className="max-w-md text-muted-foreground">
          You are signed in as <strong>{firebaseUser.email}</strong>, but there is no
          document in Firestore <code>users/{firebaseUser.uid}</code> with an admin role.
        </p>
        <p className="text-sm text-muted-foreground">
          In Firebase Console → Firestore, create document ID = your Auth UID with fields:
          <br />
          <code>role: &quot;super_admin&quot;</code>, <code>displayName</code>, <code>email</code>,{" "}
          <code>isActive: true</code>, <code>createdAt</code>, <code>updatedAt</code>
        </p>
        <Button onClick={() => refreshProfile()}>Retry</Button>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Back to login
        </Link>
      </div>
    );
  }

  if (!isAdminRole(profile.role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-bold">Access denied</h1>
        <p className="text-muted-foreground">
          Your role is <strong>{profile.role}</strong>. Admin requires super_admin, manager,
          cashier, or other staff role.
        </p>
        <Link href="/home">
          <Button>Go to website</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6 lg:hidden">
          <span className="font-bold">Admin</span>
        </header>
        <div className="flex-1 overflow-auto p-4 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
