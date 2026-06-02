"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InventoryEditDialog } from "@/components/admin/inventory-edit-dialog";
import { getInventoryItems, inventoryRepo, recipeRepo, adjustStock, movementRepo } from "@/services/inventory.service";
import { useAuthStore } from "@/stores/auth-store";
import type { InventoryItem, Recipe, InventoryUnit, StockMovement } from "@/types";
import { TableRowsSkeleton } from "@/components/ui/loading-skeletons";
import { formatDate, cn } from "@/lib/utils";
import { ClipboardList, PlusCircle, History, Package, AlertTriangle, Database, Plus, Trash } from "lucide-react";
import { orderBy, limit, where } from "@/services/base.repository";

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
  const [showAddForm, setShowAddForm] = useState(false);

  // Daily Entry Form State
  const [selectedItemId, setSelectedItemId] = useState("");
  const [entryQty, setEntryQty] = useState("");
  const [entryDateTime, setEntryDateTime] = useState(() => {
    const d = new Date();
    const tzoffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzoffset).toISOString().substring(0, 16);
  });
  const [entryNotes, setEntryNotes] = useState("");
  const [submittingEntry, setSubmittingEntry] = useState(false);

  // Filter States for Daily Entry History Log
  const [entryFilterType, setEntryFilterType] = useState<"day" | "this_month" | "prev_month">("day");
  const [entrySelectedDate, setEntrySelectedDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

  useEffect(() => {
    let startIso: string;
    let endIso: string;

    if (entryFilterType === "day") {
      const start = new Date(`${entrySelectedDate}T00:00:00`);
      const end = new Date(`${entrySelectedDate}T23:59:59.999`);
      startIso = start.toISOString();
      endIso = end.toISOString();
    } else if (entryFilterType === "this_month") {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      startIso = start.toISOString();
      endIso = end.toISOString();
    } else {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      startIso = start.toISOString();
      endIso = end.toISOString();
    }

    const unsub = movementRepo.subscribe([
      where("createdAt", ">=", startIso),
      where("createdAt", "<=", endIso),
      orderBy("createdAt", "desc"),
      limit(200)
    ], (list) => {
      setMovements(list);
    });
    return () => unsub();
  }, [entryFilterType, entrySelectedDate]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <TableRowsSkeleton rows={8} />
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
      totalStock: Number(newItem.stock) || 0,
      minStock: Number(newItem.minStock),
      costPerUnit: 0,
      isActive: true,
      preventSellWhenLow: false,
      createdAt: now,
      updatedAt: now,
    } as Omit<InventoryItem, "id">);
    toast.success("Item Added successfully!");
    setNewItem({ name: "", unit: "piece", minStock: "10", stock: "0" });
    setShowAddForm(false);
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
      toast.error("Select item and enter quantity");
      return;
    }
    const qtyNum = Number(entryQty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }

    setSubmittingEntry(true);
    try {
      const selectedItem = items.find((i) => i.id === selectedItemId);
      if (!selectedItem) return;

      const createdDate = new Date(entryDateTime).toISOString();
      const newStock = selectedItem.currentStock + qtyNum;
      const newTotalStock = (selectedItem.totalStock || selectedItem.currentStock) + qtyNum;

      await inventoryRepo.update(selectedItemId, {
        currentStock: newStock,
        totalStock: newTotalStock,
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

      toast.success(`Logged ${qtyNum} of ${selectedItem.name}`);
      setEntryQty("");
      setEntryNotes("");
      load();
    } catch (error) {
      toast.error("Failed to save entry");
    } finally {
      setSubmittingEntry(false);
    }
  }

  const totalStockItems = items.length;
  const lowStockCount = items.filter((i) => i.currentStock <= i.minStock).length;
  const totalRemainingStockUnits = items.reduce((sum, item) => sum + item.currentStock, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Sleek Minimal Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-stone-900 tracking-tight">Inventory</h1>
          <p className="text-xs text-stone-400">Manage raw material stocks and logs cleanly.</p>
        </div>
        <div className="flex gap-2">
          {activeTab === "list" && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-primary/95 transition shadow-sm active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              {showAddForm ? "Close Form" : "Add Material"}
            </button>
          )}
        </div>
      </div>

      {/* Low-Profile Metric Ribbon */}
      <div className="grid grid-cols-3 gap-3 bg-white p-3 rounded-2xl border border-stone-100 shadow-sm text-xs">
        <div className="flex items-center gap-2 pl-2">
          <Package className="h-4 w-4 text-stone-400" />
          <div>
            <p className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Total Items</p>
            <p className="font-extrabold text-stone-855 text-sm">{totalStockItems}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-x px-3">
          <Database className="h-4 w-4 text-stone-400" />
          <div>
            <p className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Total Units</p>
            <p className="font-extrabold text-stone-855 text-sm">{totalRemainingStockUnits.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-2">
          <AlertTriangle className={`h-4 w-4 ${lowStockCount > 0 ? "text-red-500 animate-pulse" : "text-stone-400"}`} />
          <div>
            <p className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Low Stock</p>
            <p className={`font-extrabold text-sm ${lowStockCount > 0 ? "text-red-600" : "text-stone-855"}`}>{lowStockCount}</p>
          </div>
        </div>
      </div>

      {/* Tabs selector */}
      <div className="flex gap-1.5 bg-stone-100/70 p-1 rounded-xl w-fit text-xs border">
        <button
          type="button"
          onClick={() => setActiveTab("list")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all ${
            activeTab === "list"
              ? "bg-white text-stone-850 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <ClipboardList className="h-3.5 w-3.5" />
          Stock List
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("entry")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all ${
            activeTab === "entry"
              ? "bg-white text-stone-850 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Daily Entry
        </button>
      </div>

      {/* Collapsible Material Add Form */}
      {activeTab === "list" && showAddForm && (
        <Card className="border border-stone-100 shadow-sm rounded-2xl bg-stone-50/50">
          <CardContent className="p-4 grid gap-3 sm:grid-cols-4 items-end text-xs">
            <div className="space-y-1">
              <Label htmlFor="item-name" className="text-[11px] font-bold text-stone-500">Material Name</Label>
              <Input
                id="item-name"
                placeholder="e.g. Cheese, Bread"
                value={newItem.name}
                className="h-9 text-xs rounded-lg"
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="item-unit" className="text-[11px] font-bold text-stone-500">Unit</Label>
              <select
                id="item-unit"
                className="h-9 w-full rounded-lg border bg-white px-2.5 text-xs font-semibold"
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
            <div className="space-y-1">
              <Label htmlFor="item-stock" className="text-[11px] font-bold text-stone-500">Initial Qty</Label>
              <Input
                id="item-stock"
                type="number"
                value={newItem.stock}
                className="h-9 text-xs rounded-lg"
                onChange={(e) => setNewItem({ ...newItem, stock: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <div className="space-y-1 flex-1">
                <Label htmlFor="item-min" className="text-[11px] font-bold text-stone-500">Alert Min</Label>
                <Input
                  id="item-min"
                  type="number"
                  value={newItem.minStock}
                  className="h-9 text-xs rounded-lg"
                  onChange={(e) => setNewItem({ ...newItem, minStock: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={addInventory}
                className="bg-primary text-white text-xs font-extrabold px-4 h-9 rounded-lg hover:bg-primary/95 transition active:scale-95 shadow-sm shrink-0"
              >
                Save
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Tab Section */}
      {activeTab === "list" && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden text-xs">
          <table className="w-full text-left">
            <thead className="bg-stone-50 border-b border-stone-100">
              <tr className="font-bold text-stone-500">
                <th className="p-3.5">Material Item</th>
                <th className="p-3.5">Total Stock</th>
                <th className="p-3.5">Remaining Stock</th>
                <th className="p-3.5">Min Limit</th>
                <th className="p-3.5">Unit</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-0 border-stone-50 hover:bg-stone-50/30 transition">
                  <td className="p-3.5 font-bold text-stone-900">{item.name}</td>
                  <td className="p-3.5 font-extrabold text-stone-700">{item.totalStock ?? item.currentStock}</td>
                  <td className="p-3.5 font-extrabold text-stone-700">{item.currentStock}</td>
                  <td className="p-3.5 text-stone-400 font-medium">{item.minStock}</td>
                  <td className="p-3.5 text-stone-400 capitalize">{item.unit}</td>
                  <td className="p-3.5">
                    {item.currentStock <= item.minStock ? (
                      <Badge variant="destructive" className="font-extrabold text-[9px] px-1.5 py-0.5 rounded-md">Low</Badge>
                    ) : (
                      <Badge variant="success" className="font-extrabold text-[9px] px-1.5 py-0.5 rounded-md">OK</Badge>
                    )}
                  </td>
                  <td className="p-3.5">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() =>
                          adjustStock(item.id, 10, "purchase", "Add +10", profile?.displayName || "admin")
                        }
                        className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold px-2 py-1.5 rounded-lg text-[10px] active:scale-95 transition"
                      >
                        +10
                      </button>
                      <InventoryEditDialog item={item} onSave={(data) => saveEdit(item.id, data)} />
                      <button
                        onClick={() => setItemToDelete(item.id)}
                        className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg active:scale-95 transition"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-stone-400">
                    No items found. Click bulk import or add manually.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "entry" && (
        <div className="grid gap-6 md:grid-cols-3 items-start">
          {/* Daily Stock Entry Form */}
          <Card className="border border-stone-100 shadow-sm rounded-2xl bg-white md:col-span-1">
            <CardContent className="p-4 space-y-3.5 text-xs">
              <h3 className="font-black text-stone-850 border-b pb-2">Log Daily Stock</h3>
              <form onSubmit={handleAddEntry} className="space-y-3.5">
                <div className="space-y-1">
                  <Label htmlFor="entry-item" className="font-bold text-stone-500">Material Item</Label>
                  <select
                    id="entry-item"
                    className="h-9 w-full rounded-lg border bg-white px-2 text-xs font-semibold"
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Item --</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.currentStock} left)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="entry-qty" className="font-bold text-stone-500">Quantity Entered</Label>
                  <Input
                    id="entry-qty"
                    type="number"
                    value={entryQty}
                    className="h-9 text-xs"
                    onChange={(e) => setEntryQty(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="entry-date" className="font-bold text-stone-500">Date & Time</Label>
                  <Input
                    id="entry-date"
                    type="datetime-local"
                    value={entryDateTime}
                    className="h-9 text-xs"
                    onChange={(e) => setEntryDateTime(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="entry-notes" className="font-bold text-stone-500">Notes / Details</Label>
                  <Input
                    id="entry-notes"
                    placeholder="e.g. Daily restock"
                    value={entryNotes}
                    className="h-9 text-xs"
                    onChange={(e) => setEntryNotes(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={submittingEntry} className="w-full h-10 rounded-xl font-bold bg-primary text-white">
                  {submittingEntry ? "Saving..." : "Save Record"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* History Log Table */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-black text-stone-850 flex items-center gap-1.5 text-sm">
                <History className="h-4 w-4 text-stone-400" />
                Stock Log History
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 rounded-lg bg-stone-100/80 p-0.5 border text-[10px]">
                  {(["day", "this_month", "prev_month"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEntryFilterType(t)}
                      className={cn(
                        "rounded px-2.5 py-1 font-bold uppercase tracking-wider transition-all",
                        entryFilterType === t
                          ? "bg-white text-stone-900 shadow-xs"
                          : "text-stone-500 hover:text-stone-800"
                      )}
                    >
                      {t === "day" ? "Day" : t === "this_month" ? "This Month" : "Prev Month"}
                    </button>
                  ))}
                </div>
                {entryFilterType === "day" && (
                  <input
                    type="date"
                    value={entrySelectedDate}
                    onChange={(e) => setEntrySelectedDate(e.target.value)}
                    className="h-7 rounded-lg border bg-background px-2 text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-stone-50 border-b border-stone-100">
                  <tr className="font-bold text-stone-500">
                    <th className="p-3">Logged Date</th>
                    <th className="p-3">Material Name</th>
                    <th className="p-3">Quantity</th>
                    <th className="p-3">By</th>
                    <th className="p-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {movements
                    .filter((m) => m.type === "purchase")
                    .map((m) => (
                      <tr key={m.id} className="border-b last:border-0 border-stone-50 hover:bg-stone-50/30 transition">
                        <td className="p-3 font-mono text-[10px] text-stone-400">
                          {formatDate(m.createdAt)}
                        </td>
                        <td className="p-3 font-bold text-stone-900">{m.inventoryItemName}</td>
                        <td className="p-3 font-black text-emerald-600">+{m.quantity} {m.unit}</td>
                        <td className="p-3 text-stone-500 font-medium">{m.createdBy}</td>
                        <td className="p-3 text-stone-400">{m.notes}</td>
                      </tr>
                    ))}
                  {movements.filter((m) => m.type === "purchase").length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-stone-400">
                        No entries logged.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Delete Item dialog */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setItemToDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl text-center animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-black text-red-600">Delete Material Item?</h3>
            <p className="mt-2 text-xs text-muted-foreground">This action cannot be undone. Are you sure?</p>
            <div className="mt-5 flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl text-xs font-bold" onClick={() => setItemToDelete(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1 rounded-xl text-xs font-bold" onClick={() => deleteItem(itemToDelete)}>Yes, Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
