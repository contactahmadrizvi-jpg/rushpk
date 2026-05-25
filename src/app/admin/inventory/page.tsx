"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InventoryEditDialog } from "@/components/admin/inventory-edit-dialog";
import { getInventoryItems, inventoryRepo, recipeRepo, adjustStock } from "@/services/inventory.service";
import { useAuthStore } from "@/stores/auth-store";
import type { InventoryItem, Recipe, InventoryUnit } from "@/types";

export default function AdminInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const profile = useAuthStore((s) => s.profile);
  const [newItem, setNewItem] = useState({
    name: "",
    unit: "piece" as InventoryUnit,
    minStock: "10",
    stock: "0",
  });

  const load = () => {
    getInventoryItems().then(setItems);
    recipeRepo.getAll().then(setRecipes);
  };

  useEffect(() => {
    load();
  }, []);

  async function addInventory() {
    if (!newItem.name) return;
    const now = new Date().toISOString();
    await inventoryRepo.create({
      name: newItem.name,
      sku: newItem.name.replace(/\s+/g, "-").toUpperCase(),
      unit: newItem.unit,
      currentStock: Number(newItem.stock) || 0,
      minStock: Number(newItem.minStock),
      costPerUnit: 0,
      isActive: true,
      preventSellWhenLow: false,
      createdAt: now,
      updatedAt: now,
    } as Omit<InventoryItem, "id">);
    toast.success("Added");
    setNewItem({ name: "", unit: "piece", minStock: "10", stock: "0" });
    load();
  }

  async function saveEdit(id: string, data: Partial<InventoryItem>) {
    await inventoryRepo.update(id, data);
    toast.success("Inventory updated");
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Inventory</h1>
      <p className="text-muted-foreground">Edit stock, units & limits. Auto-deducts on orders.</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Add raw material</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Name"
            className="max-w-xs"
            value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
          />
          <select
            className="h-11 rounded-xl border px-3 text-sm"
            value={newItem.unit}
            onChange={(e) => setNewItem({ ...newItem, unit: e.target.value as InventoryUnit })}
          >
            <option value="piece">piece</option>
            <option value="gram">gram</option>
            <option value="kg">kg</option>
            <option value="slice">slice</option>
            <option value="liter">liter</option>
          </select>
          <Input
            placeholder="Stock"
            type="number"
            className="w-24"
            value={newItem.stock}
            onChange={(e) => setNewItem({ ...newItem, stock: e.target.value })}
          />
          <Input
            placeholder="Min"
            type="number"
            className="w-24"
            value={newItem.minStock}
            onChange={(e) => setNewItem({ ...newItem, minStock: e.target.value })}
          />
          <Button onClick={addInventory}>Add</Button>
        </CardContent>
      </Card>

      <div className="mt-8 overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-4 font-semibold">Item</th>
              <th className="p-4 font-semibold">Stock</th>
              <th className="p-4 font-semibold">Min</th>
              <th className="p-4 font-semibold">Unit</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-4 font-medium">{item.name}</td>
                <td className="p-4">{item.currentStock}</td>
                <td className="p-4">{item.minStock}</td>
                <td className="p-4">{item.unit}</td>
                <td className="p-4">
                  {item.currentStock <= item.minStock ? (
                    <Badge variant="destructive">Low</Badge>
                  ) : (
                    <Badge variant="success">OK</Badge>
                  )}
                </td>
                <td className="p-4">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        adjustStock(item.id, 10, "purchase", "Stock in +10", profile?.id ?? "admin")
                      }
                    >
                      +10
                    </Button>
                    <InventoryEditDialog item={item} onSave={(data) => saveEdit(item.id, data)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{recipes.length} recipes linked to menu</p>
    </div>
  );
}
