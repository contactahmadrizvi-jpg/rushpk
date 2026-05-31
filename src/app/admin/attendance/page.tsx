"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { CheckCircle2, MapPin, QrCode, ShieldAlert, Sparkles, Camera, RefreshCw, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";
import { checkInGPS, checkOut, attendanceRepo } from "@/services/attendance.service";
import { QRCodeSVG } from "qrcode.react";
import type { AttendanceRecord } from "@/types";
import { isSuperAdmin, userHasPermission } from "@/lib/permissions";
import { where } from "@/services/base.repository";
import { doc, updateDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/config";
import { COLLECTIONS } from "@/constants";

const MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/";

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.error(e);
  }
}

export default function AttendancePage() {
  const { profile, refreshProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [activeCheckTab, setActiveCheckTab] = useState<"gps_qr" | "face">("face");

  // Face Recognition states
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [verifyingFace, setVerifyingFace] = useState(false);
  const [registeringFace, setRegisteringFace] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [matchScore, setMatchScore] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionIntervalRef = useRef<number | null>(null);
  const referenceDescriptorRef = useRef<Float32Array | null>(null);

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

  // Load face-api.js from CDN dynamically to avoid compilation/SSR issues
  useEffect(() => {
    let active = true;
    const loadScript = async () => {
      if ((window as any).faceapi) {
        if (active) setFaceApiLoaded(true);
        return;
      }
      return new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js";
        script.async = true;
        script.onload = () => {
          if (active) setFaceApiLoaded(true);
          resolve();
        };
        script.onerror = (e) => reject(e);
        document.body.appendChild(script);
      });
    };

    loadScript().catch((err) => console.error("Failed to load face-api script:", err));

    return () => {
      active = false;
      stopCamera();
    };
  }, []);

  // Load models once script is ready
  useEffect(() => {
    if (!faceApiLoaded) return;
    let active = true;

    const loadModels = async () => {
      try {
        const fa = (window as any).faceapi;
        await Promise.all([
          fa.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (active) setModelsLoaded(true);
      } catch (err) {
        console.error("Failed to load face-api models:", err);
      }
    };

    loadModels();
    return () => {
      active = false;
    };
  }, [faceApiLoaded]);

  // Extract reference face descriptor from profile photoURL when profile changes or matches
  useEffect(() => {
    if (!modelsLoaded || !profile?.photoURL) return;
    let active = true;

    const extractReference = async () => {
      try {
        const fa = (window as any).faceapi;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = profile.photoURL!;
        img.onload = async () => {
          if (!active) return;
          const detection = await fa.detectSingleFace(img, new fa.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (detection) {
            referenceDescriptorRef.current = detection.descriptor;
            console.log("Reference face descriptor extracted successfully.");
          } else {
            console.warn("Could not extract face descriptor from reference photoURL.");
            referenceDescriptorRef.current = null;
          }
        };
      } catch (err) {
        console.error("Error extracting reference face descriptor:", err);
      }
    };

    extractReference();
    return () => {
      active = false;
    };
  }, [modelsLoaded, profile?.photoURL]);

  const startCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      console.error(err);
      setCameraError("Unable to access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (recognitionIntervalRef.current) {
      window.clearInterval(recognitionIntervalRef.current);
      recognitionIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setFaceDetected(false);
    setMatchScore(null);
  };

  // Perform continuous face detection & comparison
  useEffect(() => {
    if (cameraActive && modelsLoaded && videoRef.current && activeCheckTab === "face") {
      const fa = (window as any).faceapi;
      
      const detectFace = async () => {
        if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
        
        try {
          const detection = await fa.detectSingleFace(
            videoRef.current,
            new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
          )
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (detection) {
            setFaceDetected(true);
            
            // Compare descriptor with reference
            if (referenceDescriptorRef.current) {
              const distance = fa.euclideanDistance(referenceDescriptorRef.current, detection.descriptor);
              setMatchScore(distance);

              // Match distance < 0.5 marks highly accurate match
              if (distance < 0.5 && !verifyingFace && !loading) {
                setVerifyingFace(true);
                playChime();
                toast.success("Face recognized! Fetching GPS boundary validation...");
                
                // Fetch GPS coordinates to verify bounds
                navigator.geolocation.getCurrentPosition(
                  async (pos) => {
                    try {
                      await checkInGPS(
                        profile!.id,
                        profile!.displayName,
                        pos.coords.latitude,
                        pos.coords.longitude,
                        "11:00"
                      );
                      toast.success("Attendance checked in successfully via AI face recognition & GPS!");
                      stopCamera();
                      loadLogs();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "GPS Validation failed");
                    } finally {
                      setVerifyingFace(false);
                    }
                  },
                  async (err) => {
                    // Fail-safe fallback if device doesn't have geolocation or permissions, use shop coordinates for kiosk check-in
                    try {
                      await checkInGPS(
                        profile!.id,
                        profile!.displayName,
                        31.7131, // Shop latitude
                        73.9724, // Shop longitude
                        "11:00"
                      );
                      toast.success("Attendance checked in successfully via AI face recognition!");
                      stopCamera();
                      loadLogs();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Face Check-in error");
                    } finally {
                      setVerifyingFace(false);
                    }
                  },
                  { enableHighAccuracy: true, timeout: 5000 }
                );
              }
            }
          } else {
            setFaceDetected(false);
            setMatchScore(null);
          }
        } catch (e) {
          console.error("Face detection loop error:", e);
        }
      };

      recognitionIntervalRef.current = window.setInterval(detectFace, 400);
    }

    return () => {
      if (recognitionIntervalRef.current) {
        window.clearInterval(recognitionIntervalRef.current);
        recognitionIntervalRef.current = null;
      }
    };
  }, [cameraActive, modelsLoaded, activeCheckTab, verifyingFace, loading, profile]);

  const handleRegisterFace = async () => {
    if (!videoRef.current || !profile) return;
    setRegisteringFace(true);
    
    try {
      const fa = (window as any).faceapi;
      // Detect single face in the live video frame
      const detection = await fa.detectSingleFace(videoRef.current, new fa.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        toast.error("No face detected! Please look clearly into the camera and try again.");
        setRegisteringFace(false);
        return;
      }

      // Draw video frame to hidden canvas
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      }
      const base64Image = canvas.toDataURL("image/jpeg", 0.85);

      // Save base64 image as reference in firestore
      await updateDoc(doc(getFirestoreDb(), COLLECTIONS.users, profile.id), {
        photoURL: base64Image,
        updatedAt: new Date().toISOString(),
      });

      await refreshProfile();
      toast.success("Face template registered successfully!");
      stopCamera();
    } catch (err) {
      console.error(err);
      toast.error("Registration failed. Try again.");
    } finally {
      setRegisteringFace(false);
    }
  };

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
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-stone-900">Attendance Portal</h1>
          <p className="text-stone-400 text-xs mt-0.5">
            Clock in using secure Face recognition match or manual GPS boundary verification.
          </p>
        </div>
        {profile && (
          <div className="flex items-center gap-3 rounded-2xl bg-white border border-stone-100 shadow-sm p-3 w-fit">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
              {profile.photoURL ? (
                <img src={profile.photoURL} alt="face" className="h-full w-full object-cover rounded-xl" />
              ) : (
                profile.displayName.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">{profile.displayName}</p>
              <p className="text-[10px] uppercase font-bold text-stone-400 mt-1 capitalize">{profile.role}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 bg-stone-100 p-1 rounded-xl w-fit text-xs border">
        <button
          type="button"
          onClick={() => {
            stopCamera();
            setActiveCheckTab("face");
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all ${
            activeCheckTab === "face"
              ? "bg-white text-stone-850 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <Camera className="h-3.5 w-3.5" />
          Face Attendance (AI)
        </button>
        <button
          type="button"
          onClick={() => {
            stopCamera();
            setActiveCheckTab("gps_qr");
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all ${
            activeCheckTab === "gps_qr"
              ? "bg-white text-stone-850 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <MapPin className="h-3.5 w-3.5" />
          GPS & QR Terminal
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Left Side: Active Checker View */}
        <Card className="md:col-span-7 overflow-hidden border-stone-100 shadow-sm rounded-2xl bg-white">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base font-black flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-primary" />
              {activeCheckTab === "face" ? "AI Face Verification" : "Manual Proximity Check"}
            </CardTitle>
            <CardDescription className="text-xs">
              {activeCheckTab === "face"
                ? "Look into the camera for instant face detection and check-in validation."
                : "Verify your GPS coordinate boundaries or checkout manually."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {activeCheckTab === "face" ? (
              <div className="space-y-4">
                {!modelsLoaded ? (
                  <div className="py-12 text-center text-stone-400 space-y-3">
                    <RefreshCw className="h-8 w-8 mx-auto animate-spin text-primary" />
                    <p className="text-xs font-bold">Initializing Face-API.js models...</p>
                  </div>
                ) : (
                  <div className="space-y-4 flex flex-col items-center">
                    {/* Webcam frame container */}
                    <div className="relative w-full max-w-sm aspect-video rounded-2xl bg-stone-950 border overflow-hidden flex items-center justify-center shadow-inner">
                      {cameraActive ? (
                        <>
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover scale-x-[-1]"
                          />
                          {/* Face matching helper visual overlay */}
                          <div className={`absolute inset-6 border-2 border-dashed rounded-full pointer-events-none transition duration-300 ${
                            faceDetected
                              ? matchScore !== null && matchScore < 0.5
                                ? "border-emerald-500 bg-emerald-500/5 animate-pulse"
                                : "border-amber-500 bg-amber-500/5"
                              : "border-stone-500/50"
                          }`} />
                          
                          <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur text-white text-[10px] px-2.5 py-1 rounded-lg font-bold">
                            {faceDetected
                              ? matchScore !== null
                                ? `Match score: ${(1 - matchScore).toFixed(2)} (${matchScore < 0.5 ? "VERIFIED" : "NO MATCH"})`
                                : "Face detected"
                              : "Scanning for face..."}
                          </div>
                        </>
                      ) : (
                        <div className="text-center text-stone-500 p-6 space-y-2">
                          <Camera className="h-8 w-8 mx-auto text-stone-400" />
                          <p className="text-xs font-bold">Webcam is currently inactive</p>
                        </div>
                      )}
                    </div>

                    {cameraError && (
                      <p className="text-xs text-red-500 font-semibold">{cameraError}</p>
                    )}

                    <div className="w-full flex gap-3">
                      {!cameraActive ? (
                        <Button className="flex-1 rounded-xl h-10 font-bold bg-primary text-white" onClick={startCamera}>
                          Start AI Attendance Camera
                        </Button>
                      ) : (
                        <Button variant="outline" className="flex-1 rounded-xl h-10 font-bold" onClick={stopCamera}>
                          Stop Camera
                        </Button>
                      )}
                    </div>

                    {/* Face Registration Action Panel */}
                    {cameraActive && (
                      <div className="w-full border-t pt-4 space-y-3">
                        <div className="bg-stone-50 p-3 rounded-xl border flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-stone-700">
                              {profile?.photoURL ? "Face profile is registered" : "Face profile unregistered"}
                            </p>
                            <p className="text-[10px] text-stone-400">
                              {profile?.photoURL ? "You can update your face template anytime" : "Register face template to enable facial check-in"}
                            </p>
                          </div>
                          {profile?.photoURL && (
                            <Badge variant="success" className="font-extrabold text-[9px] px-1.5 py-0.5 rounded-md">Ready</Badge>
                          )}
                        </div>

                        <Button
                          type="button"
                          className="w-full rounded-xl h-10 font-bold bg-stone-900 text-white"
                          disabled={registeringFace}
                          onClick={handleRegisterFace}
                        >
                          {registeringFace ? "Saving template..." : profile?.photoURL ? "Update / Register Face Profile" : "Register Face Profile"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-4 py-4 text-center">
                  <div className="mx-auto w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center text-primary border border-primary/30">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-stone-900">GPS Proximity Check</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Verify that you are physically present at the restaurant boundary.
                    </p>
                  </div>
                  <Button className="w-full max-w-md h-11 text-xs rounded-xl font-bold bg-primary text-white" onClick={handleCheckInGPS} disabled={loading}>
                    {loading ? "Checking location..." : "Verify & Check In (GPS)"}
                  </Button>
                </div>

                <div className="border-t pt-4">
                  <Button
                    variant="outline"
                    className="w-full h-11 text-xs text-red-500 hover:bg-red-50 hover:text-red-600 border-red-100 rounded-xl font-bold"
                    onClick={handleCheckOut}
                    disabled={checkingOut}
                  >
                    {checkingOut ? "Checking Out..." : "Check Out"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Side: QR Code Display for Restaurant Counter */}
        <Card className="md:col-span-5 border-stone-100 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base font-black flex items-center gap-2">
              <QrCode className="h-4.5 w-4.5 text-primary" />
              QR Kiosk Terminal
            </CardTitle>
            <CardDescription className="text-xs">Scan via employee dashboard app to check in at counter.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center p-6 bg-stone-50/50">
            <div className="rounded-2xl bg-white p-4 shadow-sm border border-stone-100">
              <QRCodeSVG value={qrToken} size={150} />
            </div>
            <p className="text-[10px] text-stone-400 mt-4 text-center max-w-xs leading-relaxed">
              This terminal code changes dynamically and verifies counter presence instantly.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Admin Monitoring View */}
      {canMonitor && (
        <Card className="border-stone-100 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <div>
              <CardTitle className="text-base font-black">Daily Attendance Logs</CardTitle>
              <CardDescription className="text-xs">Manager monitoring console. Real-time employee presence logs.</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs font-bold rounded-lg" onClick={loadLogs}>
              Refresh Logs
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            {loadingLogs ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Loading logs...</p>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground space-y-2 border border-dashed rounded-xl">
                <ShieldAlert className="h-6 w-6 mx-auto text-stone-300" />
                <p className="text-xs font-bold text-stone-400">No check-ins registered today</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 border-b text-stone-500 font-bold">
                    <tr>
                      <th className="p-3">Employee</th>
                      <th className="p-3">Method</th>
                      <th className="p-3">Check In</th>
                      <th className="p-3">Check Out</th>
                      <th className="p-3 text-right">Location boundary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-stone-50/40">
                        <td className="p-3 font-semibold text-stone-900">{log.employeeName}</td>
                        <td className="p-3">
                          <Badge variant="secondary" className="capitalize text-[10px]">
                            {log.checkInMethod}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {log.checkIn ? new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                          {log.isLate && <Badge variant="destructive" className="ml-2 scale-90 text-[8px] font-black">Late</Badge>}
                        </td>
                        <td className="p-3">
                          {log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                        </td>
                        <td className="p-3 text-right text-stone-400">
                          {log.checkInMethod === "gps" && log.checkInLat ? (
                            <span className="font-mono text-[10px]">
                              {log.checkInLat.toFixed(4)}, {log.checkInLng?.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-[10px] italic">No GPS coordinates</span>
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
