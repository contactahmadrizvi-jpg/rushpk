"use client";

import { useState, useEffect } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/admin/image-upload";
import { RecipeIngredientPicker, type DraftIngredient } from "@/components/admin/recipe-ingredient-picker";
import { getRecipeByMenuItemId, saveRecipeForMenuItem } from "@/services/inventory.service";
import { itemsRepo } from "@/services/menu.service";
import { slugify } from "@/lib/utils";
import type { MenuItem, MenuCategory, InventoryItem } from "@/types";

interface Props {
  item: MenuItem;
  categories: MenuCategory[];
  inventory: InventoryItem[];
  onSaved: () => void;
}

const PIZZA_SIZES = [
  { key: "small", label: "Small" },
  { key: "medium", label: "Medium" },
  { key: "large", label: "Large" },
  { key: "family", label: "Family" },
] as const;

type PizzaSize = (typeof PIZZA_SIZES)[number]["key"];

export function MenuEditDialog({ item, categories, inventory, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState(item.imageUrl);

  // Per-size ingredients for pizza items
  const [sizeIngredients, setSizeIngredients] = useState<Record<PizzaSize, DraftIngredient[]>>({
    small: [], medium: [], large: [], family: [],
  });
  // Base ingredients for non-pizza items
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);

  const [pizzaPrices, setPizzaPrices] = useState({
    small: String(item.price),
    medium: item.variants?.find((v) => v.id === "medium")?.priceModifier
      ? String(item.price + item.variants.find((v) => v.id === "medium")!.priceModifier)
      : "",
    large: item.variants?.find((v) => v.id === "large")?.priceModifier
      ? String(item.price + item.variants.find((v) => v.id === "large")!.priceModifier)
      : "",
    family: item.variants?.find((v) => v.id === "family")?.priceModifier
      ? String(item.price + item.variants.find((v) => v.id === "family")!.priceModifier)
      : "",
  });
  const [manualVariants, setManualVariants] = useState<{ name: string; price: string }[]>(
    item.variants
      ? item.variants
          .filter((v) => !["small", "medium", "large", "family"].includes(v.id))
          .map((v) => ({ name: v.name, price: String(item.price + v.priceModifier) }))
      : []
  );
  const [form, setForm] = useState({
    name: item.name,
    price: String(item.price),
    categoryId: item.categoryId,
    description: item.description,
    isAvailable: item.isAvailable,
    isPopular: item.isPopular,
  });

  const currentCat = categories.find((c) => c.id === form.categoryId);
  const isSizeBased = currentCat?.type === "pizza" || currentCat?.hasSizes;

  useEffect(() => {
    if (!open) return;
    setForm({
      name: item.name,
      price: String(item.price),
      categoryId: item.categoryId,
      description: item.description,
      isAvailable: item.isAvailable,
      isPopular: item.isPopular,
    });
    setImageUrl(item.imageUrl);
    setPizzaPrices({
      small: String(item.price),
      medium: item.variants?.find((v) => v.id === "medium")?.priceModifier
        ? String(item.price + item.variants.find((v) => v.id === "medium")!.priceModifier)
        : "",
      large: item.variants?.find((v) => v.id === "large")?.priceModifier
        ? String(item.price + item.variants.find((v) => v.id === "large")!.priceModifier)
        : "",
      family: item.variants?.find((v) => v.id === "family")?.priceModifier
        ? String(item.price + item.variants.find((v) => v.id === "family")!.priceModifier)
        : "",
    });
    setManualVariants(
      item.variants
        ? item.variants
            .filter((v) => !["small", "medium", "large", "family"].includes(v.id))
            .map((v) => ({ name: v.name, price: String(item.price + v.priceModifier) }))
        : []
    );

    const cat = categories.find((c) => c.id === item.categoryId);
    const isPizza = cat?.type === "pizza" || cat?.hasSizes;

    if (isPizza) {
      // Load per-size recipes
      const loadSizeRecipes = async () => {
        const newSizeIngredients: Record<PizzaSize, DraftIngredient[]> = {
          small: [], medium: [], large: [], family: [],
        };
        for (const { key } of PIZZA_SIZES) {
          const r = await getRecipeByMenuItemId(`${item.id}_${key}`);
          if (r?.ingredients) newSizeIngredients[key] = r.ingredients;
        }
        setSizeIngredients(newSizeIngredients);
      };
      loadSizeRecipes();
    } else {
      getRecipeByMenuItemId(item.id).then((r) => {
        if (r?.ingredients) setIngredients(r.ingredients);
        else setIngredients([]);
      });
    }
  }, [open, item, categories]);

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

  async function handleSave() {
    setSaving(true);
    try {
      const cat = categories.find((c) => c.id === form.categoryId);
      const isPizzaCat = cat?.type === "pizza" || cat?.hasSizes;
      const isPiecesBased = cat?.hasPieces;

      let basePrice = 0;
      let variants = undefined;

      if (isPizzaCat) {
        if (!pizzaPrices.small) {
          toast.error("Small size price is required");
          setSaving(false);
          return;
        }
        basePrice = Number(pizzaPrices.small);
        variants = [
          { id: "small", name: "Small", priceModifier: 0 },
          { id: "medium", name: "Medium", priceModifier: Number(pizzaPrices.medium) - basePrice },
          { id: "large", name: "Large", priceModifier: Number(pizzaPrices.large) - basePrice },
          { id: "family", name: "Family", priceModifier: Number(pizzaPrices.family) - basePrice },
        ];
      } else if (isPiecesBased) {
        const activeVariants = manualVariants.filter((mv) => mv.name.trim() !== "" && mv.price.trim() !== "");
        if (activeVariants.length === 0) {
          toast.error("At least one variant with a price is required");
          setSaving(false);
          return;
        }
        basePrice = Number(activeVariants[0].price);
        variants = manualVariants
          .filter((mv) => mv.name.trim() !== "")
          .map((mv) => ({
            id: slugify(mv.name) || Math.random().toString(36).substr(2, 9),
            name: mv.name,
            priceModifier: Number(mv.price) - basePrice,
          }));
      } else {
        if (!form.price) {
          toast.error("Price is required");
          setSaving(false);
          return;
        }
        basePrice = Number(form.price);
      }

      await itemsRepo.update(item.id, {
        name: form.name,
        slug: slugify(form.name),
        price: basePrice,
        categoryId: form.categoryId,
        description: form.description,
        imageUrl: imageUrl?.trim() || undefined,
        isAvailable: form.isAvailable,
        isPopular: form.isPopular,
        variants,
      } as Partial<MenuItem>);

      if (isPizzaCat) {
        // Save per-size ingredients
        for (const { key, label } of PIZZA_SIZES) {
          const sizeIngs = sizeIngredients[key];
          if (sizeIngs.length > 0) {
            await saveRecipeForMenuItem(`${item.id}_${key}`, `${form.name} (${label})`, sizeIngs);
          }
        }
      } else if (ingredients.length) {
        await saveRecipeForMenuItem(item.id, form.name, ingredients);
      }

      toast.success("Menu item updated");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold">Edit menu item</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {((categories.find((c) => c.id === form.categoryId)?.type === "pizza") || (categories.find((c) => c.id === form.categoryId)?.hasSizes)) && (
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

          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
              />
              Available
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isPopular}
                onChange={(e) => setForm({ ...form, isPopular: e.target.checked })}
              />
              Popular
            </label>
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>

        <div className="mt-4">
          <ImageUpload value={imageUrl} onChange={setImageUrl} />
        </div>

        {/* ── Recipe / Ingredients ── */}
        <div className="mt-4">
          {isSizeBased ? (
            <div className="space-y-4">
              <p className="text-sm font-bold text-foreground">Ingredients per size (optional)</p>
              {PIZZA_SIZES.map(({ key, label }) => (
                <div key={key}>
                  <p className="mb-1.5 text-xs font-black uppercase tracking-wider text-primary">{label} Size</p>
                  <RecipeIngredientPicker
                    inventory={inventory}
                    value={sizeIngredients[key]}
                    onChange={(val) => setSizeIngredients((prev) => ({ ...prev, [key]: val }))}
                  />
                </div>
              ))}
            </div>
          ) : (
            <RecipeIngredientPicker inventory={inventory} value={ingredients} onChange={setIngredients} />
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
