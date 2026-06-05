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
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [form, setForm] = useState({ name: "", price: "", categoryId: "", description: "" });
  const [pizzaPrices, setPizzaPrices] = useState({ small: "", medium: "", large: "", family: "" });
  const [manualVariants, setManualVariants] = useState<{ name: string; price: string }[]>([]);
  const [catForm, setCatForm] = useState({ name: "", description: "", type: "other", hasSizes: false, hasPieces: false });
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [sizeIngredients, setSizeIngredients] = useState<Record<string, DraftIngredient[]>>({
    small: [], medium: [], large: [], family: [],
  });

  const [activeTab, setActiveTab] = useState<"items" | "categories">("items");
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [editCatForm, setEditCatForm] = useState({ name: "", description: "", type: "other", hasSizes: false, hasPieces: false, sortOrder: 0, isActive: true });

  const PIZZA_SIZES = [
    { key: "small", label: "Small" },
    { key: "medium", label: "Medium" },
    { key: "large", label: "Large" },
    { key: "family", label: "Family" },
  ] as const;
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
    const cat = categories.find((c) => c.id === form.categoryId);
    const isSizeBased = cat?.type === "pizza" || cat?.hasSizes;
    const isPiecesBased = cat?.hasPieces;

    if (!form.name || !form.categoryId) {
      toast.error("Name and category required");
      return;
    }

    let basePrice = 0;
    if (isSizeBased) {
      if (!pizzaPrices.small) {
        toast.error("Small size price is required");
        return;
      }
      basePrice = Number(pizzaPrices.small);
    } else if (isPiecesBased) {
      const activeVariants = manualVariants.filter((mv) => mv.name.trim() !== "" && mv.price.trim() !== "");
      if (activeVariants.length === 0) {
        toast.error("At least one variant with a price is required");
        return;
      }
      basePrice = Number(activeVariants[0].price);
    } else {
      if (!form.price) {
        toast.error("Price is required");
        return;
      }
      basePrice = Number(form.price);
    }

    if (!imageUrl?.trim()) {
      toast.error("Upload a product image first (ImgBB → Firestore)");
      return;
    }
    const now = new Date().toISOString();
    
    let variants = undefined;
    if (isSizeBased) {
      variants = [
        { id: "small", name: "Small", priceModifier: 0 },
        { id: "medium", name: "Medium", priceModifier: Number(pizzaPrices.medium) - basePrice },
        { id: "large", name: "Large", priceModifier: Number(pizzaPrices.large) - basePrice },
        { id: "family", name: "Family", priceModifier: Number(pizzaPrices.family) - basePrice },
      ];
    } else if (isPiecesBased) {
      variants = manualVariants
        .filter((mv) => mv.name.trim() !== "")
        .map((mv) => ({
          id: slugify(mv.name) || Math.random().toString(36).substr(2, 9),
          name: mv.name,
          priceModifier: Number(mv.price) - basePrice,
        }));
    }

    const id = await itemsRepo.create({
      categoryId: form.categoryId,
      name: form.name,
      slug: slugify(form.name),
      description: form.description || form.name,
      price: basePrice,
      imageUrl: imageUrl.trim(),
      isAvailable: true,
      isPopular: false,
      isFeatured: false,
      variants,
      sortOrder: items.length,
      createdAt: now,
      updatedAt: now,
    } as Omit<MenuItem, "id">);

    if (isSizeBased) {
      // Save per-size ingredients
      for (const { key, label } of PIZZA_SIZES) {
        const sizeIngs = sizeIngredients[key];
        if (sizeIngs && sizeIngs.length > 0) {
          await saveRecipeForMenuItem(`${id}_${key}`, `${form.name} (${label})`, sizeIngs);
        }
      }
    } else if (ingredients.length) {
      await saveRecipeForMenuItem(id, form.name, ingredients);
    }

    toast.success("Item added");
    setForm({ name: "", price: "", categoryId: "", description: "" });
    setPizzaPrices({ small: "", medium: "", large: "", family: "" });
    setManualVariants([]);
    setImageUrl(undefined);
    setIngredients([]);
    setSizeIngredients({ small: [], medium: [], large: [], family: [] });
    setShowAdd(false);
    load();
  }

  async function addCategory() {
    if (!catForm.name) {
      toast.error("Category name required");
      return;
    }
    const slug = slugify(catForm.name);
    const now = new Date().toISOString();
    try {
      await categoriesRepo.create({
        name: catForm.name,
        slug,
        description: catForm.description || catForm.name,
        isActive: true,
        type: catForm.type as any,
        hasSizes: catForm.hasSizes,
        hasPieces: catForm.hasPieces,
        sortOrder: categories.length + 1,
      } as Omit<MenuCategory, "id">);
      toast.success("Category added");
      setCatForm({ name: "", description: "", type: "other", hasSizes: false, hasPieces: false });
      setShowAddCategory(false);
      load();
    } catch (e) {
      toast.error("Failed to add category");
    }
  }

  function startEditCategory(cat: MenuCategory) {
    setEditingCategory(cat);
    setEditCatForm({
      name: cat.name,
      description: cat.description || "",
      type: cat.type,
      hasSizes: cat.hasSizes || false,
      hasPieces: cat.hasPieces || false,
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
    });
    setShowAddCategory(true);
  }

  async function updateCategory() {
    if (!editingCategory) return;
    if (!editCatForm.name) {
      toast.error("Category name required");
      return;
    }
    try {
      await categoriesRepo.update(editingCategory.id, {
        name: editCatForm.name,
        slug: slugify(editCatForm.name),
        description: editCatForm.description || editCatForm.name,
        type: editCatForm.type as any,
        hasSizes: editCatForm.hasSizes,
        hasPieces: editCatForm.hasPieces,
        sortOrder: Number(editCatForm.sortOrder) || 0,
        isActive: editCatForm.isActive,
      });
      toast.success("Category updated");
      setEditingCategory(null);
      setShowAddCategory(false);
      load();
    } catch (e) {
      toast.error("Failed to update category");
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm("Are you sure you want to delete this category? All items in this category will lose their category association.")) return;
    try {
      await categoriesRepo.delete(id);
      toast.success("Category deleted");
      load();
    } catch (e) {
      toast.error("Failed to delete category");
    }
  }

  const addManualVariantRow = () => {
    setManualVariants([...manualVariants, { name: "", price: "" }]);
  };
  const removeManualVariantRow = (index: number) => {
    setManualVariants(manualVariants.filter((_, i) => i !== index));
  };
  const updateManualVariantRow = (index: number, field: "name" | "price", value: string) => {
    const updated = [...manualVariants];
    if (updated[index]) {
      updated[index][field] = value;
      setManualVariants(updated);
    }
  };

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
          <h1 className="text-2xl font-bold">Menu Manager</h1>
          <p className="text-muted-foreground">Manage your menu items, recipes, and food categories.</p>
        </div>
        <div className="flex gap-2">
          {activeTab === "items" ? (
            <Button onClick={() => setShowAdd(!showAdd)}>
              <Plus className="mr-2 h-4 w-4" />
              {showAdd ? "Close Item Form" : "Add Menu Item"}
            </Button>
          ) : (
            <Button onClick={() => { setEditingCategory(null); setShowAddCategory(!showAddCategory); }}>
              <Plus className="mr-2 h-4 w-4" />
              {showAddCategory ? "Close Category Form" : "Add Category"}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => { setActiveTab("items"); setShowAddCategory(false); setEditingCategory(null); }}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "items"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Menu Items ({items.length})
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab("categories"); setShowAdd(false); }}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "categories"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Manage Categories ({categories.length})
        </button>
      </div>

      {activeTab === "items" ? (
        <>
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
                  {!((categories.find(c => c.id === form.categoryId)?.type === "pizza") || (categories.find(c => c.id === form.categoryId)?.hasSizes) || (categories.find(c => c.id === form.categoryId)?.hasPieces)) && (
                    <div>
                      <Label>Price (PKR)</Label>
                      <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                    </div>
                  )}
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
                  
                  {((categories.find(c => c.id === form.categoryId)?.type === "pizza") || (categories.find(c => c.id === form.categoryId)?.hasSizes)) && (
                    <>
                      <div>
                        <Label>Small Price (PKR)</Label>
                        <Input type="number" value={pizzaPrices.small} onChange={(e) => setPizzaPrices({ ...pizzaPrices, small: e.target.value })} placeholder="e.g. 600" />
                      </div>
                      <div>
                        <Label>Medium Price (PKR)</Label>
                        <Input type="number" value={pizzaPrices.medium} onChange={(e) => setPizzaPrices({ ...pizzaPrices, medium: e.target.value })} placeholder="e.g. 900" />
                      </div>
                      <div>
                        <Label>Large Price (PKR)</Label>
                        <Input type="number" value={pizzaPrices.large} onChange={(e) => setPizzaPrices({ ...pizzaPrices, large: e.target.value })} placeholder="e.g. 1300" />
                      </div>
                      <div>
                        <Label>Family Price (PKR)</Label>
                        <Input type="number" value={pizzaPrices.family} onChange={(e) => setPizzaPrices({ ...pizzaPrices, family: e.target.value })} placeholder="e.g. 1800" />
                      </div>
                    </>
                  )}

                  {categories.find(c => c.id === form.categoryId)?.hasPieces && (
                    <div className="sm:col-span-2 border-t pt-4 mt-2">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="font-bold text-base">Custom Pieces / Variants</Label>
                        <Button size="sm" variant="outline" type="button" onClick={addManualVariantRow}>+ Add Variant</Button>
                      </div>
                      <div className="space-y-2">
                        {manualVariants.map((row, idx) => (
                          <div key={idx} className="flex gap-3 items-center">
                            <Input
                              placeholder="e.g. 6 Pieces"
                              value={row.name}
                              onChange={(e) => updateManualVariantRow(idx, "name", e.target.value)}
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              placeholder="Price (PKR)"
                              value={row.price}
                              onChange={(e) => updateManualVariantRow(idx, "price", e.target.value)}
                              className="w-32"
                            />
                            <Button size="sm" variant="destructive" type="button" onClick={() => removeManualVariantRow(idx)}>Delete</Button>
                          </div>
                        ))}
                        {manualVariants.length === 0 && (
                          <p className="text-xs text-muted-foreground italic">No variants added yet. Click + Add Variant to create some.</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="sm:col-span-2">
                    <Label>Description</Label>
                    <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                </div>
                <ImageUpload value={imageUrl} onChange={setImageUrl} />
                {((categories.find(c => c.id === form.categoryId)?.type === "pizza") || (categories.find(c => c.id === form.categoryId)?.hasSizes)) ? (
                  <div className="space-y-4">
                    <p className="text-sm font-bold text-foreground">Ingredients per size (optional)</p>
                    {PIZZA_SIZES.map(({ key, label }) => (
                      <div key={key}>
                        <p className="mb-1.5 text-xs font-black uppercase tracking-wider text-primary">{label} Size</p>
                        <RecipeIngredientPicker
                          inventory={inventory}
                          value={sizeIngredients[key] ?? []}
                          onChange={(val) => setSizeIngredients((prev) => ({ ...prev, [key]: val }))}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <RecipeIngredientPicker inventory={inventory} value={ingredients} onChange={setIngredients} />
                )}
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
        </>
      ) : (
        <>
          {showAddCategory && (
            <Card>
              <CardHeader>
                <CardTitle>{editingCategory ? `Edit Category: ${editingCategory.name}` : "Add new category"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Category Name</Label>
                    <Input
                      value={editingCategory ? editCatForm.name : catForm.name}
                      onChange={(e) => editingCategory
                        ? setEditCatForm({ ...editCatForm, name: e.target.value })
                        : setCatForm({ ...catForm, name: e.target.value })
                      }
                      placeholder="e.g. Pasta"
                    />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <select
                      className="mt-1 flex h-11 w-full rounded-xl border px-3 text-sm"
                      value={editingCategory ? editCatForm.type : catForm.type}
                      onChange={(e) => editingCategory
                        ? setEditCatForm({ ...editCatForm, type: e.target.value })
                        : setCatForm({ ...catForm, type: e.target.value })
                      }
                    >
                      <option value="other">Other</option>
                      <option value="pizza">Pizza</option>
                      <option value="burger">Burger</option>
                      <option value="sides">Sides</option>
                      <option value="drinks">Drinks</option>
                      <option value="deals">Deals</option>
                    </select>
                  </div>
                  {editingCategory && (
                    <>
                      <div>
                        <Label>Sort Order</Label>
                        <Input
                          type="number"
                          value={editCatForm.sortOrder}
                          onChange={(e) => setEditCatForm({ ...editCatForm, sortOrder: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <Label>Status</Label>
                        <select
                          className="mt-1 flex h-11 w-full rounded-xl border px-3 text-sm"
                          value={editCatForm.isActive ? "active" : "inactive"}
                          onChange={(e) => setEditCatForm({ ...editCatForm, isActive: e.target.value === "active" })}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </>
                  )}
                  <div className="flex flex-col gap-4 py-2 sm:col-span-2">
                    <div className="flex flex-wrap items-center gap-6">
                      <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingCategory ? editCatForm.hasSizes : catForm.hasSizes}
                          onChange={(e) => editingCategory
                            ? setEditCatForm({ ...editCatForm, hasSizes: e.target.checked, hasPieces: e.target.checked ? false : editCatForm.hasPieces })
                            : setCatForm({ ...catForm, hasSizes: e.target.checked, hasPieces: e.target.checked ? false : catForm.hasPieces })
                          }
                        />
                        Is it Size-based? (Small, Medium, Large, Family)
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingCategory ? editCatForm.hasPieces : catForm.hasPieces}
                          onChange={(e) => editingCategory
                            ? setEditCatForm({ ...editCatForm, hasPieces: e.target.checked, hasSizes: e.target.checked ? false : editCatForm.hasSizes })
                            : setCatForm({ ...catForm, hasPieces: e.target.checked, hasSizes: e.target.checked ? false : catForm.hasSizes })
                          }
                        />
                        Is it Pieces/Custom-based? (Allow custom variants)
                      </label>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Description</Label>
                    <Textarea
                      value={editingCategory ? editCatForm.description : catForm.description}
                      onChange={(e) => editingCategory
                        ? setEditCatForm({ ...editCatForm, description: e.target.value })
                        : setCatForm({ ...catForm, description: e.target.value })
                      }
                      placeholder="e.g. Delicious freshly baked pasta"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={editingCategory ? updateCategory : addCategory}>
                    {editingCategory ? "Save Changes" : "Save Category"}
                  </Button>
                  {editingCategory && (
                    <Button variant="outline" onClick={() => { setEditingCategory(null); setShowAddCategory(false); }}>
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Categories List */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Food Categories</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="p-3 text-left">Sort</th>
                      <th className="p-3 text-left">Name</th>
                      <th className="p-3 text-left">Type</th>
                      <th className="p-3 text-left">Options</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => (
                      <tr key={cat.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-3 font-semibold text-muted-foreground">{cat.sortOrder}</td>
                        <td className="p-3">
                          <div>
                            <p className="font-semibold text-stone-850">{cat.name}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">{cat.description || "No description"}</p>
                          </div>
                        </td>
                        <td className="p-3 capitalize">{cat.type}</td>
                        <td className="p-3 text-xs text-stone-700">
                          {cat.hasSizes && "📏 Size-based"}
                          {cat.hasPieces && "🔢 Custom Pieces"}
                          {!cat.hasSizes && !cat.hasPieces && "—"}
                        </td>
                        <td className="p-3">
                          {cat.isActive ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="destructive">Inactive</Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => startEditCategory(cat)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="destructive" className="ml-2" onClick={() => deleteCategory(cat.id)}>
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
        </>
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
