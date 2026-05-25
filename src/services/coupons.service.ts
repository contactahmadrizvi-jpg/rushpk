import { COLLECTIONS } from "@/constants";
import type { Coupon } from "@/types";
import { BaseRepository, where } from "./base.repository";

const couponsRepo = new BaseRepository<Coupon>(COLLECTIONS.coupons);

export async function validateCoupon(
  code: string,
  subtotal: number
): Promise<{ valid: boolean; discount: number; coupon?: Coupon; message?: string }> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return { valid: false, discount: 0, message: "Enter a coupon code" };
  }

  const coupons = await couponsRepo.getAll([
    where("code", "==", normalized),
    where("isActive", "==", true),
  ]);

  const coupon = coupons[0];
  if (!coupon) {
    return { valid: false, discount: 0, message: "Invalid coupon code" };
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { valid: false, discount: 0, message: "Coupon has expired" };
  }

  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, discount: 0, message: "Coupon usage limit reached" };
  }

  if (subtotal < coupon.minOrder) {
    return {
      valid: false,
      discount: 0,
      message: `Minimum order ${coupon.minOrder} PKR required`,
    };
  }

  const discount =
    coupon.type === "percentage"
      ? Math.round((subtotal * coupon.value) / 100)
      : Math.min(coupon.value, subtotal);

  return { valid: true, discount, coupon };
}

export { couponsRepo };
