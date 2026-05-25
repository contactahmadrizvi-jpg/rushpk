"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import type { MenuItem, CartItemCustomization } from "@/types";

interface Props {
  item: MenuItem;
  open: boolean;
  onClose: () => void;
  onAdd: (qty: number, custom: CartItemCustomization) => void;
}

export function ItemCustomizeDialog({ item, open, onClose, onAdd }: Props) {
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState<string>();
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [extraCheese, setExtraCheese] = useState(false);
  const [spiceLevel, setSpiceLevel] = useState<string>();
  const [notes, setNotes] = useState("");

  if (!open) return null;

  let price = item.price;
  if (variantId && item.variants) {
    const v = item.variants.find((x) => x.id === variantId);
    if (v) price += v.priceModifier;
  }
  if (item.addons) {
    for (const id of addonIds) {
      const a = item.addons.find((x) => x.id === id);
      if (a) price += a.price;
    }
  }
  if (extraCheese && item.extraCheesePrice) price += item.extraCheesePrice;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold">{item.name}</h2>
        <p className="text-sm text-muted-foreground">{item.description}</p>

        {item.variants && item.variants.length > 0 && (
          <div className="mt-4">
            <Label>Size / Variant</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.variants.map((v) => (
                <button key={v.id} type="button" onClick={() => setVariantId(v.id)} className={`rounded-lg border px-3 py-2 text-sm ${variantId === v.id ? "border-primary bg-primary/10" : ""}`}>
                  {v.name} {v.priceModifier > 0 ? `+${formatCurrency(v.priceModifier)}` : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        {item.addons && item.addons.length > 0 && (
          <div className="mt-4">
            <Label>Add-ons</Label>
            <div className="mt-2 space-y-2">
              {item.addons.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={addonIds.includes(a.id)} onChange={(e) => setAddonIds(e.target.checked ? [...addonIds, a.id] : addonIds.filter((x) => x !== a.id))} />
                  {a.name} (+{formatCurrency(a.price)})
                </label>
              ))}
            </div>
          </div>
        )}

        {item.hasExtraCheese && (
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={extraCheese} onChange={(e) => setExtraCheese(e.target.checked)} />
            Extra Cheese (+{formatCurrency(item.extraCheesePrice ?? 50)})
          </label>
        )}

        {item.spiceLevels && item.spiceLevels.length > 0 && (
          <div className="mt-4">
            <Label>Spice Level</Label>
            <div className="mt-2 flex gap-2">
              {item.spiceLevels.map((s) => (
                <button key={s} type="button" onClick={() => setSpiceLevel(s)} className={`rounded-lg border px-3 py-1 text-sm ${spiceLevel === s ? "border-primary" : ""}`}>{s}</button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-4">
          <Label>Qty</Label>
          <Button variant="outline" size="icon" onClick={() => setQty(Math.max(1, qty - 1))}>-</Button>
          <span className="font-bold">{qty}</span>
          <Button variant="outline" size="icon" onClick={() => setQty(qty + 1)}>+</Button>
        </div>

        <div className="mt-6 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={() => onAdd(qty, {
            variantId,
            variantName: item.variants?.find((v) => v.id === variantId)?.name,
            addonIds,
            addonNames: item.addons?.filter((a) => addonIds.includes(a.id)).map((a) => a.name),
            extraCheese,
            spiceLevel,
            notes: notes || undefined,
          })}>
            Add {formatCurrency(price * qty)}
          </Button>
        </div>
      </div>
    </div>
  );
}
