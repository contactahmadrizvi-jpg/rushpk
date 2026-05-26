"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { MenuItemImage } from "@/components/menu-item-image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/admin/image-upload";
import { MenuEditDialog } from "@/components/admin/menu-edit-dialog";
import { itemsRepo, categoriesRepo, ensureDefaultCategories, getMenuItems } from "@/services/menu.service";
import { saveRecipeForMenuItem, getInventoryItems } from "@/services/inventory.service";
import { RecipeIngredientPicker, type DraftIngredient } from "@/components/admin/recipe-ingredient-picker";
import { formatCurrency, slugify, cn } from "@/lib/utils";
import type { MenuItem, MenuCategory, InventoryItem } from "@/types";
import { TableRowsSkeleton } from "@/components/ui/loading-skeletons";

export default function AdminMenuPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [form, setForm] = useState({ name: "", price: "", categoryId: "", description: "" });
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      await ensureDefaultCategories();
      const [list, cats, inv] = await Promise.all([
        getMenuItems(),
        categoriesRepo.getAll(),
        getInventoryItems(),
      ]);
      setItems(list.sort((a, b) => a.sortOrder - b.sortOrder));
      setCategories(cats.sort((a, b) => a.sortOrder - b.sortOrder));
      setInventory(inv);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    let list = items;
    if (filterCat !== "all") list = list.filter((i) => i.categoryId === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    const byCat: Record<string, MenuItem[]> = {};
    for (const item of list) {
      if (!byCat[item.categoryId]) byCat[item.categoryId] = [];
      byCat[item.categoryId]!.push(item);
    }
    return byCat;
  }, [items, filterCat, search]);

  async function addItem() {
    if (!form.name || !form.price || !form.categoryId) {
      toast.error("Name, price and category required");
      return;
    }
    if (!imageUrl?.trim()) {
      toast.error("Upload a product image first (ImgBB → Firestore)");
      return;
    }
    const now = new Date().toISOString();
    const id = await itemsRepo.create({
      categoryId: form.categoryId,
      name: form.name,
      slug: slugify(form.name),
      description: form.description || form.name,
      price: Number(form.price),
      imageUrl: imageUrl.trim(),
      isAvailable: true,
      isPopular: false,
      isFeatured: false,
      sortOrder: items.length,
      createdAt: now,
      updatedAt: now,
    } as Omit<MenuItem, "id">);

    if (ingredients.length) {
      await saveRecipeForMenuItem(id, form.name, ingredients);
    }

    toast.success("Item added");
    setForm({ name: "", price: "", categoryId: "", description: "" });
    setImageUrl(undefined);
    setIngredients([]);
    setShowAdd(false);
    load();
  }

  async function deleteItem(id: string) {
    try {
      await itemsRepo.delete(id);
      toast.success("Item deleted");
      setItemToDelete(null);
      load();
    } catch {
      toast.error("Failed to delete item");
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <TableRowsSkeleton rows={8} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Menu</h1>
          <p className="text-muted-foreground">{items.length} items · edit, images & recipes</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}>
          <Plus className="mr-2 h-4 w-4" />
          {showAdd ? "Close" : "Add item"}
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardHeader>
            <CardTitle>Add new item</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Price (PKR)</Label>
                <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div>
                <Label>Category</Label>
                <select
                  className="mt-1 flex h-11 w-full rounded-xl border px-3 text-sm"
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <ImageUpload value={imageUrl} onChange={setImageUrl} />
            <RecipeIngredientPicker inventory={inventory} value={ingredients} onChange={setIngredients} />
            <Button onClick={addItem}>Save item</Button>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search menu..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterCat("all")}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold",
              filterCat === "all" ? "bg-primary text-primary-foreground" : "bg-muted"
            )}
          >
            All ({items.length})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilterCat(c.id)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold",
                filterCat === c.id ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              {c.name} ({items.filter((i) => i.categoryId === c.id).length})
            </button>
          ))}
        </div>
      </div>

      {/* Menu by category */}
      {Object.keys(grouped).length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">No menu items yet. Add your first item above.</p>
      ) : (
        categories
          .filter((c) => grouped[c.id]?.length)
          .map((cat) => (
            <Card key={cat.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{cat.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/40">
                      <tr>
                        <th className="p-3 text-left">Item</th>
                        <th className="p-3 text-left">Price</th>
                        <th className="p-3 text-left">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped[cat.id]?.map((item) => (
                        <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                                <MenuItemImage src={item.imageUrl} alt={item.name} fill />
                              </div>
                              <div>
                                <p className="font-semibold">{item.name}</p>
                                <p className="line-clamp-1 text-xs text-muted-foreground">{item.description}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 font-bold text-primary">{formatCurrency(item.price)}</td>
                          <td className="p-3">
                            {item.isAvailable ? (
                              <Badge variant="success">Available</Badge>
                            ) : (
                              <Badge variant="destructive">Off</Badge>
                            )}
                            {item.isPopular && (
                              <Badge variant="warning" className="ml-1">
                                Popular
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <MenuEditDialog
                              item={item}
                              categories={categories}
                              inventory={inventory}
                              onSaved={load}
                            />
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setItemToDelete(item.id)}
                              className="ml-2"
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))
      )}

      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setItemToDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-destructive">Confirm Deletion</h3>
            <p className="mt-2 text-sm text-muted-foreground">Are you sure you want to delete this menu item? This action cannot be undone.</p>
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
