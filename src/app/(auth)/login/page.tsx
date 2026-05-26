"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loginUser, getUserProfile } from "@/services/auth.service";
import { useAuthStore, isAdminRole } from "@/stores/auth-store";
import { getStaffHomeRoute } from "@/lib/permissions";
import { PageLoader } from "@/components/ui/page-loader";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/admin";
  const { setSession, canAccessAdmin, loading, firebaseUser, profile, refreshProfile } =
    useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (firebaseUser && profile && isAdminRole(profile.role)) {
      const home = getStaffHomeRoute(profile);
      router.replace(redirect.startsWith("/admin") || redirect === "/pos" ? redirect : home);
    }
  }, [loading, firebaseUser, profile, router, redirect]);

  if (loading) {
    return <PageLoader message="Checking session..." />;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = await loginUser(email, password);
      const profile = await getUserProfile(user.uid);

      setSession(user, profile);

      if (!profile) {
        toast.error(
          "Logged in, but no Firestore user profile. Add users/{uid} with role super_admin in Firebase."
        );
        return;
      }

      if (!isAdminRole(profile.role)) {
        toast.error(`Role "${profile.role}" cannot access admin. Use a staff account.`);
        router.push("/home");
        return;
      }

      toast.success(`Welcome, ${profile.displayName}!`);
      router.replace(getStaffHomeRoute(profile));
    } catch {
      toast.error("Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Staff Sign In</CardTitle>
        <p className="text-sm text-muted-foreground">Rush Pizza and Burger — Admin & POS</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign In"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Customer?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Register
          </Link>
          {" · "}
          <Link href="/home" className="text-primary hover:underline">
            Website
          </Link>
        </p>
        {firebaseUser && !profile && (
          <Button variant="outline" className="mt-4 w-full" onClick={() => refreshProfile()}>
            Retry profile load
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Suspense fallback={<div className="h-64 w-full max-w-md animate-pulse rounded-xl bg-muted" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
