"use client";

import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCartStore } from "@/stores/cart-store";
import { formatCurrency } from "@/lib/utils";

export default function CartPage() {
  const { items, updateQuantity, removeItem, getSubtotal } = useCartStore();
  const subtotal = getSubtotal();

  if (!items.length) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-lg text-muted-foreground">Your cart is empty</p>
        <Link href="/menu"><Button className="mt-4">Browse Menu</Button></Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Your Cart</h1>
      <div className="mt-6 space-y-4">
        {items.map((line) => (
          <Card key={line.id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-semibold">{line.menuItem.name}</p>
                <p className="text-sm text-muted-foreground">{formatCurrency(line.unitPrice)} each</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => updateQuantity(line.id, Math.max(1, line.quantity - 1))}><Minus className="h-4 w-4" /></Button>
                <span className="w-8 text-center font-bold">{line.quantity}</span>
                <Button variant="outline" size="icon" onClick={() => updateQuantity(line.id, line.quantity + 1)}><Plus className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => removeItem(line.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
              <p className="font-bold">{formatCurrency(line.subtotal)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-8 flex items-center justify-between rounded-2xl border bg-card p-6">
        <span className="text-lg font-bold">Subtotal</span>
        <span className="text-xl font-bold text-primary">{formatCurrency(subtotal)}</span>
      </div>
      <Link href="/checkout" className="mt-4 block">
        <Button size="lg" className="w-full">Proceed to Checkout</Button>
      </Link>
    </div>
  );
}
