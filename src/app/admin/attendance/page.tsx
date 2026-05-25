"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth-store";
import { checkInGPS, checkOut } from "@/services/attendance.service";
import { QRCodeSVG } from "qrcode.react";

export default function AttendancePage() {
  const profile = useAuthStore((s) => s.profile);
  const [loading, setLoading] = useState(false);
  const qrToken = process.env.NEXT_PUBLIC_ATTENDANCE_QR_TOKEN ?? "rush-pizza-sheikhupura-2024";

  async function handleCheckIn() {
    if (!profile) return;
    setLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true })
      );
      await checkInGPS(profile.id, profile.displayName, pos.coords.latitude, pos.coords.longitude, "11:00");
      toast.success("Checked in via GPS");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-in failed. Enable location.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckOut() {
    if (!profile) return;
    try {
      await checkOut(profile.id);
      toast.success("Checked out");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-out failed");
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold">Attendance</h1>
      <p className="text-muted-foreground">GPS verification within restaurant radius</p>
      <Card className="mt-6">
        <CardHeader><CardTitle>Check In / Out</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" size="lg" onClick={handleCheckIn} disabled={loading}>
            {loading ? "Verifying location..." : "Check In (GPS)"}
          </Button>
          <Button className="w-full" variant="outline" size="lg" onClick={handleCheckOut}>Check Out</Button>
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader><CardTitle>QR Check-In (display at restaurant)</CardTitle></CardHeader>
        <CardContent className="flex justify-center">
          <QRCodeSVG value={qrToken} size={180} />
        </CardContent>
      </Card>
    </div>
  );
}
