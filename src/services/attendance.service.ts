import { COLLECTIONS } from "@/constants";
import { calculateDistanceMeters } from "@/lib/utils";
import type { AttendanceRecord } from "@/types";
import { BaseRepository, query, where, orderBy } from "./base.repository";

const attendanceRepo = new BaseRepository<AttendanceRecord>(COLLECTIONS.attendance);

const RESTAURANT_LAT = parseFloat(
  process.env.NEXT_PUBLIC_RESTAURANT_LAT ?? "31.7131"
);
const RESTAURANT_LNG = parseFloat(
  process.env.NEXT_PUBLIC_RESTAURANT_LNG ?? "73.9724"
);
const RADIUS = parseFloat(
  process.env.NEXT_PUBLIC_ATTENDANCE_RADIUS_METERS ?? "100"
);

export function verifyGPSLocation(lat: number, lng: number): boolean {
  const distance = calculateDistanceMeters(
    RESTAURANT_LAT,
    RESTAURANT_LNG,
    lat,
    lng
  );
  return distance <= RADIUS;
}

export async function checkInGPS(
  employeeId: string,
  employeeName: string,
  lat: number,
  lng: number,
  shiftStart: string
): Promise<string> {
  if (!verifyGPSLocation(lat, lng)) {
    throw new Error(
      `You must be within ${RADIUS}m of the restaurant to check in.`
    );
  }

  const today = new Date().toISOString().split("T")[0]!;
  const now = new Date().toISOString();
  const isLate = new Date(now) > new Date(`${today}T${shiftStart}`);

  const existing = await attendanceRepo.getAll([
    where("employeeId", "==", employeeId),
    where("date", "==", today),
  ]);

  if (existing.length && existing[0]?.checkIn) {
    throw new Error("Already checked in today");
  }

  if (existing.length) {
    await attendanceRepo.update(existing[0]!.id, {
      checkIn: now,
      checkInMethod: "gps",
      checkInLat: lat,
      checkInLng: lng,
      isLate,
    } as Partial<AttendanceRecord>);
    return existing[0]!.id;
  }

  return attendanceRepo.create({
    employeeId,
    employeeName,
    date: today,
    checkIn: now,
    checkInMethod: "gps",
    checkInLat: lat,
    checkInLng: lng,
    isLate,
  } as Omit<AttendanceRecord, "id">);
}

export async function checkInQR(
  employeeId: string,
  employeeName: string,
  token: string,
  shiftStart: string
): Promise<string> {
  const expected = process.env.ATTENDANCE_QR_SECRET ?? "rush-pizza-sheikhupura-2024";
  if (token !== expected) {
    throw new Error("Invalid QR code. Scan the official restaurant QR.");
  }

  const today = new Date().toISOString().split("T")[0]!;
  const now = new Date().toISOString();
  const isLate = new Date(now) > new Date(`${today}T${shiftStart}`);

  const existing = await attendanceRepo.getAll([
    where("employeeId", "==", employeeId),
    where("date", "==", today),
  ]);

  if (existing.length && existing[0]?.checkIn) {
    throw new Error("Already checked in today");
  }

  return attendanceRepo.create({
    employeeId,
    employeeName,
    date: today,
    checkIn: now,
    checkInMethod: "qr",
    isLate,
  } as Omit<AttendanceRecord, "id">);
}

export async function checkOut(employeeId: string): Promise<void> {
  const today = new Date().toISOString().split("T")[0]!;
  const records = await attendanceRepo.getAll([
    where("employeeId", "==", employeeId),
    where("date", "==", today),
  ]);

  const record = records[0];
  if (!record?.checkIn) throw new Error("No check-in found for today");
  if (record.checkOut) throw new Error("Already checked out");

  const now = new Date().toISOString();
  const workingMinutes =
    (new Date(now).getTime() - new Date(record.checkIn).getTime()) / 60000;

  await attendanceRepo.update(record.id, {
    checkOut: now,
    workingMinutes: Math.floor(workingMinutes),
  } as Partial<AttendanceRecord>);
}

export async function getAttendanceByDateRange(
  startDate: string,
  endDate: string
): Promise<AttendanceRecord[]> {
  return attendanceRepo.getAll([
    where("date", ">=", startDate),
    where("date", "<=", endDate),
    orderBy("date", "desc"),
  ]);
}

export { attendanceRepo };
