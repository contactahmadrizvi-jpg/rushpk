"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Loader2, Calendar, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { dealsRepo, getAvailableMenuItems } from "@/services/menu.service";
import type { MenuItem, Deal } from "@/types";
import { Badge } from "@/components/ui/badge";

export default function AdminDealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit / Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [fixedPrice, setFixedPrice] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({}); // menuItemId -> variantId
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().split("T")[0]!);
  const [validTo, setValidTo] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split("T")[0]!;
  });
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const [dList, mItems] = await Promise.all([
          dealsRepo.getAll(),
          getAvailableMenuItems(),
        ]);
        setDeals(dList);
        setMenuItems(mItems);
      } catch (err) {
        toast.error("Failed to load deals data");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleSelectItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const exists = prev.includes(id);
      if (exists) {
        // Remove item and its variant selection
        const filtered = prev.filter((x) => x !== id);
        setSelectedVariants((v) => {
          const updated = { ...v };
          delete updated[id];
          return updated;
        });
        return filtered;
      } else {
        // Add item, check if it has variants. If so, pre-select the first one by default.
        const item = menuItems.find((m) => m.id === id);
        if (item && item.variants && item.variants.length > 0) {
          const defaultVariantId = item.variants[0]!.id;
          setSelectedVariants((v) => ({ ...v, [id]: defaultVariantId }));
        }
        return [...prev, id];
      }
    });
  };

  const handleSelectVariant = (itemId: string, variantId: string) => {
    setSelectedVariants((prev) => ({
      ...prev,
      [itemId]: variantId,
    }));
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setDiscountPercent("");
    setFixedPrice("");
    setSelectedItemIds([]);
    setSelectedVariants({});
    setValidFrom(new Date().toISOString().split("T")[0]!);
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    setValidTo(d.toISOString().split("T")[0]!);
    setIsActive(true);
  };

  const handleEdit = (deal: Deal) => {
    setEditingId(deal.id);
    setTitle(deal.title);
    setDescription(deal.description);
    setDiscountPercent(deal.discountPercent ? String(deal.discountPercent) : "");
    setFixedPrice(deal.fixedPrice ? String(deal.fixedPrice) : "");
    setSelectedItemIds(deal.menuItemIds || []);
    setSelectedVariants(deal.selectedVariants || {});
    setValidFrom(deal.validFrom.split("T")[0]!);
    setValidTo(deal.validTo.split("T")[0]!);
    setIsActive(deal.isActive);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error("Title and description are required");
      return;
    }

    setSaving(true);
    try {
      const dealData: Omit<Deal, "id"> = {
        title,
        description,
        discountPercent: discountPercent ? Number(discountPercent) : undefined,
        fixedPrice: fixedPrice ? Number(fixedPrice) : undefined,
        menuItemIds: selectedItemIds,
        selectedVariants: selectedVariants,
        validFrom: new Date(validFrom).toISOString(),
        validTo: new Date(validTo + "T23:59:59.999Z").toISOString(),
        isActive,
      };

      if (editingId) {
        await dealsRepo.update(editingId, dealData);
        toast.success("Deal updated successfully");
      } else {
        await dealsRepo.create(dealData);
        toast.success("New deal created successfully");
      }
      
      const dList = await dealsRepo.getAll();
      setDeals(dList);
      resetForm();
    } catch (err) {
      toast.error("Failed to save deal");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this deal?")) return;
    try {
      await dealsRepo.delete(id);
      setDeals((prev) => prev.filter((d) => d.id !== id));
      toast.success("Deal deleted");
    } catch (err) {
      toast.error("Failed to delete deal");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Deals & Combos</h1>
        <p className="text-sm text-muted-foreground">
          Create special offers by picking one or multiple items and configuring specific sizes.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Deal Form */}
        <Card className="lg:col-span-1 h-fit shadow-sm">
          <CardHeader>
            <CardTitle>{editingId ? "Edit Deal" : "New Special Deal"}</CardTitle>
            <CardDescription>Specify the items, sizes/variants, pricing, and dates.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <Label>Deal Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Pizza & Burger Combo"
                  required
                />
              </div>

              <div>
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Medium Pizza & gourmet burger"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Discount %</Label>
                  <Input
                    type="number"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    placeholder="e.g. 20"
                  />
                </div>
                <div>
                  <Label>Fixed Price (Rs)</Label>
                  <Input
                    type="number"
                    value={fixedPrice}
                    onChange={(e) => setFixedPrice(e.target.value)}
                    placeholder="e.g. 1499"
                  />
                </div>
              </div>

              {/* Items and Variant selections */}
              <div>
                <Label className="block mb-2 font-bold">Select Products & Specific Pizza Sizes</Label>
                <div className="max-h-72 overflow-y-auto border rounded-xl p-3 space-y-3 bg-muted/10">
                  {menuItems.map((item) => {
                    const isSelected = selectedItemIds.includes(item.id);
                    const hasVariants = item.variants && item.variants.length > 0;
                    
                    return (
                      <div key={item.id} className={`p-2.5 rounded-lg border transition-colors ${isSelected ? "border-primary bg-background shadow-xs" : "bg-card hover:bg-accent/40"}`}>
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => handleSelectItem(item.id)}
                            className="flex items-center gap-2 text-left flex-1"
                          >
                            <div className={`h-4 w-4 rounded border flex items-center justify-center transition-all ${isSelected ? "bg-primary border-primary text-white" : "bg-background"}`}>
                              {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                            </div>
                            <div>
                              <span className="text-xs font-bold block">{item.name}</span>
                              <span className="text-[10px] text-muted-foreground">Base: Rs {item.price}</span>
                            </div>
                          </button>
                          {item.imageUrl && (
                            <img src={item.imageUrl} alt={item.name} className="h-8 w-8 rounded-md object-cover border" />
                          )}
                        </div>

                        {isSelected && hasVariants && (
                          <div className="mt-2.5 pt-2.5 border-t border-dashed space-y-1">
                            <span className="text-[9px] font-bold text-muted-foreground uppercase block">Select Pizza Size / Variant:</span>
                            <div className="flex flex-wrap gap-1">
                              {item.variants!.map((v) => {
                                const isVarSelected = selectedVariants[item.id] === v.id;
                                return (
                                  <button
                                    type="button"
                                    key={v.id}
                                    onClick={() => handleSelectVariant(item.id, v.id)}
                                    className={`text-[10px] px-2 py-1 rounded transition-colors ${isVarSelected ? "bg-primary text-primary-foreground font-black" : "bg-muted hover:bg-muted/80 text-muted-foreground"}`}
                                  >
                                    {v.name} (+{v.priceModifier})
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Selected items: {selectedItemIds.length}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valid From</Label>
                  <Input
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Valid To</Label>
                  <Input
                    type="date"
                    value={validTo}
                    onChange={(e) => setValidTo(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border bg-background"
                />
                <Label htmlFor="isActive" className="cursor-pointer text-xs font-semibold">Active & Visible to Customers</Label>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Save Changes" : "Create Deal"}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Existing Deals List */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle>Current Active & Draft Deals</CardTitle>
            <CardDescription>Deals are displayed on customer screen if active and within validity dates.</CardDescription>
          </CardHeader>
          <CardContent>
            {deals.length === 0 ? (
              <p className="text-center py-12 text-sm text-muted-foreground">No deals configured yet.</p>
            ) : (
              <div className="space-y-4">
                {deals.map((deal) => {
                  const dealItems = menuItems.filter((i) => deal.menuItemIds?.includes(i.id));
                  return (
                    <div
                      key={deal.id}
                      className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-xl gap-4 shadow-sm hover:border-primary/20 transition-all bg-card"
                    >
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-lg text-primary">{deal.title}</h3>
                          <Badge variant={deal.isActive ? "default" : "secondary"}>
                            {deal.isActive ? "Active" : "Inactive"}
                          </Badge>
                          {deal.discountPercent && (
                            <Badge variant="destructive">{deal.discountPercent}% OFF</Badge>
                          )}
                          {deal.fixedPrice && (
                            <Badge className="bg-emerald-600 text-white">Rs {deal.fixedPrice}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground font-semibold">{deal.description}</p>
                        
                        {dealItems.length > 0 && (
                          <div className="space-y-2 pt-2">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Included Products & Sizes:</span>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {dealItems.map((i) => {
                                const selectedVarId = deal.selectedVariants?.[i.id];
                                const selectedVarObj = i.variants?.find((v) => v.id === selectedVarId);
                                
                                return (
                                  <div key={i.id} className="flex items-center gap-3 p-1.5 border rounded-lg bg-muted/20">
                                    {i.imageUrl ? (
                                      <img src={i.imageUrl} alt={i.name} className="h-10 w-10 rounded-md object-cover border" />
                                    ) : (
                                      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center text-xs">🍔</div>
                                    )}
                                    <div className="min-w-0">
                                      <span className="text-xs font-bold block truncate">{i.name}</span>
                                      {selectedVarObj ? (
                                        <Badge className="bg-orange-100 text-orange-850 hover:bg-orange-150 border-orange-200 text-[9px] py-0 px-1.5 font-bold mt-0.5">
                                          Size: {selectedVarObj.name}
                                        </Badge>
                                      ) : (
                                        <span className="text-[9px] text-muted-foreground">Standard</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-1.5">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {new Date(deal.validFrom).toLocaleDateString()} to{" "}
                            {new Date(deal.validTo).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(deal)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(deal.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
