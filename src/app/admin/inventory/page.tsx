"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InventoryEditDialog } from "@/components/admin/inventory-edit-dialog";
import { getInventoryItems, inventoryRepo, recipeRepo, adjustStock, movementRepo } from "@/services/inventory.service";
import { useAuthStore } from "@/stores/auth-store";
import type { InventoryItem, Recipe, InventoryUnit, StockMovement } from "@/types";
import { TableRowsSkeleton } from "@/components/ui/loading-skeletons";
import { formatDate } from "@/lib/utils";
import { ClipboardList, PlusCircle, History, Package, AlertTriangle, Database } from "lucide-react";
import { orderBy, limit } from "@/services/base.repository";

export default function AdminInventoryPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [activeTab, setActiveTab] = useState<"list" | "entry">("list");
  
  const profile = useAuthStore((s) => s.profile);
  const [newItem, setNewItem] = useState({
    name: "",
    unit: "piece" as InventoryUnit,
    minStock: "10",
    stock: "0",
  });
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Daily Entry Form State
  const [selectedItemId, setSelectedItemId] = useState("");
  const [entryQty, setEntryQty] = useState("");
  const [entryDateTime, setEntryDateTime] = useState(() => {
    const d = new Date();
    // Offset local timezone
    const tzoffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzoffset).toISOString().substring(0, 16);
  });
  const [entryNotes, setEntryNotes] = useState("");
  const [submittingEntry, setSubmittingEntry] = useState(false);

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
    // Subscribe to stock movements
    const unsub = movementRepo.subscribe([orderBy("createdAt", "desc"), limit(100)], (list) => {
      setMovements(list);
    });
    return () => unsub();
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

  async function deleteItem(id: string) {
    try {
      await inventoryRepo.delete(id);
      toast.success("Item deleted");
      setItemToDelete(null);
      load();
    } catch {
      toast.error("Failed to delete item");
    }
  }

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItemId || !entryQty) {
      toast.error("Please select an item and enter quantity");
      return;
    }
    const qtyNum = Number(entryQty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }

    setSubmittingEntry(true);
    try {
      const selectedItem = items.find((i) => i.id === selectedItemId);
      if (!selectedItem) return;

      const createdDate = new Date(entryDateTime).toISOString();

      // We directly update stock and log movement
      const newStock = selectedItem.currentStock + qtyNum;
      await inventoryRepo.update(selectedItemId, {
        currentStock: newStock,
        updatedAt: new Date().toISOString(),
      });

      await movementRepo.create({
        inventoryItemId: selectedItemId,
        inventoryItemName: selectedItem.name,
        type: "purchase",
        quantity: qtyNum,
        unit: selectedItem.unit,
        notes: entryNotes.trim() || "Daily Entry",
        createdAt: createdDate,
        createdBy: profile?.displayName || profile?.email || "admin",
      } as Omit<StockMovement, "id">);

      toast.success(`Entered ${qtyNum} ${selectedItem.unit} of ${selectedItem.name}`);
      setEntryQty("");
      setEntryNotes("");
      load();
    } catch (error) {
      toast.error("Failed to save entry");
    } finally {
      setSubmittingEntry(false);
    }
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

  // Dashboard Stats Calculations
  const totalStockItems = items.length;
  const lowStockCount = items.filter((i) => i.currentStock <= i.minStock).length;
  const totalRemainingStockUnits = items.reduce((sum, item) => sum + item.currentStock, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Inventory Management</h1>
          <p className="text-sm text-muted-foreground">Monitor stock levels, manage raw materials, and log daily entries.</p>
        </div>
        <Button onClick={bulkSeed} variant="outline" className="shrink-0">
          Bulk Import Items
        </Button>
      </div>

      {/* Quick Dashboard Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card className="bg-gradient-to-br from-stone-50 to-white shadow-sm border border-stone-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Material Items</CardTitle>
            <Package className="h-4 w-4 text-stone-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black">{totalStockItems}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-stone-50 to-white shadow-sm border border-stone-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Remaining Stock Units</CardTitle>
            <Database className="h-4 w-4 text-stone-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black">{totalRemainingStockUnits.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className={`bg-gradient-to-br shadow-sm border ${lowStockCount > 0 ? "from-red-50 to-white border-red-100" : "from-stone-50 to-white border-stone-100"}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Low Stock Warnings</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${lowStockCount > 0 ? "text-red-500 animate-pulse" : "text-stone-500"}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-black ${lowStockCount > 0 ? "text-red-600" : ""}`}>{lowStockCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-200">
        <button
          type="button"
          onClick={() => setActiveTab("list")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === "list"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Inventory List
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("entry")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === "entry"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <PlusCircle className="h-4 w-4" />
          Daily Stock Entry
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "list" && (
        <div className="space-y-6">
          {/* Add Raw Material Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold">Add Raw Material Item</CardTitle>
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
                  className="h-11 w-32 rounded-xl border bg-background px-3 text-sm font-medium"
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
              <Button onClick={addInventory} className="h-11 px-6 rounded-xl font-bold">
                Add Item
              </Button>
            </CardContent>
          </Card>

          {/* List Table */}
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr className="text-left font-bold text-stone-700">
                  <th className="p-4">Item Name</th>
                  <th className="p-4">Remaining Stock</th>
                  <th className="p-4">Min Limit</th>
                  <th className="p-4">Unit</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-stone-50/50 transition">
                    <td className="p-4 font-bold text-stone-900">{item.name}</td>
                    <td className="p-4 font-semibold text-stone-700">{item.currentStock}</td>
                    <td className="p-4 text-stone-500">{item.minStock}</td>
                    <td className="p-4 text-stone-500 capitalize">{item.unit}</td>
                    <td className="p-4">
                      {item.currentStock <= item.minStock ? (
                        <Badge variant="destructive" className="font-bold">Low</Badge>
                      ) : (
                        <Badge variant="success" className="font-bold">OK</Badge>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            adjustStock(item.id, 10, "purchase", "Quick Add +10", profile?.displayName || "admin")
                          }
                        >
                          +10
                        </Button>
                        <InventoryEditDialog item={item} onSave={(data) => saveEdit(item.id, data)} />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setItemToDelete(item.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No raw materials found. Click Bulk Import or add manually.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{recipes.length} active recipes configured in database.</p>
        </div>
      )}

      {activeTab === "entry" && (
        <div className="space-y-6">
          {/* Daily Stock Entry Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold">Log New Stock Entry</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddEntry} className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 items-end">
                <div className="space-y-1.5 col-span-1 sm:col-span-2">
                  <Label htmlFor="entry-item">Select Raw Material Item</Label>
                  <select
                    id="entry-item"
                    className="h-11 w-full rounded-xl border bg-background px-3 text-sm font-semibold"
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Item --</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.currentStock} remaining)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entry-qty">Quantity Entered</Label>
                  <Input
                    id="entry-qty"
                    type="number"
                    placeholder="Quantity"
                    value={entryQty}
                    onChange={(e) => setEntryQty(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entry-date">Date & Time</Label>
                  <Input
                    id="entry-date"
                    type="datetime-local"
                    value={entryDateTime}
                    onChange={(e) => setEntryDateTime(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5 col-span-1 sm:col-span-3">
                  <Label htmlFor="entry-notes">Notes / Vendor Details</Label>
                  <Input
                    id="entry-notes"
                    placeholder="e.g. Received from Jamil Brothers Dairy"
                    value={entryNotes}
                    onChange={(e) => setEntryNotes(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={submittingEntry} className="h-11 w-full rounded-xl font-bold">
                  {submittingEntry ? "Saving..." : "Save Record"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* History Log Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <History className="h-4 w-4 text-stone-500" />
                Stock Entry Log History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr className="text-left font-bold text-stone-700">
                    <th className="p-4">Date & Time</th>
                    <th className="p-4">Item Name</th>
                    <th className="p-4">Qty Logged</th>
                    <th className="p-4">Unit</th>
                    <th className="p-4">Logged By</th>
                    <th className="p-4">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {movements
                    .filter((m) => m.type === "purchase")
                    .map((m) => (
                      <tr key={m.id} className="border-b last:border-0 hover:bg-stone-50/50 transition">
                        <td className="p-4 font-mono text-xs text-stone-600">
                          {formatDate(m.createdAt)}
                        </td>
                        <td className="p-4 font-bold text-stone-900">{m.inventoryItemName}</td>
                        <td className="p-4 font-semibold text-emerald-600">+{m.quantity}</td>
                        <td className="p-4 capitalize text-stone-500">{m.unit}</td>
                        <td className="p-4 text-stone-600">{m.createdBy}</td>
                        <td className="p-4 text-stone-500">{m.notes}</td>
                      </tr>
                    ))}
                  {movements.filter((m) => m.type === "purchase").length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        No entry logs found in database.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Item dialog */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setItemToDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-destructive">Confirm Deletion</h3>
            <p className="mt-2 text-sm text-muted-foreground">Are you sure you want to delete this item? This action cannot be undone.</p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setItemToDelete(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={() => deleteItem(itemToDelete)}>Yes, Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
