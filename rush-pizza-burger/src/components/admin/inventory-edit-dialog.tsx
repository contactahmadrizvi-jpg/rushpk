"use client";

import { useState, useEffect } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InventoryItem, InventoryUnit } from "@/types";

const UNITS: InventoryUnit[] = ["kg", "gram", "liter", "piece", "slice", "bottle", "pack"];

interface Props {
  item: InventoryItem;
  onSave: (data: Partial<InventoryItem>) => Promise<void>;
}

export function InventoryEditDialog({ item, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    currentStock: String(item.currentStock),
    minStock: String(item.minStock),
    costPerUnit: String(item.costPerUnit),
    preventSellWhenLow: item.preventSellWhenLow,
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        currentStock: String(item.currentStock),
        minStock: String(item.minStock),
        costPerUnit: String(item.costPerUnit),
        preventSellWhenLow: item.preventSellWhenLow,
      });
    }
  }, [open, item]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        name: form.name,
        sku: form.sku,
        unit: form.unit as InventoryUnit,
        currentStock: Number(form.currentStock),
        minStock: Number(form.minStock),
        costPerUnit: Number(form.costPerUnit),
        preventSellWhenLow: form.preventSellWhenLow,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="mr-1 h-3 w-3" /> Edit
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold">Edit inventory</h3>
        <p className="text-sm text-muted-foreground">{item.name}</p>
        <div className="mt-4 grid gap-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>SKU</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div>
            <Label>Unit</Label>
            <select
              className="flex h-11 w-full rounded-xl border px-3 text-sm"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value as InventoryUnit })}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Current stock</Label>
              <Input type="number" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} />
            </div>
            <div>
              <Label>Min stock</Label>
              <Input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Cost per unit (PKR)</Label>
            <Input type="number" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.preventSellWhenLow}
              onChange={(e) => setForm({ ...form, preventSellWhenLow: e.target.checked })}
            />
            Block sales when stock is low
          </label>
        </div>
        <div className="mt-6 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
