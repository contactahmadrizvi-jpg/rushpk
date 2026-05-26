"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InventoryEditDialog } from "@/components/admin/inventory-edit-dialog";
import { getInventoryItems, inventoryRepo, recipeRepo, adjustStock } from "@/services/inventory.service";
import { useAuthStore } from "@/stores/auth-store";
import type { InventoryItem, Recipe, InventoryUnit } from "@/types";
import { TableRowsSkeleton } from "@/components/ui/loading-skeletons";

export default function AdminInventoryPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const profile = useAuthStore((s) => s.profile);
  const [newItem, setNewItem] = useState({
    name: "",
    unit: "piece" as InventoryUnit,
    minStock: "10",
    stock: "0",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [inv, rec] = await Promise.all([getInventoryItems(), recipeRepo.getAll()]);
      setItems(inv);
      setRecipes(rec);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Inventory</h1>
        <div className="mt-6">
          <TableRowsSkeleton rows={8} />
        </div>
      </div>
    );
  }

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

  const ITEMS_TO_SEED = [
    { name: "Shawarma Bread", unit: "piece", stock: 200 },
    { name: "Wrap Bread", unit: "piece", stock: 120 },
    { name: "Burger Bun", unit: "piece", stock: 100 },
    { name: "Paratha", unit: "piece", stock: 150 },
    { name: "Pizza Dough Small", unit: "gram", stock: 6000 },
    { name: "Pizza Dough Medium", unit: "gram", stock: 10000 },
    { name: "Pizza Dough Large", unit: "gram", stock: 13500 },
    { name: "Pizza Dough Family", unit: "gram", stock: 13000 },
    { name: "Boneless Chicken", unit: "gram", stock: 35000 },
    { name: "Beef", unit: "gram", stock: 20000 },
    { name: "Cheese", unit: "gram", stock: 15000 },
    { name: "Cheese Slice", unit: "slice", stock: 200 },
    { name: "Zinger Piece", unit: "piece", stock: 120 },
    { name: "Kabab", unit: "piece", stock: 150 },
    { name: "Fries", unit: "gram", stock: 40000 },
    { name: "Wings", unit: "piece", stock: 200 },
    { name: "Nuggets", unit: "piece", stock: 200 },
    { name: "Mayo Sauce", unit: "gram", stock: 8000 },
    { name: "Garlic Mayo", unit: "gram", stock: 6000 },
    { name: "Pizza Sauce", unit: "gram", stock: 10000 },
    { name: "Jalapenos", unit: "gram", stock: 3000 },
    { name: "Onion", unit: "gram", stock: 15000 },
    { name: "Lettuce / Cabbage", unit: "gram", stock: 12000 },
    { name: "Cooking Oil", unit: "liter", stock: 50 },
    { name: "Pizza Boxes Small", unit: "piece", stock: 50 },
    { name: "Pizza Boxes Medium", unit: "piece", stock: 50 },
    { name: "Pizza Boxes Large", unit: "piece", stock: 40 },
    { name: "Pizza Boxes Family", unit: "piece", stock: 30 },
    { name: "Burger Wrappers", unit: "piece", stock: 300 },
    { name: "Delivery Bags", unit: "piece", stock: 200 },
  ];

  async function bulkSeed() {
    setLoading(true);
    let added = 0;
    try {
      for (const item of ITEMS_TO_SEED) {
        if (items.some(i => i.name.toLowerCase() === item.name.toLowerCase())) {
           continue;
        }
        const now = new Date().toISOString();
        await inventoryRepo.create({
          name: item.name,
          sku: item.name.replace(/\s+/g, "-").toUpperCase(),
          unit: item.unit as InventoryUnit,
          currentStock: item.stock,
          minStock: 10,
          costPerUnit: 0,
          isActive: true,
          preventSellWhenLow: false,
          createdAt: now,
          updatedAt: now,
        } as Omit<InventoryItem, "id">);
        added++;
      }
      toast.success(`Successfully added ${added} items!`);
      load();
    } catch (err) {
      toast.error("Failed to seed items");
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-muted-foreground">Edit stock, units & limits. Auto-deducts on orders.</p>
        </div>
        <Button onClick={bulkSeed} variant="outline">Bulk Import Items</Button>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Add raw material</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label htmlFor="item-name">Item Name</Label>
            <Input
              id="item-name"
              placeholder="e.g. Cheese, Tomato Sauce"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-unit">Unit Type</Label>
            <select
              id="item-unit"
              className="h-11 w-28 rounded-xl border bg-background px-3 text-sm"
              value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value as InventoryUnit })}
            >
              <option value="piece">piece</option>
              <option value="gram">gram</option>
              <option value="kg">kg</option>
              <option value="slice">slice</option>
              <option value="liter">liter</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-stock">Initial Stock</Label>
            <Input
              id="item-stock"
              placeholder="Stock"
              type="number"
              className="w-24"
              value={newItem.stock}
              onChange={(e) => setNewItem({ ...newItem, stock: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-min">Min Alert Stock</Label>
            <Input
              id="item-min"
              placeholder="Min"
              type="number"
              className="w-24"
              value={newItem.minStock}
              onChange={(e) => setNewItem({ ...newItem, minStock: e.target.value })}
            />
          </div>
          <Button onClick={addInventory} className="h-11 px-6 rounded-xl">Add Item</Button>
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
