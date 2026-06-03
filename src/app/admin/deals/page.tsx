"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Loader2, Calendar, Check, Tag, ShoppingBag } from "lucide-react";
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
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({}); // menuItemId -> custom price string
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

  // Live total from per-item prices
  const computedTotal = useMemo(() => {
    return selectedItemIds.reduce((sum, id) => {
      const rawPrice = itemPrices[id];
      if (rawPrice && !isNaN(Number(rawPrice))) return sum + Number(rawPrice);
      // fallback to item base price + variant modifier if no custom price set
      const item = menuItems.find((m) => m.id === id);
      if (!item) return sum;
      const varId = selectedVariants[id];
      const modifier = varId ? (item.variants?.find((v) => v.id === varId)?.priceModifier ?? 0) : 0;
      return sum + item.price + modifier;
    }, 0);
  }, [selectedItemIds, itemPrices, selectedVariants, menuItems]);

  const discountedTotal = useMemo(() => {
    if (!discountPercent || isNaN(Number(discountPercent))) return computedTotal;
    return Math.round(computedTotal * (1 - Number(discountPercent) / 100));
  }, [computedTotal, discountPercent]);

  const handleSelectItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const exists = prev.includes(id);
      if (exists) {
        setSelectedVariants((v) => { const u = { ...v }; delete u[id]; return u; });
        setItemPrices((p) => { const u = { ...p }; delete u[id]; return u; });
        return prev.filter((x) => x !== id);
      } else {
        const item = menuItems.find((m) => m.id === id);
        if (item?.variants?.length) {
          const defaultVariantId = item.variants[0]!.id;
          setSelectedVariants((v) => ({ ...v, [id]: defaultVariantId }));
        }
        return [...prev, id];
      }
    });
  };

  const handleSelectVariant = (itemId: string, variantId: string) => {
    setSelectedVariants((prev) => ({ ...prev, [itemId]: variantId }));
  };

  const handleItemPrice = (itemId: string, value: string) => {
    setItemPrices((prev) => ({ ...prev, [itemId]: value }));
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setDiscountPercent("");
    setSelectedItemIds([]);
    setSelectedVariants({});
    setItemPrices({});
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
    setSelectedItemIds(deal.menuItemIds || []);
    setSelectedVariants(deal.selectedVariants || {});
    const priceStrings: Record<string, string> = {};
    if (deal.itemPrices) {
      Object.entries(deal.itemPrices).forEach(([k, v]) => { priceStrings[k] = String(v); });
    }
    setItemPrices(priceStrings);
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
      const numericItemPrices: Record<string, number> = {};
      Object.entries(itemPrices).forEach(([k, v]) => {
        if (v && !isNaN(Number(v))) numericItemPrices[k] = Number(v);
      });

      const dealData: Omit<Deal, "id"> = {
        title,
        description,
        discountPercent: discountPercent ? Number(discountPercent) : undefined,
        fixedPrice: discountedTotal > 0 ? discountedTotal : undefined,
        menuItemIds: selectedItemIds,
        selectedVariants,
        itemPrices: Object.keys(numericItemPrices).length ? numericItemPrices : undefined,
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
          Create special offers with custom per-item pricing. The total is calculated automatically.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Deal Form */}
        <Card className="lg:col-span-1 h-fit shadow-sm">
          <CardHeader>
            <CardTitle>{editingId ? "Edit Deal" : "New Special Deal"}</CardTitle>
            <CardDescription>Set per-item deal prices — the total is calculated live.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <Label>Deal Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pizza & Burger Combo" required />
              </div>

              <div>
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Medium Pizza & gourmet burger" required />
              </div>

              <div>
                <Label>Discount % (optional)</Label>
                <Input type="number" min="0" max="100" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="e.g. 20" />
              </div>

              {/* Items, variant & per-item price selection */}
              <div>
                <Label className="block mb-2 font-bold">Select Products & Set Prices</Label>
                <div className="max-h-80 overflow-y-auto border rounded-xl p-3 space-y-3 bg-muted/10">
                  {menuItems.map((item) => {
                    const isSelected = selectedItemIds.includes(item.id);
                    const hasVariants = item.variants && item.variants.length > 0;
                    const varId = selectedVariants[item.id];
                    const varObj = item.variants?.find((v) => v.id === varId);
                    const defaultPrice = item.price + (varObj?.priceModifier ?? 0);

                    return (
                      <div key={item.id} className={`p-2.5 rounded-lg border transition-colors ${isSelected ? "border-primary bg-background shadow-sm" : "bg-card hover:bg-accent/40"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <button type="button" onClick={() => handleSelectItem(item.id)} className="flex items-center gap-2 text-left flex-1 min-w-0">
                            <div className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-all ${isSelected ? "bg-primary border-primary text-white" : "bg-background"}`}>
                              {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-bold block truncate">{item.name}</span>
                              <span className="text-[10px] text-muted-foreground">Base: Rs {item.price}</span>
                            </div>
                          </button>
                          {item.imageUrl && (
                            <img src={item.imageUrl} alt={item.name} className="h-8 w-8 rounded-md object-cover border shrink-0" />
                          )}
                        </div>

                        {isSelected && (
                          <div className="mt-2.5 pt-2.5 border-t border-dashed space-y-2">
                            {hasVariants && (
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase block">Size / Variant:</span>
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
                                        {v.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            <div className="space-y-1">
                              <span className="text-[9px] font-bold text-muted-foreground uppercase block">Deal Price (PKR):</span>
                              <Input
                                type="number"
                                min="0"
                                placeholder={`Default: Rs ${defaultPrice}`}
                                value={itemPrices[item.id] ?? ""}
                                onChange={(e) => handleItemPrice(item.id, e.target.value)}
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Selected: {selectedItemIds.length} item(s)</p>
              </div>

              {/* Live total */}
              {selectedItemIds.length > 0 && (
                <div className="rounded-xl border bg-muted/30 p-3 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="font-bold">Rs {computedTotal}</span>
                  </div>
                  {discountPercent && !isNaN(Number(discountPercent)) && (
                    <div className="flex items-center justify-between text-xs text-red-600">
                      <span>Discount ({discountPercent}%)</span>
                      <span className="font-bold">− Rs {computedTotal - discountedTotal}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm font-black border-t pt-1 mt-1">
                    <span>Deal Total</span>
                    <span className="text-primary text-base">Rs {discountedTotal}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valid From</Label>
                  <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} required />
                </div>
                <div>
                  <Label>Valid To</Label>
                  <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} required />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" id="isActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border bg-background" />
                <Label htmlFor="isActive" className="cursor-pointer text-xs font-semibold">Active & Visible to Customers</Label>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Save Changes" : "Create Deal"}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
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
                  const dealTotal = dealItems.reduce((sum, i) => {
                    const custom = deal.itemPrices?.[i.id];
                    if (custom !== undefined) return sum + custom;
                    const varId = deal.selectedVariants?.[i.id];
                    const modifier = varId ? (i.variants?.find((v) => v.id === varId)?.priceModifier ?? 0) : 0;
                    return sum + i.price + modifier;
                  }, 0);
                  const dealFinalPrice = deal.discountPercent
                    ? Math.round(dealTotal * (1 - deal.discountPercent / 100))
                    : (deal.fixedPrice ?? dealTotal);

                  return (
                    <div key={deal.id} className="flex flex-col md:flex-row md:items-start justify-between p-4 border rounded-xl gap-4 shadow-sm hover:border-primary/20 transition-all bg-card">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-lg text-primary">{deal.title}</h3>
                          <Badge variant={deal.isActive ? "default" : "secondary"}>{deal.isActive ? "Active" : "Inactive"}</Badge>
                          {deal.discountPercent && <Badge variant="destructive">{deal.discountPercent}% OFF</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground font-semibold">{deal.description}</p>

                        {/* Item images carousel strip */}
                        {dealItems.length > 0 && (
                          <div className="space-y-2 pt-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Included Products:</span>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {dealItems.map((i) => {
                                const selectedVarId = deal.selectedVariants?.[i.id];
                                const selectedVarObj = i.variants?.find((v) => v.id === selectedVarId);
                                const customPrice = deal.itemPrices?.[i.id];
                                const itemPrice = customPrice ?? (i.price + (selectedVarObj?.priceModifier ?? 0));
                                return (
                                  <div key={i.id} className="flex-shrink-0 w-24 rounded-xl border bg-muted/20 overflow-hidden text-center">
                                    {i.imageUrl ? (
                                      <img src={i.imageUrl} alt={i.name} className="h-16 w-full object-cover" />
                                    ) : (
                                      <div className="h-16 w-full bg-muted flex items-center justify-center text-xl">🍔</div>
                                    )}
                                    <div className="p-1.5">
                                      <p className="text-[9px] font-bold truncate">{i.name}</p>
                                      {selectedVarObj && <p className="text-[8px] text-muted-foreground">{selectedVarObj.name}</p>}
                                      <p className="text-[9px] font-black text-primary">Rs {itemPrice}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex items-center justify-between text-xs border-t pt-1.5">
                              <span className="text-muted-foreground font-semibold">Deal Total</span>
                              <span className="font-black text-primary text-sm">Rs {dealFinalPrice}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-1">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(deal.validFrom).toLocaleDateString()} to {new Date(deal.validTo).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-start">
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
