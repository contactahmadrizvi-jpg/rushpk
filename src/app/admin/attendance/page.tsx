"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth-store";
import { attendanceRepo, checkInGPS, checkOut } from "@/services/attendance.service";
import { listStaffUsers } from "@/services/users.service";
import { where } from "@/services/base.repository";
import type { AttendanceRecord, AppUser } from "@/types";
import { doc, updateDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/config";
import { COLLECTIONS } from "@/constants";
import { isSuperAdmin, userHasPermission } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/";
const FACE_API_CDN =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js";
const MATCH_THRESHOLD = 0.5; // lower = stricter
const DETECT_INTERVAL_MS = 500;
const RESTAURANT_LAT = 31.7131;
const RESTAURANT_LNG = 73.9724;

// ---------------------------------------------------------------------------
// Audio chime helper
// ---------------------------------------------------------------------------
function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Loading state type
// ---------------------------------------------------------------------------
type Status =
  | "idle"
  | "loading_script"
  | "loading_models"
  | "loading_profiles"
  | "ready"
  | "error";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AttendancePage() {
  const { profile, refreshProfile } = useAuthStore();

  // ---------- kiosk state ----------
  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [faceLabel, setFaceLabel] = useState<string | null>(null); // null = no face
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollCapturing, setEnrollCapturing] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  // ---------- attendance logs ----------
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const today = new Date().toISOString().split("T")[0]!;

  // ---------- refs ----------
  const kioskVideoRef = useRef<HTMLVideoElement>(null);
  const enrollVideoRef = useRef<HTMLVideoElement>(null);
  const kioskStreamRef = useRef<MediaStream | null>(null);
  const enrollStreamRef = useRef<MediaStream | null>(null);
  const faceMatcherRef = useRef<any>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkedTodayRef = useRef<Set<string>>(new Set());
  const processingRef = useRef(false);

  // ---------- derived ----------
  const canMonitor =
    isSuperAdmin(profile) ||
    userHasPermission(profile, "dashboard") ||
    userHasPermission(profile, "employees") ||
    profile?.role === "manager" ||
    profile?.role === "admin";

  // =========================================================================
  // Load logs
  // =========================================================================
  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const records = await attendanceRepo.getAll([where("date", "==", today)]);
      setLogs(records);
      checkedTodayRef.current = new Set(records.map((r) => r.employeeId));
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =========================================================================
  // Bootstrap face-api (script → models → staff descriptors)
  // =========================================================================
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      // 1. Load script
      if (!(window as any).faceapi) {
        setStatus("loading_script");
        setStatusMsg("Downloading face-api.js…");
        await new Promise<void>((res, rej) => {
          const s = document.createElement("script");
          s.src = FACE_API_CDN;
          s.async = true;
          s.onload = () => res();
          s.onerror = () => rej(new Error("Script load failed"));
          document.head.appendChild(s);
        });
      }
      if (cancelled) return;

      // 2. Load neural network weights
      const fa = (window as any).faceapi;
      if (!fa.nets.tinyFaceDetector.isLoaded) {
        setStatus("loading_models");
        setStatusMsg("Loading neural network weights…");
        await Promise.all([
          fa.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
      }
      if (cancelled) return;

      // 3. Build face matcher from staff profiles
      setStatus("loading_profiles");
      setStatusMsg("Building employee face index…");
      const staff = await listStaffUsers();
      const labeled: any[] = [];

      for (const emp of staff.filter((s) => s.photoURL)) {
        try {
          const img = await loadImage(emp.photoURL!);
          const det = await fa
            .detectSingleFace(img, new fa.TinyFaceDetectorOptions({ inputSize: 224 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (det) {
            labeled.push(new fa.LabeledFaceDescriptors(emp.id, [det.descriptor]));
          }
        } catch (_) {
          // skip employee if image fails
        }
      }

      if (labeled.length > 0) {
        faceMatcherRef.current = new fa.FaceMatcher(labeled, MATCH_THRESHOLD);
      }

      if (!cancelled) {
        setStatus("ready");
        setStatusMsg(
          labeled.length === 0
            ? "No enrolled faces found. Use 'Enroll Face Profile' first."
            : `Ready — ${labeled.length} employee face(s) indexed.`
        );
      }
    };

    bootstrap().catch((err) => {
      if (!cancelled) {
        setStatus("error");
        setStatusMsg(String(err?.message ?? err));
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =========================================================================
  // Bind stream to kiosk video element whenever cameraOn changes
  // =========================================================================
  useEffect(() => {
    if (cameraOn && kioskStreamRef.current && kioskVideoRef.current) {
      kioskVideoRef.current.srcObject = kioskStreamRef.current;
    }
  }, [cameraOn]);

  // =========================================================================
  // Face detection ticker (runs while kiosk camera is on)
  // =========================================================================
  useEffect(() => {
    if (!cameraOn || status !== "ready") return;

    const fa = (window as any).faceapi;

    const tick = async () => {
      const video = kioskVideoRef.current;
      if (!video || video.readyState < 2 || processingRef.current) return;

      try {
        processingRef.current = true;
        const det = await fa
          .detectSingleFace(
            video,
            new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
          )
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!det) {
          setFaceLabel(null);
          return;
        }

        if (!faceMatcherRef.current) {
          setFaceLabel("no_index");
          return;
        }

        const best = faceMatcherRef.current.findBestMatch(det.descriptor);

        if (best.label === "unknown") {
          setFaceLabel("unknown");
          return;
        }

        const staffList = await listStaffUsers();
        const matched = staffList.find((s) => s.id === best.label);
        if (!matched) return;

        setFaceLabel(matched.displayName);

        // Auto clock-in (once per day)
        if (
          !checkedTodayRef.current.has(matched.id) &&
          !processingRef.current
        ) {
          processingRef.current = true;
          playChime();
          toast.info(`Recognized: ${matched.displayName} — clocking in…`);
          try {
            await checkInGPS(
              matched.id,
              matched.displayName,
              RESTAURANT_LAT,
              RESTAURANT_LNG,
              "11:00"
            );
            toast.success(`✅ ${matched.displayName} checked in!`);
            await loadLogs();
          } catch (e) {
            toast.error(
              e instanceof Error ? e.message : "Check-in error"
            );
          }
        }
      } finally {
        processingRef.current = false;
      }
    };

    tickerRef.current = setInterval(tick, DETECT_INTERVAL_MS);
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, status]);

  // =========================================================================
  // Camera controls
  // =========================================================================
  const startKiosk = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      kioskStreamRef.current = stream;
      setCameraOn(true);
      // binding happens in useEffect above
    } catch (err) {
      toast.error("Camera permission denied or unavailable.");
    }
  };

  const stopKiosk = () => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    kioskStreamRef.current?.getTracks().forEach((t) => t.stop());
    kioskStreamRef.current = null;
    if (kioskVideoRef.current) kioskVideoRef.current.srcObject = null;
    setCameraOn(false);
    setFaceLabel(null);
  };

  // =========================================================================
  // Enroll camera controls
  // =========================================================================
  const openEnroll = async () => {
    setEnrollOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      enrollStreamRef.current = stream;
      // Wait one tick for the video element to render
      await new Promise((r) => setTimeout(r, 80));
      if (enrollVideoRef.current) {
        enrollVideoRef.current.srcObject = stream;
      }
    } catch {
      toast.error("Cannot access camera for enrollment.");
    }
  };

  const closeEnroll = () => {
    enrollStreamRef.current?.getTracks().forEach((t) => t.stop());
    enrollStreamRef.current = null;
    if (enrollVideoRef.current) enrollVideoRef.current.srcObject = null;
    setEnrollOpen(false);
  };

  const captureAndEnroll = async () => {
    if (!profile || !enrollVideoRef.current) return;
    const fa = (window as any).faceapi;
    if (!fa) return;

    setEnrollCapturing(true);
    try {
      const video = enrollVideoRef.current;
      if (video.readyState < 2) {
        toast.error("Camera not ready yet. Please wait a moment.");
        return;
      }

      const det = await fa
        .detectSingleFace(video, new fa.TinyFaceDetectorOptions({ inputSize: 224 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!det) {
        toast.error("No face detected. Please look directly at the camera.");
        return;
      }

      // Snapshot
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

      // Save to Firestore
      await updateDoc(doc(getFirestoreDb(), COLLECTIONS.users, profile.id), {
        photoURL: dataUrl,
        updatedAt: new Date().toISOString(),
      });

      await refreshProfile();
      toast.success("Face profile enrolled! Reloading recognition index…");
      closeEnroll();

      // Reload matcher
      setStatus("loading_profiles");
      setStatusMsg("Rebuilding employee face index…");
      const staff = await listStaffUsers();
      const labeled: any[] = [];
      for (const emp of staff.filter((s) => s.photoURL)) {
        try {
          const img = await loadImage(emp.photoURL!);
          const d = await fa
            .detectSingleFace(img, new fa.TinyFaceDetectorOptions({ inputSize: 224 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (d) labeled.push(new fa.LabeledFaceDescriptors(emp.id, [d.descriptor]));
        } catch (_) {}
      }
      faceMatcherRef.current = labeled.length > 0 ? new fa.FaceMatcher(labeled, MATCH_THRESHOLD) : null;
      setStatus("ready");
      setStatusMsg(`Ready — ${labeled.length} employee face(s) indexed.`);
    } catch (err) {
      toast.error("Enrollment failed. Please try again.");
    } finally {
      setEnrollCapturing(false);
    }
  };

  // =========================================================================
  // Check-out
  // =========================================================================
  const handleCheckOut = async () => {
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
  };

  // =========================================================================
  // Render helpers
  // =========================================================================
  const isLoading = ["loading_script", "loading_models", "loading_profiles"].includes(status);

  const faceStatusColor =
    faceLabel === null
      ? "border-white/20"
      : faceLabel === "unknown" || faceLabel === "no_index"
      ? "border-amber-400"
      : "border-emerald-400 animate-pulse";

  const faceStatusText =
    faceLabel === null
      ? "Position your face in the circle"
      : faceLabel === "unknown"
      ? "Unknown face — not registered"
      : faceLabel === "no_index"
      ? "No faces enrolled yet"
      : `Recognised: ${faceLabel}`;

  // =========================================================================
  // JSX
  // =========================================================================
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight">Facial Attendance</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Stand in front of the camera — attendance is recorded automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-xl text-xs font-bold"
            onClick={openEnroll}
            disabled={status !== "ready"}
          >
            Enroll Face Profile
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-xl text-xs font-bold text-red-500 border-red-200 hover:bg-red-50"
            onClick={handleCheckOut}
            disabled={checkingOut}
          >
            {checkingOut ? "…" : "Check Out"}
          </Button>
        </div>
      </div>

      {/* Kiosk Card */}
      <Card className="overflow-hidden rounded-2xl border-stone-100 shadow-sm">
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-sm font-black flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            AI Attendance Kiosk
          </CardTitle>
          <CardDescription className="text-xs">
            {isLoading ? statusMsg : status === "error" ? `Error: ${statusMsg}` : statusMsg}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col items-center gap-4 pt-6 pb-6">
          {/* Loading/Error state */}
          {(isLoading || status === "error") && (
            <div className="flex flex-col items-center gap-2 py-10">
              {isLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              ) : (
                <ShieldAlert className="h-8 w-8 text-destructive" />
              )}
              <p className="text-xs text-muted-foreground max-w-xs text-center">{statusMsg}</p>
            </div>
          )}

          {/* Camera view — only shown when ready */}
          {status === "ready" && (
            <>
              {/* Video container — always in DOM to keep ref stable */}
              <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-black aspect-video flex items-center justify-center">
                <video
                  ref={kioskVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ transform: "scaleX(-1)" }}
                  className="w-full h-full object-cover"
                />

                {/* Overlay only when camera is on */}
                {cameraOn && (
                  <>
                    {/* Face guide circle */}
                    <div
                      className={`pointer-events-none absolute inset-8 rounded-full border-4 border-dashed transition-colors duration-300 ${faceStatusColor}`}
                    />
                    {/* Status label */}
                    <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-black/70 px-3 py-1.5 text-center text-xs font-bold text-white backdrop-blur">
                      {faceStatusText}
                    </div>
                    {/* Kiosk badge */}
                    <div className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                      Live
                    </div>
                  </>
                )}

                {/* Placeholder when camera is off */}
                {!cameraOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stone-950 text-stone-400">
                    <Camera className="h-8 w-8 opacity-30" />
                    <p className="text-xs font-bold opacity-50">Camera offline</p>
                  </div>
                )}
              </div>

              {/* Action button */}
              {!cameraOn ? (
                <Button
                  className="w-full max-w-sm rounded-xl font-bold bg-primary text-white shadow-sm"
                  onClick={startKiosk}
                >
                  Activate Kiosk Camera
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full max-w-sm rounded-xl font-bold"
                  onClick={stopKiosk}
                >
                  Stop Camera
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Logs */}
      <Card className="overflow-hidden rounded-2xl border-stone-100 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-3">
          <div>
            <CardTitle className="text-sm font-black">Today's Logs</CardTitle>
            <CardDescription className="text-xs">{today}</CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg text-xs font-bold"
            onClick={loadLogs}
          >
            {logsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <ShieldAlert className="h-6 w-6 text-stone-300" />
              <p className="text-xs font-bold text-stone-400">No check-ins today</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-xs">
                <thead className="border-b bg-stone-50 font-bold text-stone-500">
                  <tr>
                    <th className="p-3 text-left">Employee</th>
                    <th className="p-3 text-left">In</th>
                    <th className="p-3 text-left">Out</th>
                    <th className="p-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-stone-50/50">
                      <td className="p-3 font-semibold">{log.employeeName}</td>
                      <td className="p-3 font-bold text-stone-700">
                        {log.checkIn
                          ? new Date(log.checkIn).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="p-3 text-stone-500">
                        {log.checkOut
                          ? new Date(log.checkOut).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="p-3">
                        {log.isLate ? (
                          <Badge variant="destructive" className="text-[9px] font-black">
                            Late
                          </Badge>
                        ) : (
                          <Badge variant="success" className="text-[9px] font-black">
                            On Time
                          </Badge>
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

      {/* Enroll Modal */}
      {enrollOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black">Enroll Face Profile</h3>
              <button
                onClick={closeEnroll}
                className="text-xs font-bold text-stone-400 hover:text-stone-700"
              >
                Cancel
              </button>
            </div>

            <div className="overflow-hidden rounded-xl bg-black aspect-video">
              <video
                ref={enrollVideoRef}
                autoPlay
                playsInline
                muted
                style={{ transform: "scaleX(-1)" }}
                className="h-full w-full object-cover"
              />
            </div>

            <p className="text-center text-[10px] text-stone-400">
              Look directly at the camera in good lighting, then tap Capture.
            </p>

            <Button
              className="w-full rounded-xl font-bold"
              onClick={captureAndEnroll}
              disabled={enrollCapturing}
            >
              {enrollCapturing ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Processing…
                </>
              ) : (
                "Capture & Enroll"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility: load an HTMLImageElement from a URL (handles base64 + remote URLs)
// ---------------------------------------------------------------------------
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
