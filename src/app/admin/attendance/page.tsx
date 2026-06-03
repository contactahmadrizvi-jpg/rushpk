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
/** Euclidean distance cut-off — LOWER = stricter. 0.38 blocks near-lookalikes. */
const MATCH_THRESHOLD = 0.38;
/** Minimum face-detector confidence (0-1). 0.65 filters blurry/partial faces. */
const DETECT_SCORE_THRESHOLD = 0.65;
/** Higher input size → better descriptor quality, but slower. */
const DETECT_INPUT_SIZE: 160 | 224 | 320 | 416 | 512 | 608 = 320;
/** How often (ms) we run a detection tick while camera is live. */
const DETECT_MS = 500;
/** Consecutive matching frames required before attendance is recorded. */
const REQUIRED_MATCHES = 3;
/** Consecutive mismatching frames before we hard-reject. */
const MAX_FAILS = 6;
/** Frames to capture & average during face enrollment for a robust template. */
const ENROLL_FRAMES = 5;
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
  } catch (_) { }
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
  // admins (super_admin OR admin) can enroll any employee's face
  const isAdmin = isSA || profile?.role === "admin";
  // employees can only enroll their own face
  const isEmployee = profile?.role === "employee";

  if (profile && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center min-h-[400px]">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="max-w-md text-muted-foreground">
          You are signed in as <strong>{profile.displayName || profile.email}</strong>.
          Only system administrators and admins can view the attendance system dashboard, logs, or enrollment.
        </p>
      </div>
    );
  }

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
  /** How many consecutive matching frames we've seen (0-REQUIRED_MATCHES). */
  const [scanProgress, setScanProgress] = useState(0);

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
  /** Running count of consecutive matching frames. */
  const matchCountRef = useRef(0);
  /** Running count of consecutive non-matching frames (face present but wrong). */
  const failCountRef = useRef(0);

  // ── bind check-in stream ──
  useEffect(() => {
    if (ciStep === "camera" && ciStreamRef.current && ciVideoRef.current) {
      ciVideoRef.current.srcObject = ciStreamRef.current;
    }
  }, [ciStep]);

  // ── bind enroll stream (only as a fallback if ref is already set) ──
  useEffect(() => {
    if (enrollTarget && enrollStreamRef.current && enrollVideoRef.current) {
      enrollVideoRef.current.srcObject = enrollStreamRef.current;
      enrollVideoRef.current.play().catch(() => {});
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
    if (isAdmin) loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // ==========================================================================
  // 3. Face detection ticker (check-in camera)
  //    Requires REQUIRED_MATCHES consecutive matching frames before confirming.
  //    Rejects after MAX_FAILS consecutive mismatching frames.
  // ==========================================================================
  useEffect(() => {
    if (ciStep !== "camera" || bootStatus !== "ready" || !ciDescriptor) return;

    // Reset counters every time the camera step starts
    matchAttemptedRef.current = false;
    matchCountRef.current = 0;
    failCountRef.current = 0;
    setScanProgress(0);

    const fa = (window as any).faceapi;

    const tick = async () => {
      const vid = ciVideoRef.current;
      if (!vid || vid.readyState < 2 || processingRef.current || matchAttemptedRef.current) return;
      processingRef.current = true;

      try {
        const det = await fa
          .detectSingleFace(
            vid,
            new fa.TinyFaceDetectorOptions({
              inputSize: DETECT_INPUT_SIZE,
              scoreThreshold: DETECT_SCORE_THRESHOLD,
            })
          )
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!det) {
          // No face detected — reset both streaks so we wait for a clear face
          matchCountRef.current = 0;
          failCountRef.current = 0;
          setScanProgress(0);
          return;
        }

        const distance = fa.euclideanDistance(ciDescriptor, det.descriptor);

        if (distance <= MATCH_THRESHOLD) {
          // ✅ This frame matches — increment match streak, reset fail streak
          failCountRef.current = 0;
          matchCountRef.current += 1;
          setScanProgress(matchCountRef.current);

          if (matchCountRef.current >= REQUIRED_MATCHES) {
            // ✅ Enough consecutive matches — confirmed!
            matchAttemptedRef.current = true;
            stopCiCamera();
            setCiResult("matched");
            setCiStep("matched");
            playChime(true);
            toast.success(`✅ Identity verified for ${ciUser!.displayName}`);

            try {
              await checkInGPS(
                ciUser!.id,
                ciUser!.displayName,
                RESTAURANT_LAT,
                RESTAURANT_LNG,
                "13:00"
              );
              toast.success(`Attendance marked for ${ciUser!.displayName}`);
              await loadLogs();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Check-in error");
            }
          }
        } else {
          // ❌ This frame does NOT match — increment fail streak, reset match streak
          matchCountRef.current = 0;
          setScanProgress(0);
          failCountRef.current += 1;

          if (failCountRef.current >= MAX_FAILS) {
            // ❌ Too many consecutive mismatches — hard reject
            matchAttemptedRef.current = true;
            stopCiCamera();
            setCiResult("failed");
            setCiStep("failed");
            playChime(false);
            toast.error(`Face does not match. Distance: ${distance.toFixed(3)} (max allowed: ${MATCH_THRESHOLD}). Access denied.`);
          }
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
    setScanProgress(0);
    matchAttemptedRef.current = false;
    matchCountRef.current = 0;
    failCountRef.current = 0;
    processingRef.current = false;
  };

  // ==========================================================================
  // 5. Look up employee by email and load their face descriptor
  //    Priority: use pre-computed averaged faceDescriptor from enrollment.
  //    Fallback: re-detect from the stored photo (legacy / pre-update users).
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

      let descriptor: Float32Array;

      // ── Fast path: use the pre-averaged descriptor stored at enrollment time ──
      const rawDescriptor = (user as any).faceDescriptor as number[] | undefined;
      if (rawDescriptor && rawDescriptor.length === 128) {
        descriptor = new Float32Array(rawDescriptor);
        toast.info(`Profile loaded for ${user.displayName}. Opening camera…`);
      } else {
        // ── Legacy fallback: re-detect from the stored photo ──
        toast.info(`Loading face profile for ${user.displayName}…`);
        const img = await loadImage(user.photoURL);
        const det = await fa
          .detectSingleFace(
            img,
            new fa.TinyFaceDetectorOptions({
              inputSize: DETECT_INPUT_SIZE,
              scoreThreshold: 0.5, // more lenient for static images
            })
          )
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!det) {
          toast.error("Stored face profile is invalid. Please re-enroll using the Enroll tab.");
          setCiStep("email");
          return;
        }
        descriptor = det.descriptor;
        toast.info(`Profile loaded for ${user.displayName}. Opening camera…`);
      }

      setCiUser(user);
      setCiDescriptor(descriptor);
      await startCiCamera();
    } catch (e) {
      toast.error("Error loading profile. Try again.");
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
      // Directly assign srcObject — don't rely on useEffect timing
      if (enrollVideoRef.current) {
        enrollVideoRef.current.srcObject = stream;
        enrollVideoRef.current.play().catch(() => {});
      }
    } catch {
      toast.error("Camera access denied. Please allow camera permission and try again.");
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

      // Wait up to 4 seconds for the camera feed to be ready
      if (vid.readyState < 2) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("timeout")), 4000);
          const check = setInterval(() => {
            if (vid.readyState >= 2) {
              clearInterval(check);
              clearTimeout(timeout);
              resolve();
            }
          }, 100);
        }).catch(() => {
          throw new Error("Camera feed did not start in time. Please close and re-open the enroll dialog.");
        });
      }

      // ── Capture ENROLL_FRAMES frames and average their descriptors ──────────
      // Averaging multiple detections produces a more stable face template
      // that works better under different lighting conditions.
      const descriptors: Float32Array[] = [];
      let snapshot: string | null = null;

      for (let i = 0; i < ENROLL_FRAMES; i++) {
        // Small pause between frames so camera can adjust
        if (i > 0) await new Promise((r) => setTimeout(r, 200));

        const det = await fa
          .detectSingleFace(
            vid,
            new fa.TinyFaceDetectorOptions({
              inputSize: DETECT_INPUT_SIZE,
              scoreThreshold: DETECT_SCORE_THRESHOLD,
            })
          )
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!det) {
          toast.error(
            `Frame ${i + 1}/${ENROLL_FRAMES}: No face detected. Keep still and look straight at the camera.`
          );
          return;
        }

        descriptors.push(det.descriptor);

        // Take the snapshot from the 3rd frame (camera has had time to adjust)
        if (i === 2) {
          const canvas = document.createElement("canvas");
          canvas.width = vid.videoWidth;
          canvas.height = vid.videoHeight;
          canvas.getContext("2d")?.drawImage(vid, 0, 0);
          snapshot = canvas.toDataURL("image/jpeg", 0.9);
        }
      }

      if (descriptors.length < ENROLL_FRAMES) {
        toast.error("Could not capture enough frames. Please try again.");
        return;
      }

      // Average all descriptors element-wise
      const averaged = new Float32Array(descriptors[0].length);
      for (const desc of descriptors) {
        for (let j = 0; j < desc.length; j++) {
          averaged[j] += desc[j] / descriptors.length;
        }
      }

      // Store the averaged descriptor as JSON alongside the snapshot
      await updateDoc(doc(getFirestoreDb(), COLLECTIONS.users, enrollTarget.id), {
        photoURL: snapshot,
        // Store raw descriptor so check-in can use pre-computed values
        faceDescriptor: Array.from(averaged),
        updatedAt: new Date().toISOString(),
      });

      toast.success(`✅ ${enrollTarget.displayName}'s face enrolled successfully! (${ENROLL_FRAMES} frames averaged)`);
      setEnrolledIds((prev) => new Set([...prev, enrollTarget.id]));
      closeEnroll();
      loadStaff();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrollment failed. Please try again.");
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
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-5 sm:py-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-lg sm:text-xl font-black tracking-tight">Facial Attendance</h1>
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

      {/* ── Tab switcher — admins + employees get the Enroll tab ── */}
      {(isAdmin || isEmployee) && (
        <div className="flex w-full sm:w-fit gap-1 rounded-xl border bg-stone-100 p-1 text-xs">
          {(["checkin", "enroll"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 sm:flex-none rounded-lg px-4 py-2 font-bold transition-all capitalize text-center ${tab === t ? "bg-white shadow-sm text-stone-900" : "text-stone-500 hover:text-stone-800"
                }`}
            >
              {t === "checkin"
                ? "Check In"
                : isEmployee
                  ? "My Face"
                  : "Enroll Faces"}
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

          <CardContent className="flex flex-col items-center gap-4 pt-5 pb-5 px-3 sm:px-6">
            {/* Step: email entry */}
            {ciStep === "email" && (
              <div className="w-full max-w-md space-y-3">
                <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-4 py-3">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    type="email"
                    placeholder="your.email@rushpizza.pk"
                    value={ciEmail}
                    onChange={(e) => setCiEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleEmailSubmit()}
                    className="flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/60 min-w-0"
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
                  <div className="flex w-full max-w-md items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">
                      {ciUser.displayName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{ciUser.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{ciUser.email}</p>
                    </div>
                  </div>
                )}

                {/* Camera view */}
                <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-black aspect-video">
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
                    className={`pointer-events-none absolute inset-6 sm:inset-8 rounded-full border-4 border-dashed transition-colors duration-300 ${ciStatusColor}`}
                  />
                  {/* Result overlay on match/fail */}
                  {(ciStep === "matched" || ciStep === "failed") && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 backdrop-blur-sm">
                      {ciStep === "matched" ? (
                        <>
                          <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 text-emerald-400" />
                          <p className="text-sm font-black text-white">Attendance Marked!</p>
                        </>
                      ) : (
                        <>
                          <UserX className="h-10 w-10 sm:h-12 sm:w-12 text-red-400" />
                          <p className="text-sm font-black text-white">Face Not Recognised</p>
                        </>
                      )}
                    </div>
                  )}
                  {/* Live scanning status + progress bar */}
                  {ciStep === "camera" && (
                    <div className="absolute bottom-0 inset-x-0 bg-black/75 backdrop-blur px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-white/80">Scanning…</span>
                        <span className="text-[10px] font-black text-amber-300">
                          {scanProgress}/{REQUIRED_MATCHES} confirmed
                        </span>
                      </div>
                      {/* Progress dots */}
                      <div className="flex gap-1.5">
                        {Array.from({ length: REQUIRED_MATCHES }).map((_, i) => (
                          <div
                            key={i}
                            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                              i < scanProgress
                                ? "bg-emerald-400"
                                : "bg-white/20"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  className="w-full max-w-md rounded-xl font-bold"
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
          ENROLL TAB
          - Admin / Super Admin: see full staff list, enroll anyone
          - Employee: see only themselves, self-enroll only
         ======================================================== */}
      {tab === "enroll" && (isAdmin || isEmployee) && (
        <Card className="overflow-hidden rounded-2xl border-stone-100 shadow-sm">
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-sm font-black flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              {isEmployee ? "Enroll My Face" : "Employee Face Enrollment"}
            </CardTitle>
            <CardDescription className="text-xs">
              {isEmployee
                ? "Capture your face once so you can use facial attendance going forward."
                : "Capture each employee's face once. They can then use facial check-in going forward."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 px-3 sm:px-6">

            {/* ── EMPLOYEE: self-enroll only ── */}
            {isEmployee && profile && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-black text-primary">
                    {profile.photoURL ? (
                      <img
                        src={profile.photoURL}
                        alt="face"
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      (profile.displayName ?? "?").charAt(0)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{profile.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {profile.photoURL ? (
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
                    onClick={() => openEnroll(profile as any)}
                  >
                    {profile.photoURL ? "Re-enroll" : "Enroll"}
                  </Button>
                </div>
              </div>
            )}

            {/* ── ADMIN: full staff list ── */}
            {isAdmin && (
              staffLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-2">
                  {staffList.map((emp) => (
                    <div
                      key={emp.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 hover:bg-muted/20 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
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
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate">{emp.displayName}</p>
                          <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
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
              )
            )}

          </CardContent>
        </Card>
      )}

      {/* ── Enroll Modal ── */}
      {enrollTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className="w-full sm:max-w-md space-y-4 rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-2xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-black">Enrolling Face</h3>
                <p className="text-xs text-muted-foreground">{enrollTarget.displayName}</p>
              </div>
              <button
                onClick={closeEnroll}
                className="text-xs font-bold text-stone-400 hover:text-stone-700 px-2 py-1"
              >
                Cancel
              </button>
            </div>

            <div className="overflow-hidden rounded-xl bg-black aspect-video w-full">
              <video
                ref={enrollVideoRef}
                autoPlay
                playsInline
                muted
                style={{ transform: "scaleX(-1)" }}
                className="h-full w-full object-cover"
                onLoadedMetadata={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
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
        <CardContent className="pt-4 px-0 sm:px-6">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <ShieldAlert className="h-6 w-6 text-stone-300" />
              <p className="text-xs font-bold text-stone-400">No check-ins today</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border mx-3 sm:mx-0">
              <table className="w-full text-xs min-w-[340px]">
                <thead className="border-b bg-stone-50 font-bold text-stone-500">
                  <tr>
                    <th className="p-2.5 sm:p-3 text-left">Employee</th>
                    <th className="p-2.5 sm:p-3 text-left">In</th>
                    <th className="p-2.5 sm:p-3 text-left">Out</th>
                    <th className="p-2.5 sm:p-3 text-left">Status</th>
                    {isSA && <th className="p-2.5 sm:p-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-stone-50/50">
                      <td className="p-2.5 sm:p-3 font-semibold max-w-[100px] sm:max-w-none truncate">{log.employeeName}</td>
                      <td className="p-2.5 sm:p-3 font-bold text-stone-700 whitespace-nowrap">
                        {log.checkIn
                          ? new Date(log.checkIn).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                          : "—"}
                      </td>
                      <td className="p-2.5 sm:p-3 text-stone-500 whitespace-nowrap">
                        {log.checkOut
                          ? new Date(log.checkOut).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                          : "—"}
                      </td>
                      <td className="p-2.5 sm:p-3">
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
                        <td className="p-2.5 sm:p-3 text-right">
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
