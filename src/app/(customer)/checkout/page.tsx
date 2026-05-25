"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCartStore } from "@/stores/cart-store";
import { useAuthStore } from "@/stores/auth-store";
import { createOrder } from "@/services/orders.service";
import { addTrackedOrder } from "@/lib/order-tracking";
import { validateCoupon } from "@/services/coupons.service";
import { getSettings, getDefaultSettings } from "@/services/settings.service";
import { formatCurrency } from "@/lib/utils";
import type { OrderItem } from "@/types";

const schema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  street: z.string().min(3),
  area: z.string().min(2),
  city: z.string().default("Sheikhupura"),
  notes: z.string().optional(),
  paymentMethod: z.enum(["cash", "online"]),
});

type FormData = z.infer<typeof schema>;

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getSubtotal, couponCode, couponDiscount, setCoupon, clearCart } = useCartStore();
  const profile = useAuthStore((s) => s.profile);
  const [couponInput, setCouponInput] = useState("");
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: profile?.displayName ?? "",
      phone: profile?.phone ?? "",
      city: "Sheikhupura",
      paymentMethod: "cash",
    },
  });

  const subtotal = getSubtotal();
  const taxRate = 0;
  const deliveryCharge = subtotal > 0 ? 150 : 0;
  const tax = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + tax + deliveryCharge - couponDiscount;

  async function applyCoupon() {
    const result = await validateCoupon(couponInput, subtotal);
    if (result.valid && result.coupon) {
      setCoupon(result.coupon.code, result.discount);
      toast.success("Coupon applied!");
    } else {
      toast.error(result.message ?? "Invalid coupon");
    }
  }

  async function onSubmit(data: FormData) {
    if (!items.length) return;
    setLoading(true);
    try {
      const settings = (await getSettings()) ?? getDefaultSettings();
      const orderItems: OrderItem[] = items.map((line, i) => ({
        id: `item-${i}`,
        menuItemId: line.menuItem.id,
        name: line.menuItem.name,
        price: line.unitPrice,
        quantity: line.quantity,
        customization: line.customization,
        subtotal: line.subtotal,
      }));

      const order = await createOrder({
        customerName: data.name,
        customerPhone: data.phone,
        userId: profile?.id,
        type: "online",
        items: orderItems,
        subtotal,
        tax,
        deliveryCharge: settings.deliveryCharge ?? deliveryCharge,
        discount: couponDiscount,
        couponCode,
        total,
        paymentMethod: data.paymentMethod,
        deliveryAddress: {
          id: "addr-1",
          label: "Delivery",
          street: data.street,
          area: data.area,
          city: data.city,
          phone: data.phone,
        },
        deliveryNotes: data.notes,
        source: "website",
      });

      addTrackedOrder(order.id);
      clearCart();
      toast.success("Order placed!");
      router.push(`/track/${order.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Order failed");
    } finally {
      setLoading(false);
    }
  }

  if (!items.length) {
    return <div className="p-8 text-center">Cart is empty</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Checkout</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div><Label>Name</Label><Input {...register("name")} /></div>
        <div><Label>Phone</Label><Input {...register("phone")} /></div>
        <div><Label>Street Address</Label><Input {...register("street")} /></div>
        <div><Label>Area</Label><Input {...register("area")} /></div>
        <div><Label>Delivery Notes</Label><Textarea {...register("notes")} /></div>
        <div className="flex gap-2">
          <Input placeholder="Coupon code" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} />
          <Button type="button" variant="outline" onClick={applyCoupon}>Apply</Button>
        </div>
        <div className="space-y-2 rounded-xl border p-4">
          <label className="flex items-center gap-2"><input type="radio" value="cash" {...register("paymentMethod")} /> Cash on Delivery</label>
          <label className="flex items-center gap-2"><input type="radio" value="online" {...register("paymentMethod")} /> Card / Online</label>
        </div>
        <div className="rounded-xl border p-4 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          {couponDiscount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>-{formatCurrency(couponDiscount)}</span></div>}
          <div className="flex justify-between"><span>Delivery</span><span>{formatCurrency(deliveryCharge)}</span></div>
          <div className="mt-2 flex justify-between text-lg font-bold"><span>Total</span><span className="text-primary">{formatCurrency(total)}</span></div>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? "Placing..." : `Place Order — ${formatCurrency(total)}`}</Button>
      </form>
    </div>
  );
}
