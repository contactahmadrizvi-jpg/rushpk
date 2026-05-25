"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InventoryItem, RecipeIngredient } from "@/types";

export interface DraftIngredient {
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  unit: RecipeIngredient["unit"];
}

interface Props {
  inventory: InventoryItem[];
  value: DraftIngredient[];
  onChange: (items: DraftIngredient[]) => void;
}

export function RecipeIngredientPicker({ inventory, value, onChange }: Props) {
  function addRow() {
    const first = inventory[0];
    if (!first) return;
    onChange([
      ...value,
      {
        inventoryItemId: first.id,
        inventoryItemName: first.name,
        quantity: 1,
        unit: first.unit,
      },
    ]);
  }

  function updateRow(index: number, patch: Partial<DraftIngredient>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function selectInventory(index: number, id: string) {
    const item = inventory.find((x) => x.id === id);
    if (!item) return;
    updateRow(index, {
      inventoryItemId: id,
      inventoryItemName: item.name,
      unit: item.unit,
    });
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Recipe ingredients (inventory)</Label>
        <Button type="button" size="sm" variant="outline" onClick={addRow} disabled={!inventory.length}>
          <Plus className="mr-1 h-4 w-4" /> Add ingredient
        </Button>
      </div>
      {!inventory.length && (
        <p className="text-sm text-muted-foreground">Add inventory items first in Inventory page.</p>
      )}
      {value.map((row, index) => (
        <div key={index} className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_100px_80px_auto]">
          <select
            className="h-10 rounded-lg border px-2 text-sm"
            value={row.inventoryItemId}
            onChange={(e) => selectInventory(index, e.target.value)}
          >
            {inventory.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.name} ({inv.currentStock} {inv.unit})
              </option>
            ))}
          </select>
          <Input
            type="number"
            min={0}
            step="any"
            placeholder="Qty"
            value={row.quantity}
            onChange={(e) => updateRow(index, { quantity: Number(e.target.value) })}
          />
          <span className="flex h-10 items-center text-sm text-muted-foreground">{row.unit}</span>
          <Button type="button" size="icon" variant="ghost" onClick={() => onChange(value.filter((_, i) => i !== index))}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
    </div>
  );
}
