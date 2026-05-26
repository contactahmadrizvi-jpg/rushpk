"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MapPin, QrCode, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";
import { checkInGPS, checkOut, attendanceRepo } from "@/services/attendance.service";
import { QRCodeSVG } from "qrcode.react";
import type { AttendanceRecord } from "@/types";
import { isSuperAdmin, userHasPermission } from "@/lib/permissions";
import { where } from "@/services/base.repository";

export default function AttendancePage() {
  const profile = useAuthStore((s) => s.profile);
  const [loading, setLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const qrToken = process.env.NEXT_PUBLIC_ATTENDANCE_QR_TOKEN ?? "rush-pizza-sheikhupura-2024";
  const today = new Date().toISOString().split("T")[0]!;

  const canMonitor =
    isSuperAdmin(profile) ||
    userHasPermission(profile, "dashboard") ||
    userHasPermission(profile, "employees") ||
    profile?.role === "manager" ||
    profile?.role === "admin";

  const loadLogs = async () => {
    if (!canMonitor) return;
    setLoadingLogs(true);
    try {
      const records = await attendanceRepo.getAll([
        where("date", "==", today),
      ]);
      setLogs(records);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [profile, canMonitor]);

  async function handleCheckInGPS() {
    if (!profile) return;
    setLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true })
      );
      await checkInGPS(profile.id, profile.displayName, pos.coords.latitude, pos.coords.longitude, "11:00");
      toast.success("Checked in successfully via GPS!");
      loadLogs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-in failed. Enable location services.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckOut() {
    if (!profile) return;
    setCheckingOut(true);
    try {
      await checkOut(profile.id);
      toast.success("Checked out successfully!");
      loadLogs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-out failed");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Attendance Check</h1>
          <p className="text-muted-foreground text-sm">
            Verify presence within the official restaurant boundary using GPS check-in.
          </p>
        </div>
        {profile && (
          <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3 pr-4 border w-fit">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
              {profile.displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">{profile.displayName}</p>
              <p className="text-xs text-muted-foreground mt-1 capitalize">{profile.role}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Left Side: Check In Form */}
        <Card className="md:col-span-7 overflow-hidden border-primary/20 shadow-lg">
          <CardHeader className="bg-muted/30 pb-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Check In / Out
            </CardTitle>
            <CardDescription>Verify your location and check in or check out.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center text-primary border border-primary/30">
                <MapPin className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">GPS Proximity Check</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Verify that you are physically present at the restaurant before registering check-in.
                </p>
              </div>
              <Button className="w-full max-w-md h-12 text-base rounded-xl" onClick={handleCheckInGPS} disabled={loading}>
                {loading ? "Checking location..." : "Verify & Check In (GPS)"}
              </Button>
            </div>

            <div className="border-t pt-4">
              <Button
                variant="outline"
                className="w-full h-11 text-destructive hover:bg-destructive/10 border-destructive/20 rounded-xl"
                onClick={handleCheckOut}
                disabled={checkingOut}
              >
                {checkingOut ? "Checking Out..." : "Check Out"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right Side: QR Code Display for Restaurant */}
        <Card className="md:col-span-5 border-muted/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              QR Terminal
            </CardTitle>
            <CardDescription>Scan via employee app to check in at the counter.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center p-6 bg-muted/10">
            <div className="rounded-2xl bg-white p-4 shadow-sm border">
              <QRCodeSVG value={qrToken} size={160} />
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center max-w-xs">
              This terminal code verifies you are physically present at the counter display.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Admin Monitoring View */}
      {canMonitor && (
        <Card className="border-muted/60 shadow">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xl">Daily Attendance Logs</CardTitle>
              <CardDescription>Manager monitoring console. Real-time workspace attendance.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadLogs}>
              Refresh Logs
            </Button>
          </CardHeader>
          <CardContent>
            {loadingLogs ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading logs...</p>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground space-y-2 border border-dashed rounded-xl">
                <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground/60" />
                <p className="text-sm font-medium">No check-ins registered today</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/70 text-xs uppercase text-muted-foreground font-bold">
                    <tr>
                      <th className="p-3">Employee</th>
                      <th className="p-3">Method</th>
                      <th className="p-3">Check In</th>
                      <th className="p-3">Check Out</th>
                      <th className="p-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/30">
                        <td className="p-3 font-semibold">{log.employeeName}</td>
                        <td className="p-3">
                          <Badge variant="secondary">
                            {log.checkInMethod}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {log.checkIn ? new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                          {log.isLate && <Badge variant="destructive" className="ml-2 scale-90">Late</Badge>}
                        </td>
                        <td className="p-3">
                          {log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                        </td>
                        <td className="p-3">
                          {log.checkInMethod === "gps" && log.checkInLat ? (
                            <span className="text-xs text-muted-foreground">
                              Lat: {log.checkInLat.toFixed(4)}, Lng: {log.checkInLng?.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No coordinates (QR scan)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
