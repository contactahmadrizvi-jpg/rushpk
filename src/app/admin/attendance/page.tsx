"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { CheckCircle2, ShieldAlert, Sparkles, Camera, RefreshCw, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";
import { checkInGPS, checkOut, attendanceRepo } from "@/services/attendance.service";
import type { AttendanceRecord, AppUser } from "@/types";
import { isSuperAdmin, userHasPermission } from "@/lib/permissions";
import { where } from "@/services/base.repository";
import { doc, updateDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/config";
import { COLLECTIONS } from "@/constants";
import { listStaffUsers } from "@/services/users.service";

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
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Face Kiosk states
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  
  // Multi-employee profiles states
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [profileLoadingProgress, setProfileLoadingProgress] = useState("");
  const [faceMatcher, setFaceMatcher] = useState<any>(null);

  // Status & Match outputs
  const [faceDetected, setFaceDetected] = useState(false);
  const [activeMatchName, setActiveMatchName] = useState("");
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  // Enrollment Modal states
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [registeringFace, setRegisteringFace] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const enrollVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const enrollStreamRef = useRef<MediaStream | null>(null);
  const recognitionIntervalRef = useRef<number | null>(null);
  
  // Cooldown mapping to prevent multi-submissions
  const checkedInTodaySet = useRef<Set<string>>(new Set());

  const today = new Date().toISOString().split("T")[0]!;

  const canMonitor =
    isSuperAdmin(profile) ||
    userHasPermission(profile, "dashboard") ||
    userHasPermission(profile, "employees") ||
    profile?.role === "manager" ||
    profile?.role === "admin";

  const loadLogs = async () => {
    setLoadingLogs(true);
    try {
      const records = await attendanceRepo.getAll([
        where("date", "==", today),
      ]);
      setLogs(records);
      
      // Populate checked-in users to prevent duplicate submissions
      const checkedIds = new Set(records.map(r => r.employeeId));
      checkedInTodaySet.current = checkedIds;
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [profile]);

  // Load face-api.js from CDN dynamically to avoid Next.js build errors
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
        if (active) {
          setModelsLoaded(true);
          loadStaffAndDescriptors();
        }
      } catch (err) {
        console.error("Failed to load face-api models:", err);
      }
    };

    loadModels();
    return () => {
      active = false;
    };
  }, [faceApiLoaded]);

  const loadStaffAndDescriptors = async () => {
    setLoadingProfiles(true);
    setProfileLoadingProgress("Loading employee profiles...");
    try {
      const staff = await listStaffUsers();
      setStaffList(staff);
      
      const fa = (window as any).faceapi;
      const labeledDescriptors: any[] = [];
      
      const staffWithPhotos = staff.filter(s => s.photoURL);
      let count = 0;
      
      for (const emp of staffWithPhotos) {
        setProfileLoadingProgress(`Loading face profile: ${emp.displayName} (${++count}/${staffWithPhotos.length})`);
        try {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const tempImg = new Image();
            tempImg.crossOrigin = "anonymous";
            tempImg.src = emp.photoURL!;
            tempImg.onload = () => resolve(tempImg);
            tempImg.onerror = (e) => reject(e);
          });
          
          const detection = await fa.detectSingleFace(img, new fa.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();
            
          if (detection) {
            labeledDescriptors.push(
              new fa.LabeledFaceDescriptors(emp.id, [detection.descriptor])
            );
          }
        } catch (err) {
          console.warn(`Could not extract descriptor for ${emp.displayName}:`, err);
        }
      }
      
      if (labeledDescriptors.length > 0) {
        const matcher = new fa.FaceMatcher(labeledDescriptors, 0.5);
        setFaceMatcher(matcher);
        console.log("Face matcher loaded successfully with", labeledDescriptors.length, "profiles.");
      }
    } catch (e) {
      console.error("Error loading staff descriptors:", e);
    } finally {
      setLoadingProfiles(false);
    }
  };

  const startCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      setCameraActive(true);

      const bind = () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        } else {
          setTimeout(bind, 50);
        }
      };
      bind();
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
    setActiveMatchName("");
  };

  // Live face detection & multi-employee matching kiosk loop
  useEffect(() => {
    if (cameraActive && modelsLoaded && videoRef.current && faceMatcher && !enrollModalOpen) {
      const fa = (window as any).faceapi;
      
      const detectFaceKiosk = async () => {
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
            const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
            
            if (bestMatch.label !== "unknown") {
              const empId = bestMatch.label;
              const matchedEmp = staffList.find(s => s.id === empId);
              
              if (matchedEmp) {
                setActiveMatchName(matchedEmp.displayName);
                
                // Trigger check-in if not checked in already today and not currently submitting
                if (!checkedInTodaySet.current.has(empId) && checkingInId !== empId) {
                  setCheckingInId(empId);
                  playChime();
                  toast.info(`Match found: ${matchedEmp.displayName}. Clocking in...`);
                  
                  // Submit attendance automatically with restaurant kiosk coordinates
                  try {
                    await checkInGPS(
                      matchedEmp.id,
                      matchedEmp.displayName,
                      31.7131, // Store default latitude
                      73.9724, // Store default longitude
                      "11:00"
                    );
                    toast.success(`Success! ${matchedEmp.displayName} checked in.`);
                    await loadLogs();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Check-in failed");
                  } finally {
                    setCheckingInId(null);
                  }
                }
              }
            } else {
              setActiveMatchName("Unknown Face");
            }
          } else {
            setFaceDetected(false);
            setActiveMatchName("");
          }
        } catch (e) {
          console.error("Kiosk loop error:", e);
        }
      };

      recognitionIntervalRef.current = window.setInterval(detectFaceKiosk, 400);
    }

    return () => {
      if (recognitionIntervalRef.current) {
        window.clearInterval(recognitionIntervalRef.current);
        recognitionIntervalRef.current = null;
      }
    };
  }, [cameraActive, modelsLoaded, faceMatcher, staffList, checkingInId, enrollModalOpen]);

  const startEnrollCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      enrollStreamRef.current = stream;

      const bind = () => {
        if (enrollVideoRef.current) {
          enrollVideoRef.current.srcObject = stream;
        } else {
          setTimeout(bind, 50);
        }
      };
      bind();
    } catch (err) {
      toast.error("Unable to access webcam for enrollment.");
    }
  };

  const stopEnrollCamera = () => {
    if (enrollStreamRef.current) {
      enrollStreamRef.current.getTracks().forEach((track) => track.stop());
      enrollStreamRef.current = null;
    }
  };

  const handleRegisterFace = async () => {
    if (!enrollVideoRef.current || !profile) return;
    setRegisteringFace(true);
    
    try {
      const fa = (window as any).faceapi;
      const detection = await fa.detectSingleFace(enrollVideoRef.current, new fa.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        toast.error("No face detected! Please position yourself clearly and try again.");
        setRegisteringFace(false);
        return;
      }

      // Draw frame to canvas
      const canvas = document.createElement("canvas");
      canvas.width = enrollVideoRef.current.videoWidth;
      canvas.height = enrollVideoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(enrollVideoRef.current, 0, 0, canvas.width, canvas.height);
      }
      const base64Image = canvas.toDataURL("image/jpeg", 0.85);

      await updateDoc(doc(getFirestoreDb(), COLLECTIONS.users, profile.id), {
        photoURL: base64Image,
        updatedAt: new Date().toISOString(),
      });

      await refreshProfile();
      toast.success("Face template enrolled successfully!");
      setEnrollModalOpen(false);
      stopEnrollCamera();
      
      // Reload descriptors list to include the newly added face
      loadStaffAndDescriptors();
    } catch (err) {
      console.error(err);
      toast.error("Enrollment failed. Try again.");
    } finally {
      setRegisteringFace(false);
    }
  };

  const handleManualCheckOut = async () => {
    if (!profile) return;
    setCheckingInId("checkout");
    try {
      await checkOut(profile.id);
      toast.success("Checked out successfully!");
      loadLogs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-out failed");
    } finally {
      setCheckingInId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-stone-900">Facial Attendance System</h1>
          <p className="text-stone-400 text-xs mt-0.5">
            Automatic kiosk detection: Stand in front of the camera to verify your identity and clock in.
          </p>
        </div>
        <div className="flex gap-2">
          {profile && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs font-bold rounded-xl border-stone-200"
              onClick={() => {
                stopCamera();
                setEnrollModalOpen(true);
                startEnrollCamera();
              }}
            >
              Enroll Face Profile
            </Button>
          )}
          {profile && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs font-bold text-red-500 hover:bg-red-50 hover:text-red-600 border-red-100 rounded-xl"
              onClick={handleManualCheckOut}
            >
              Check Out
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Face Recognition Terminal */}
        <Card className="md:col-span-12 overflow-hidden border-stone-100 shadow-sm rounded-2xl bg-white">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base font-black flex items-center gap-2">
              <Camera className="h-4.5 w-4.5 text-primary" />
              AI Attendance Kiosk
            </CardTitle>
            <CardDescription className="text-xs">
              System identifies employees automatically from preloaded face profiles.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {!modelsLoaded || loadingProfiles ? (
              <div className="py-16 text-center text-stone-400 space-y-3">
                <RefreshCw className="h-8 w-8 mx-auto animate-spin text-primary" />
                <p className="text-xs font-bold text-stone-700">{profileLoadingProgress || "Loading face matching models..."}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-4">
                <div className="relative w-full max-w-lg aspect-video rounded-3xl bg-stone-950 border overflow-hidden flex items-center justify-center shadow-inner">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover scale-x-[-1] ${cameraActive ? "block" : "hidden"}`}
                  />
                  {cameraActive ? (
                    <>
                      {/* Interactive Target Circle overlay */}
                      <div className={`absolute inset-10 border-4 border-dashed rounded-full pointer-events-none transition duration-300 ${
                        faceDetected
                          ? activeMatchName && activeMatchName !== "Unknown Face"
                            ? "border-emerald-500 bg-emerald-500/5 animate-pulse"
                            : "border-amber-500 bg-amber-500/5"
                          : "border-stone-500/40"
                      }`} />

                      <div className="absolute top-4 right-4 bg-black/60 backdrop-blur text-white text-[10px] px-3 py-1.5 rounded-full font-black uppercase tracking-wider">
                        Kiosk Active
                      </div>

                      <div className="absolute bottom-4 left-4 bg-black/75 backdrop-blur text-white text-xs px-4 py-2 rounded-xl font-bold border border-white/10">
                        {faceDetected
                          ? activeMatchName === "Unknown Face"
                            ? "Face Detected (Unknown)"
                            : `Recognized: ${activeMatchName}`
                          : "Position your face inside the target area"}
                      </div>
                    </>
                  ) : (
                    <div className="text-center text-stone-500 p-8 space-y-3">
                      <Camera className="h-10 w-10 mx-auto text-stone-300" />
                      <p className="text-sm font-bold text-stone-400">Kiosk camera is currently offline</p>
                    </div>
                  )}
                </div>

                {cameraError && (
                  <p className="text-xs text-red-500 font-semibold">{cameraError}</p>
                )}

                <div className="w-full max-w-lg flex gap-3">
                  {!cameraActive ? (
                    <Button className="flex-1 rounded-xl h-11 text-xs font-black uppercase tracking-wider bg-primary text-white shadow shadow-primary/20" onClick={startCamera}>
                      Activate Attendance Kiosk
                    </Button>
                  ) : (
                    <Button variant="outline" className="flex-1 rounded-xl h-11 text-xs font-bold" onClick={stopCamera}>
                      Deactivate Kiosk
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Attendance Logs */}
      <Card className="border-stone-100 shadow-sm rounded-2xl bg-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <div>
            <CardTitle className="text-base font-black">Today's Attendance Logs</CardTitle>
            <CardDescription className="text-xs">Real-time kiosk check-ins for {today}.</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs font-bold rounded-lg border-stone-200" onClick={loadLogs}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {loadingLogs ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Loading logs...</p>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground space-y-2 border border-dashed rounded-xl">
              <ShieldAlert className="h-6 w-6 mx-auto text-stone-300" />
              <p className="text-xs font-bold text-stone-400">No logs captured today</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-xs text-left">
                <thead className="bg-stone-50 border-b text-stone-500 font-bold">
                  <tr>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Method</th>
                    <th className="p-3">Check In Time</th>
                    <th className="p-3">Check Out Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-stone-50/40">
                      <td className="p-3 font-semibold text-stone-900">{log.employeeName}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className="capitalize text-[10px] px-2 py-0.5 rounded-md font-bold">
                          {log.checkInMethod} Check-in
                        </Badge>
                      </td>
                      <td className="p-3 font-bold text-stone-700">
                        {log.checkIn ? new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                        {log.isLate && <Badge variant="destructive" className="ml-2 scale-90 text-[8px] font-black">Late</Badge>}
                      </td>
                      <td className="p-3 text-stone-500">
                        {log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enrollment Dialog Modal */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-all duration-200 ${enrollModalOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
        <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4 transform transition-all duration-200">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-black text-sm text-stone-900">Enroll Face Profile</h3>
            <button
              onClick={() => {
                setEnrollModalOpen(false);
                stopEnrollCamera();
              }}
              className="text-xs font-bold text-stone-400 hover:text-stone-600"
            >
              Close
            </button>
          </div>
          
          <div className="relative aspect-video bg-stone-950 rounded-xl overflow-hidden border">
            <video
              ref={enrollVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          </div>
          
          <p className="text-[10px] text-stone-400 text-center leading-relaxed">
            Ensure you are in well-lit conditions, face the camera directly, and avoid wearing caps or sunglasses.
          </p>

          <Button
            className="w-full rounded-xl h-10 font-bold bg-primary text-white"
            disabled={registeringFace}
            onClick={handleRegisterFace}
          >
            {registeringFace ? "Processing snapshot..." : "Capture & Enroll Profile"}
          </Button>
        </div>
      </div>
    </div>
  );
}
