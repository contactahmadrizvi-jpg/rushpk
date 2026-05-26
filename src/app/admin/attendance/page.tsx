"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, MapPin, QrCode, Scan, ShieldAlert, User, Eye, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";
import { checkInGPS, checkInSelfie, checkOut, attendanceRepo } from "@/services/attendance.service";
import { uploadToImgBB } from "@/lib/upload-image";
import { QRCodeSVG } from "qrcode.react";
import type { AttendanceRecord } from "@/types";
import { isSuperAdmin, userHasPermission } from "@/lib/permissions";
import { where, orderBy } from "@/services/base.repository";

export default function AttendancePage() {
  const profile = useAuthStore((s) => s.profile);
  const [loading, setLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<"gps" | "selfie">("selfie");
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedSelfie, setSelectedSelfie] = useState<string | null>(null);

  // Camera state
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  async function startCamera() {
    setCapturedPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (e) {
      toast.error("Could not access camera. Please grant camera permission.");
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  }

  function capturePhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Flip horizontally for natural mirror preview
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      setCapturedPhoto(dataUrl);
      stopCamera();
    }
  }

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

  async function handleCheckInSelfie() {
    if (!profile || !capturedPhoto) return;
    setLoading(true);
    try {
      // Convert base64 dataUrl to File object
      const blob = await (await fetch(capturedPhoto)).blob();
      const file = new File([blob], `selfie-${profile.id}.jpg`, { type: "image/jpeg" });

      toast.loading("Uploading verification photo...", { id: "upload" });
      const imageUrl = await uploadToImgBB(file);
      toast.success("Selfie verified!", { id: "upload" });

      await checkInSelfie(profile.id, profile.displayName, imageUrl, "11:00");
      toast.success("Checked in successfully!");
      setCapturedPhoto(null);
      loadLogs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Selfie check-in failed", { id: "upload" });
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
            Secure attendance reporting via selfie capture or GPS validation.
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
            <CardDescription>Verify your identity and presence at the restaurant.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="flex p-1 bg-muted rounded-xl gap-1">
              <Button
                variant={activeTab === "selfie" ? "default" : "ghost"}
                className="flex-1 rounded-lg"
                onClick={() => {
                  setActiveTab("selfie");
                  stopCamera();
                }}
              >
                <Camera className="mr-2 h-4 w-4" /> Selfie Verification
              </Button>
              <Button
                variant={activeTab === "gps" ? "default" : "ghost"}
                className="flex-1 rounded-lg"
                onClick={() => {
                  setActiveTab("gps");
                  stopCamera();
                  setCapturedPhoto(null);
                }}
              >
                <MapPin className="mr-2 h-4 w-4" /> GPS Location
              </Button>
            </div>

            {activeTab === "gps" && (
              <div className="space-y-4 py-4 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center text-primary border border-primary/30">
                  <MapPin className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">GPS Proximity check</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Verify that you are within the official restaurant boundary before registering check-in.
                  </p>
                </div>
                <Button className="w-full max-w-md h-12 text-base rounded-xl" onClick={handleCheckInGPS} disabled={loading}>
                  {loading ? "Checking location..." : "Verify & Check In (GPS)"}
                </Button>
              </div>
            )}

            {activeTab === "selfie" && (
              <div className="space-y-4">
                {!cameraStream && !capturedPhoto ? (
                  <div className="border-2 border-dashed border-muted-foreground/30 rounded-2xl p-8 text-center bg-muted/10 space-y-4">
                    <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <Camera className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Selfie Camera Verification</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Use your front camera to snap a live photo of yourself at the workspace.
                      </p>
                    </div>
                    <Button onClick={startCamera} className="rounded-xl">
                      Start Camera
                    </Button>
                  </div>
                ) : cameraStream ? (
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-w-md mx-auto border-2 border-primary/40 shadow-inner">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                      <Button onClick={capturePhoto} className="rounded-full px-6 shadow-lg" size="sm">
                        Snap Photo
                      </Button>
                      <Button onClick={stopCamera} variant="secondary" className="rounded-full shadow-lg" size="sm">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : capturedPhoto ? (
                  <div className="space-y-4 text-center">
                    <div className="relative rounded-2xl overflow-hidden bg-muted aspect-video max-w-md mx-auto border-2 border-green-500 shadow-md">
                      <img src={capturedPhoto} alt="Captured check-in photo" className="w-full h-full object-cover" />
                      <div className="absolute top-3 right-3">
                        <Badge className="bg-green-600 hover:bg-green-600 text-white border-none py-1">
                          Ready to Verify
                        </Badge>
                      </div>
                    </div>
                    <div className="flex justify-center gap-3">
                      <Button onClick={handleCheckInSelfie} className="w-full max-w-xs h-11 text-base rounded-xl" disabled={loading}>
                        {loading ? "Checking In..." : "Confirm & Check In"}
                      </Button>
                      <Button onClick={startCamera} variant="outline" className="h-11 rounded-xl" disabled={loading}>
                        Retake
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

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
              This dynamic code verifies your terminal session. Please scan at the terminal display.
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
                      <th className="p-3">Details / Photo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/30">
                        <td className="p-3 font-semibold">{log.employeeName}</td>
                        <td className="p-3">
                          <Badge variant={log.checkInMethod === "selfie" ? "default" : "secondary"}>
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
                          {log.checkInMethod === "selfie" && log.selfieUrl ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-1 bg-green-50/50 text-green-700 border-green-200 hover:bg-green-100/50 hover:text-green-800"
                              onClick={() => setSelectedSelfie(log.selfieUrl || null)}
                            >
                              <Eye className="h-3.5 w-3.5" /> View Selfie
                            </Button>
                          ) : log.checkInMethod === "gps" && log.checkInLat ? (
                            <span className="text-xs text-muted-foreground">
                              Lat: {log.checkInLat.toFixed(4)}, Lng: {log.checkInLng?.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No verification details</span>
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

      {/* Selfie Preview Modal */}
      {selectedSelfie && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedSelfie(null)}
        >
          <div
            className="bg-background max-w-lg w-full rounded-2xl overflow-hidden border shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-4 right-4 z-10">
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full h-8 w-8 p-0"
                onClick={() => setSelectedSelfie(null)}
              >
                ✕
              </Button>
            </div>
            <div className="aspect-[4/3] relative bg-muted">
              <img src={selectedSelfie} alt="Verified Selfie" className="w-full h-full object-cover" />
            </div>
            <div className="p-4 bg-muted/20 border-t">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Live selfie verification screenshot
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
