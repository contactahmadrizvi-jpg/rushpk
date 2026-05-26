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

export function MenuEditDialog({ item, categories, inventory, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState(item.imageUrl);
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [pizzaPrices, setPizzaPrices] = useState({
    medium: item.variants?.find((v) => v.id === "medium")?.priceModifier
      ? String(item.price + item.variants.find((v) => v.id === "medium")!.priceModifier)
      : "",
    large: item.variants?.find((v) => v.id === "large")?.priceModifier
      ? String(item.price + item.variants.find((v) => v.id === "large")!.priceModifier)
      : "",
  });
  const [form, setForm] = useState({
    name: item.name,
    price: String(item.price),
    categoryId: item.categoryId,
    description: item.description,
    isAvailable: item.isAvailable,
    isPopular: item.isPopular,
  });

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
    getRecipeByMenuItemId(item.id).then((r) => {
      if (r?.ingredients) setIngredients(r.ingredients);
      else setIngredients([]);
    });
  }, [open, item]);

  async function handleSave() {
    setSaving(true);
    try {
      const cat = categories.find((c) => c.id === form.categoryId);
      let variants = item.variants;
      if (cat?.type === "pizza") {
        const basePrice = Number(form.price);
        variants = [
          { id: "small", name: "Small", priceModifier: 0 },
          { id: "medium", name: "Medium", priceModifier: Number(pizzaPrices.medium) - basePrice },
          { id: "large", name: "Large", priceModifier: Number(pizzaPrices.large) - basePrice },
        ];
      }

      await itemsRepo.update(item.id, {
        name: form.name,
        slug: slugify(form.name),
        price: Number(form.price),
        categoryId: form.categoryId,
        description: form.description,
        imageUrl: imageUrl?.trim() || undefined,
        isAvailable: form.isAvailable,
        isPopular: form.isPopular,
        variants,
      } as Partial<MenuItem>);

      if (ingredients.length) {
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
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {categories.find((c) => c.id === form.categoryId)?.type === "pizza" && (
            <>
              <div>
                <Label>Medium Price (PKR)</Label>
                <Input type="number" value={pizzaPrices.medium} onChange={(e) => setPizzaPrices({ ...pizzaPrices, medium: e.target.value })} placeholder="e.g. 900" />
              </div>
              <div>
                <Label>Large Price (PKR)</Label>
                <Input type="number" value={pizzaPrices.large} onChange={(e) => setPizzaPrices({ ...pizzaPrices, large: e.target.value })} placeholder="e.g. 1300" />
              </div>
            </>
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

        <div className="mt-4">
          <RecipeIngredientPicker inventory={inventory} value={ingredients} onChange={setIngredients} />
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
