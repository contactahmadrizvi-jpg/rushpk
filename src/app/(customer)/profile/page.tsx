"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { PageLoader } from "@/components/ui/page-loader";

export default function ProfilePage() {
  const { profile, loading, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !profile) router.replace("/login");
  }, [profile, loading, router]);

  if (loading) {
    return <PageLoader message="Loading profile..." />;
  }

  if (!profile) return null;

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold">Profile</h1>
      <div className="mt-6 rounded-2xl border p-6">
        <p className="font-bold">{profile.displayName}</p>
        <p className="text-muted-foreground">{profile.email}</p>
        {profile.phone && <p>{profile.phone}</p>}
      </div>
      <Button variant="outline" className="mt-4" onClick={() => logout().then(() => router.push("/home"))}>Sign Out</Button>
    </div>
  );
}
