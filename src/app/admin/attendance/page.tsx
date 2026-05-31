"use client";

/**
 * Facial Attendance Page
 *
 * TWO MODES:
 * ─────────────────────────────────────────────────────
 * 1. Super Admin → "Face Enrollment" tab
 *    - See all staff, pick one, open camera, capture their
 *      face and save it as their registered face template.
 *
 * 2. Everyone → "Check In" tab (default)
 *    - Employee types their email.
 *    - System loads their registered face photo from Firestore.
 *    - Camera activates and continuously compares live frames
 *      against their face descriptor.
 *    - On match → attendance recorded (check-in logged).
 *    - On mismatch → rejected with error.
 * ─────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  UserCheck,
  UserX,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth-store";
import { attendanceRepo, checkInGPS, checkOut } from "@/services/attendance.service";
import { listStaffUsers, getUserByEmail } from "@/services/users.service";
import { where } from "@/services/base.repository";
import type { AttendanceRecord, AppUser } from "@/types";
import { doc, updateDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/config";
import { COLLECTIONS } from "@/constants";
import { isSuperAdmin } from "@/lib/permissions";

// ─── Config ────────────────────────────────────────────────────────────────
const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/";
const FACE_API_CDN =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js";
const MATCH_THRESHOLD = 0.45; // euclidean distance; lower = stricter
const DETECT_MS = 600;
const RESTAURANT_LAT = 31.7131;
const RESTAURANT_LNG = 73.9724;

// ─── Tiny helpers ──────────────────────────────────────────────────────────
function playChime(success = true) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    if (success) {
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) {}
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

type BootStatus =
  | "idle"
  | "loading_script"
  | "loading_models"
  | "ready"
  | "error";

type CheckInStep =
  | "email"        // entering email
  | "looking_up"  // fetching user from DB
  | "camera"       // camera running, matching face
  | "matched"      // success
  | "failed";      // rejection

// ──────────────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  const { profile } = useAuthStore();
  const isSA = isSuperAdmin(profile);
  // admins (super_admin OR admin) can enroll employee faces
  const isAdmin = isSA || profile?.role === "admin";

  // ── face-api boot ──
  const [bootStatus, setBootStatus] = useState<BootStatus>("idle");
  const [bootMsg, setBootMsg] = useState("");

  // ── active tab ──
  const [tab, setTab] = useState<"checkin" | "enroll">("checkin");

  // ── check-in flow ──
  const [ciStep, setCiStep] = useState<CheckInStep>("email");
  const [ciEmail, setCiEmail] = useState("");
  const [ciUser, setCiUser] = useState<AppUser | null>(null);
  const [ciDescriptor, setCiDescriptor] = useState<Float32Array | null>(null);
  const [ciResult, setCiResult] = useState<"matched" | "failed" | null>(null);

  // ── enroll flow ──
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [enrollTarget, setEnrollTarget] = useState<AppUser | null>(null);
  const [enrollCapturing, setEnrollCapturing] = useState(false);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());

  // ── attendance logs ──
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const today = new Date().toISOString().split("T")[0]!;

  // ── refs ──
  const ciVideoRef = useRef<HTMLVideoElement>(null);
  const enrollVideoRef = useRef<HTMLVideoElement>(null);
  const ciStreamRef = useRef<MediaStream | null>(null);
  const enrollStreamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingRef = useRef(false);
  const matchAttemptedRef = useRef(false);

  // ── bind check-in stream ──
  useEffect(() => {
    if (ciStep === "camera" && ciStreamRef.current && ciVideoRef.current) {
      ciVideoRef.current.srcObject = ciStreamRef.current;
    }
  }, [ciStep]);

  // ── bind enroll stream ──
  useEffect(() => {
    if (enrollTarget && enrollStreamRef.current && enrollVideoRef.current) {
      enrollVideoRef.current.srcObject = enrollStreamRef.current;
    }
  }, [enrollTarget]);

  // ==========================================================================
  // 1. Bootstrap face-api (script + models only — no staff loading here)
  // ==========================================================================
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      if (!(window as any).faceapi) {
        setBootStatus("loading_script");
        setBootMsg("Loading face-api.js…");
        await new Promise<void>((res, rej) => {
          const s = document.createElement("script");
          s.src = FACE_API_CDN;
          s.async = true;
          s.onload = () => res();
          s.onerror = () => rej(new Error("CDN script failed to load."));
          document.head.appendChild(s);
        });
      }
      if (cancelled) return;

      const fa = (window as any).faceapi;
      if (!fa.nets.tinyFaceDetector.isLoaded) {
        setBootStatus("loading_models");
        setBootMsg("Loading neural network weights…");
        await Promise.all([
          fa.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
      }

      if (!cancelled) {
        setBootStatus("ready");
        setBootMsg("Models ready.");
      }
    };

    boot().catch((e) => {
      if (!cancelled) {
        setBootStatus("error");
        setBootMsg(String(e?.message ?? e));
      }
    });

    return () => { cancelled = true; };
  }, []);

  // ==========================================================================
  // 2. Load logs & staff list
  // ==========================================================================
  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const records = await attendanceRepo.getAll([where("date", "==", today)]);
      setLogs(records);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const staff = await listStaffUsers();
      setStaffList(staff);
      setEnrolledIds(new Set(staff.filter((s) => s.photoURL).map((s) => s.id)));
    } finally {
      setStaffLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    if (isSA) loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSA]);

  // ==========================================================================
  // 3. Face detection ticker (check-in camera)
  // ==========================================================================
  useEffect(() => {
    if (ciStep !== "camera" || bootStatus !== "ready" || !ciDescriptor) return;
    matchAttemptedRef.current = false;

    const fa = (window as any).faceapi;
    const tick = async () => {
      const vid = ciVideoRef.current;
      if (!vid || vid.readyState < 2 || processingRef.current || matchAttemptedRef.current) return;
      processingRef.current = true;

      try {
        const det = await fa
          .detectSingleFace(
            vid,
            new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
          )
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!det) return; // no face yet

        const distance = fa.euclideanDistance(ciDescriptor, det.descriptor);
        matchAttemptedRef.current = true;

        if (distance <= MATCH_THRESHOLD) {
          // ✅ Matched
          stopCiCamera();
          setCiResult("matched");
          setCiStep("matched");
          playChime(true);
          toast.success(`✅ Identity verified for ${ciUser!.displayName}`);

          // Record attendance
          try {
            await checkInGPS(
              ciUser!.id,
              ciUser!.displayName,
              RESTAURANT_LAT,
              RESTAURANT_LNG,
              "11:00"
            );
            toast.success(`Attendance marked for ${ciUser!.displayName}`);
            await loadLogs();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Check-in error");
          }
        } else {
          // ❌ No match
          stopCiCamera();
          setCiResult("failed");
          setCiStep("failed");
          playChime(false);
          toast.error("Face does not match this email. Access denied.");
        }
      } finally {
        processingRef.current = false;
      }
    };

    tickRef.current = setInterval(tick, DETECT_MS);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ciStep, ciDescriptor, bootStatus]);

  // ==========================================================================
  // 4. Check-in camera helpers
  // ==========================================================================
  const startCiCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      ciStreamRef.current = stream;
      setCiStep("camera");          // useEffect will bind stream
    } catch {
      toast.error("Camera access denied.");
    }
  };

  const stopCiCamera = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    ciStreamRef.current?.getTracks().forEach((t) => t.stop());
    ciStreamRef.current = null;
    if (ciVideoRef.current) ciVideoRef.current.srcObject = null;
  };

  const resetCheckIn = () => {
    stopCiCamera();
    setCiStep("email");
    setCiEmail("");
    setCiUser(null);
    setCiDescriptor(null);
    setCiResult(null);
    matchAttemptedRef.current = false;
    processingRef.current = false;
  };

  // ==========================================================================
  // 5. Look up employee by email and extract their face descriptor
  // ==========================================================================
  const handleEmailSubmit = async () => {
    if (!ciEmail.trim()) return;
    setCiStep("looking_up");
    try {
      const fa = (window as any).faceapi;
      const user = await getUserByEmail(ciEmail.trim());

      if (!user) {
        toast.error("No employee found with this email.");
        setCiStep("email");
        return;
      }

      if (!user.photoURL) {
        toast.error(`${user.displayName} has no face enrolled. Please ask the admin to enroll your face first.`);
        setCiStep("email");
        return;
      }

      // Extract descriptor from saved face photo
      const img = await loadImage(user.photoURL);
      const det = await fa
        .detectSingleFace(img, new fa.TinyFaceDetectorOptions({ inputSize: 224 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!det) {
        toast.error("Stored face profile is invalid. Please re-enroll.");
        setCiStep("email");
        return;
      }

      setCiUser(user);
      setCiDescriptor(det.descriptor);
      toast.info(`Profile loaded for ${user.displayName}. Opening camera…`);
      await startCiCamera();
    } catch (e) {
      toast.error("Error looking up profile. Try again.");
      setCiStep("email");
    }
  };

  // ==========================================================================
  // 6. Enroll camera helpers (super admin only)
  // ==========================================================================
  const openEnroll = async (emp: AppUser) => {
    setEnrollTarget(emp);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      enrollStreamRef.current = stream;
      // binding via useEffect
    } catch {
      toast.error("Camera access denied.");
      setEnrollTarget(null);
    }
  };

  const closeEnroll = () => {
    enrollStreamRef.current?.getTracks().forEach((t) => t.stop());
    enrollStreamRef.current = null;
    if (enrollVideoRef.current) enrollVideoRef.current.srcObject = null;
    setEnrollTarget(null);
  };

  const captureEnroll = async () => {
    if (!enrollTarget || !enrollVideoRef.current) return;
    const fa = (window as any).faceapi;
    setEnrollCapturing(true);

    try {
      const vid = enrollVideoRef.current;
      if (vid.readyState < 2) {
        toast.error("Camera not ready yet.");
        return;
      }

      const det = await fa
        .detectSingleFace(vid, new fa.TinyFaceDetectorOptions({ inputSize: 224 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!det) {
        toast.error("No face detected. Position clearly in front of the camera.");
        return;
      }

      // Snapshot to base64
      const canvas = document.createElement("canvas");
      canvas.width = vid.videoWidth;
      canvas.height = vid.videoHeight;
      canvas.getContext("2d")?.drawImage(vid, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

      await updateDoc(doc(getFirestoreDb(), COLLECTIONS.users, enrollTarget.id), {
        photoURL: dataUrl,
        updatedAt: new Date().toISOString(),
      });

      toast.success(`✅ ${enrollTarget.displayName}'s face enrolled successfully!`);
      setEnrolledIds((prev) => new Set([...prev, enrollTarget.id]));
      closeEnroll();
      loadStaff();
    } catch (e) {
      toast.error("Enrollment failed.");
    } finally {
      setEnrollCapturing(false);
    }
  };

  // ==========================================================================
  // 7. Check-out
  // ==========================================================================
  const handleCheckOut = async (empId: string, empName: string) => {
    try {
      await checkOut(empId);
      toast.success(`${empName} checked out.`);
      loadLogs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-out failed");
    }
  };

  // ==========================================================================
  // Render helpers
  // ==========================================================================
  const isBooting = ["loading_script", "loading_models"].includes(bootStatus);

  const ciStatusColor =
    ciStep === "camera"
      ? "border-amber-400 animate-pulse"
      : ciStep === "matched"
      ? "border-emerald-400"
      : ciStep === "failed"
      ? "border-red-400"
      : "border-white/20";

  const ciStatusText =
    ciStep === "camera"
      ? "Looking for your face…"
      : ciStep === "matched"
      ? `✅ Verified — ${ciUser?.displayName}`
      : ciStep === "failed"
      ? "❌ Face mismatch — not recognised"
      : "";

  // ==========================================================================
  // JSX
  // ==========================================================================
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-black tracking-tight">Facial Attendance</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Enter your email, then verify with your face to clock in.
        </p>
      </div>

      {/* ── Boot status banner ── */}
      {isBooting && (
        <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-xs font-semibold">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          {bootMsg}
        </div>
      )}
      {bootStatus === "error" && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
          <ShieldAlert className="h-4 w-4" />
          {bootMsg}
        </div>
      )}

      {/* ── Tab switcher (admin + super admin get Enroll tab) ── */}
      {isAdmin && (
        <div className="flex w-fit gap-1 rounded-xl border bg-stone-100 p-1 text-xs">
          {(["checkin", "enroll"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 font-bold transition-all capitalize ${
                tab === t ? "bg-white shadow-sm text-stone-900" : "text-stone-500 hover:text-stone-800"
              }`}
            >
              {t === "checkin" ? "Check In" : "Enroll Faces"}
            </button>
          ))}
        </div>
      )}

      {/* ========================================================
          CHECK-IN TAB
         ======================================================== */}
      {tab === "checkin" && (
        <Card className="overflow-hidden rounded-2xl border-stone-100 shadow-sm">
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-sm font-black flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              Face Check-In
            </CardTitle>
            <CardDescription className="text-xs">
              Enter your work email, then let the camera verify your identity.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col items-center gap-4 pt-6 pb-6">
            {/* Step: email entry */}
            {ciStep === "email" && (
              <div className="w-full max-w-sm space-y-3">
                <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-4 py-3">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    type="email"
                    placeholder="your.email@rushpizza.pk"
                    value={ciEmail}
                    onChange={(e) => setCiEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleEmailSubmit()}
                    className="flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
                <Button
                  className="w-full rounded-xl font-bold"
                  disabled={!ciEmail.trim() || bootStatus !== "ready"}
                  onClick={handleEmailSubmit}
                >
                  {bootStatus !== "ready" ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Loading…
                    </>
                  ) : (
                    "Continue →"
                  )}
                </Button>
              </div>
            )}

            {/* Step: looking up */}
            {ciStep === "looking_up" && (
              <div className="flex flex-col items-center gap-2 py-8">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-xs font-semibold text-muted-foreground">
                  Fetching profile…
                </p>
              </div>
            )}

            {/* Step: camera + matched + failed */}
            {(ciStep === "camera" || ciStep === "matched" || ciStep === "failed") && (
              <>
                {/* Employee info banner */}
                {ciUser && (
                  <div className="flex w-full max-w-sm items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">
                      {ciUser.displayName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{ciUser.displayName}</p>
                      <p className="text-xs text-muted-foreground">{ciUser.email}</p>
                    </div>
                  </div>
                )}

                {/* Camera view */}
                <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-black aspect-video">
                  <video
                    ref={ciVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ transform: "scaleX(-1)" }}
                    className="h-full w-full object-cover"
                  />
                  {/* Circular guide */}
                  <div
                    className={`pointer-events-none absolute inset-8 rounded-full border-4 border-dashed transition-colors duration-300 ${ciStatusColor}`}
                  />
                  {/* Result overlay on match/fail */}
                  {(ciStep === "matched" || ciStep === "failed") && (
                    <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 backdrop-blur-sm`}>
                      {ciStep === "matched" ? (
                        <>
                          <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                          <p className="text-sm font-black text-white">Attendance Marked!</p>
                        </>
                      ) : (
                        <>
                          <UserX className="h-12 w-12 text-red-400" />
                          <p className="text-sm font-black text-white">Face Not Recognised</p>
                        </>
                      )}
                    </div>
                  )}
                  {/* Live status label */}
                  {ciStep === "camera" && (
                    <div className="absolute bottom-2 inset-x-2 rounded-xl bg-black/70 px-3 py-1.5 text-center text-xs font-bold text-white backdrop-blur">
                      {ciStatusText}
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  className="w-full max-w-sm rounded-xl font-bold"
                  onClick={resetCheckIn}
                >
                  {ciStep === "camera" ? "Cancel" : "Try Again / New Check-In"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========================================================
          ENROLL TAB (admin + super admin)
         ======================================================== */}
      {tab === "enroll" && isAdmin && (
        <Card className="overflow-hidden rounded-2xl border-stone-100 shadow-sm">
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-sm font-black flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              Employee Face Enrollment
            </CardTitle>
            <CardDescription className="text-xs">
              Capture each employee's face once. They can then use facial check-in going forward.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {staffLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-2">
                {staffList.map((emp) => (
                  <div
                    key={emp.id}
                    className="flex items-center justify-between rounded-xl border px-4 py-3 hover:bg-muted/20 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-black text-primary">
                        {emp.photoURL ? (
                          <img
                            src={emp.photoURL}
                            alt="face"
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          emp.displayName.charAt(0)
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{emp.displayName}</p>
                        <p className="text-xs text-muted-foreground">{emp.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {enrolledIds.has(emp.id) ? (
                        <Badge variant="success" className="text-[9px] font-black px-2">
                          Enrolled
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[9px] font-black px-2">
                          Not enrolled
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg text-xs font-bold"
                        disabled={bootStatus !== "ready"}
                        onClick={() => openEnroll(emp)}
                      >
                        {enrolledIds.has(emp.id) ? "Re-enroll" : "Enroll"}
                      </Button>
                    </div>
                  </div>
                ))}
                {staffList.length === 0 && (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    No staff accounts found.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Enroll Modal ── */}
      {enrollTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-black">Enrolling Face</h3>
                <p className="text-xs text-muted-foreground">{enrollTarget.displayName}</p>
              </div>
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
              Have {enrollTarget.displayName} look directly at the camera in good lighting.
            </p>

            <Button
              className="w-full rounded-xl font-bold"
              onClick={captureEnroll}
              disabled={enrollCapturing}
            >
              {enrollCapturing ? (
                <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Processing…</>
              ) : (
                "Capture & Save Face"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Daily Logs ── */}
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
                    {isSA && <th className="p-3 text-right">Actions</th>}
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
                      {isSA && (
                        <td className="p-3 text-right">
                          {!log.checkOut && (
                            <button
                              className="text-[10px] font-bold text-red-500 hover:underline"
                              onClick={() => handleCheckOut(log.employeeId, log.employeeName)}
                            >
                              Check Out
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
