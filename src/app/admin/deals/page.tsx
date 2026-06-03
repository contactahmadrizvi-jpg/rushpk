"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, Edit2, Loader2, Calendar, Check, Tag,
  ShoppingBag, ChevronRight, BadgePercent, Sparkles, X,
  DollarSign, Package, ToggleLeft, ToggleRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { dealsRepo, getAvailableMenuItems } from "@/services/menu.service";
import type { MenuItem, Deal } from "@/types";
import { Badge } from "@/components/ui/badge";

/* ─── Step indicator ─── */
function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-all
      ${done ? "bg-primary text-white" : active ? "bg-primary/20 text-primary border-2 border-primary" : "bg-muted text-muted-foreground"}`}>
      {done ? <Check className="h-3.5 w-3.5" /> : n}
    </div>
  );
}

export default function AdminDealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().split("T")[0]!);
  const [validTo, setValidTo] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    return d.toISOString().split("T")[0]!;
  });
  const [isActive, setIsActive] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function init() {
      try {
        const [dList, mItems] = await Promise.all([dealsRepo.getAll(), getAvailableMenuItems()]);
        setDeals(dList);
        setMenuItems(mItems);
      } catch { toast.error("Failed to load data"); }
      finally { setLoading(false); }
    }
    init();
  }, []);

  const filteredItems = useMemo(() =>
    menuItems.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [menuItems, searchQuery]
  );

  const computedSubtotal = useMemo(() =>
    selectedItemIds.reduce((sum, id) => {
      const raw = itemPrices[id];
      if (raw && !isNaN(Number(raw))) return sum + Number(raw);
      const item = menuItems.find((m) => m.id === id);
      if (!item) return sum;
      const varId = selectedVariants[id];
      const mod = varId ? (item.variants?.find((v) => v.id === varId)?.priceModifier ?? 0) : 0;
      return sum + item.price + mod;
    }, 0), [selectedItemIds, itemPrices, selectedVariants, menuItems]);

  const discountedTotal = useMemo(() => {
    const pct = Number(discountPercent);
    return !discountPercent || isNaN(pct) ? computedSubtotal : Math.round(computedSubtotal * (1 - pct / 100));
  }, [computedSubtotal, discountPercent]);

  const handleSelectItem = useCallback((id: string) => {
    setSelectedItemIds((prev) => {
      if (prev.includes(id)) {
        setSelectedVariants((v) => { const u = { ...v }; delete u[id]; return u; });
        setItemPrices((p) => { const u = { ...p }; delete u[id]; return u; });
        return prev.filter((x) => x !== id);
      }
      const item = menuItems.find((m) => m.id === id);
      if (item?.variants?.length) {
        const defId = item.variants[0]!.id;
        setSelectedVariants((v) => ({ ...v, [id]: defId }));
      }
      return [...prev, id];
    });
  }, [menuItems]);

  const resetForm = () => {
    setEditingId(null); setTitle(""); setDescription("");
    setDiscountPercent(""); setSelectedItemIds([]);
    setSelectedVariants({}); setItemPrices({});
    setValidFrom(new Date().toISOString().split("T")[0]!);
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    setValidTo(d.toISOString().split("T")[0]!);
    setIsActive(true); setSearchQuery("");
  };

  const handleEdit = (deal: Deal) => {
    setEditingId(deal.id); setTitle(deal.title); setDescription(deal.description);
    setDiscountPercent(deal.discountPercent ? String(deal.discountPercent) : "");
    setSelectedItemIds(deal.menuItemIds || []);
    setSelectedVariants(deal.selectedVariants || {});
    const ps: Record<string, string> = {};
    if (deal.itemPrices) Object.entries(deal.itemPrices).forEach(([k, v]) => { ps[k] = String(v); });
    setItemPrices(ps);
    setValidFrom(deal.validFrom.split("T")[0]!);
    setValidTo(deal.validTo.split("T")[0]!);
    setIsActive(deal.isActive);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) { toast.error("Title and description required"); return; }
    if (selectedItemIds.length === 0) { toast.error("Select at least one product"); return; }
    setSaving(true);
    try {
      const numericPrices: Record<string, number> = {};
      Object.entries(itemPrices).forEach(([k, v]) => { if (v && !isNaN(Number(v))) numericPrices[k] = Number(v); });
      const payload: Omit<Deal, "id"> = {
        title, description,
        discountPercent: discountPercent ? Number(discountPercent) : undefined,
        fixedPrice: discountedTotal > 0 ? discountedTotal : undefined,
        menuItemIds: selectedItemIds, selectedVariants,
        itemPrices: Object.keys(numericPrices).length ? numericPrices : undefined,
        validFrom: new Date(validFrom).toISOString(),
        validTo: new Date(validTo + "T23:59:59.999Z").toISOString(),
        isActive,
      };
      if (editingId) { await dealsRepo.update(editingId, payload); toast.success("Deal updated!"); }
      else { await dealsRepo.create(payload); toast.success("Deal created!"); }
      const dList = await dealsRepo.getAll();
      setDeals(dList);
      resetForm();
    } catch { toast.error("Failed to save deal"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this deal?")) return;
    try {
      await dealsRepo.delete(id);
      setDeals((p) => p.filter((d) => d.id !== id));
      toast.success("Deal deleted");
    } catch { toast.error("Failed to delete"); }
  };

  const step1Done = title.trim().length > 0 && description.trim().length > 0;
  const step2Done = selectedItemIds.length > 0;

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-extrabold tracking-tight">Deals & Combos</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Create irresistible combo deals with custom per-item pricing. Total is calculated automatically.
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* ── FORM (left 2 cols) ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Step 1 – Deal Info */}
          <Card className={`shadow-sm border-2 transition-colors ${step1Done ? "border-primary/20" : "border-border"}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <StepBadge n={1} active={!step1Done} done={step1Done} />
                <div>
                  <CardTitle className="text-base">Deal Information</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Name and describe this deal</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Deal Title *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Pizza & Burger Combo"
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Description *</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Medium pizza + gourmet burger"
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <BadgePercent className="h-3 w-3" /> Discount % (optional)
                </Label>
                <Input
                  type="number" min="0" max="100"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="e.g. 20"
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Step 2 – Products */}
          <Card className={`shadow-sm border-2 transition-colors ${step2Done ? "border-primary/20" : "border-border"}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <StepBadge n={2} active={step1Done && !step2Done} done={step2Done} />
                <div>
                  <CardTitle className="text-base">Select Products</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Pick items and set deal prices</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="🔍 Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 text-sm"
              />

              <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
                {filteredItems.map((item) => {
                  const isSelected = selectedItemIds.includes(item.id);
                  const hasVariants = item.variants && item.variants.length > 0;
                  const varId = selectedVariants[item.id];
                  const varObj = item.variants?.find((v) => v.id === varId);
                  const defaultPrice = item.price + (varObj?.priceModifier ?? 0);

                  return (
                    <div key={item.id}
                      className={`rounded-xl border-2 transition-all overflow-hidden
                        ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-transparent bg-muted/30 hover:border-muted-foreground/20 hover:bg-muted/50"}`}>
                      {/* Row */}
                      <button type="button" onClick={() => handleSelectItem(item.id)}
                        className="flex items-center gap-3 w-full p-2.5 text-left">
                        <div className={`h-5 w-5 rounded flex items-center justify-center shrink-0 transition-all
                          ${isSelected ? "bg-primary text-white" : "bg-background border-2 border-muted-foreground/30"}`}>
                          {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt={item.name} className="h-9 w-9 rounded-lg object-cover shrink-0 border" />
                          : <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-xl shrink-0">🍔</div>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{item.name}</p>
                          <p className="text-[10px] text-muted-foreground">Base: Rs {item.price}</p>
                        </div>
                        {isSelected && <span className="text-[10px] text-primary font-bold shrink-0">✓ Added</span>}
                      </button>

                      {/* Expanded: variant + price */}
                      {isSelected && (
                        <div className="px-3 pb-3 pt-0 space-y-2 border-t border-primary/10">
                          {hasVariants && (
                            <div>
                              <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Size / Variant</p>
                              <div className="flex flex-wrap gap-1.5">
                                {item.variants!.map((v) => {
                                  const isV = selectedVariants[item.id] === v.id;
                                  return (
                                    <button type="button" key={v.id}
                                      onClick={() => setSelectedVariants((prev) => ({ ...prev, [item.id]: v.id }))}
                                      className={`text-[10px] px-2.5 py-1 rounded-lg font-bold transition-all
                                        ${isV ? "bg-primary text-white shadow-sm" : "bg-background border hover:border-primary/40 text-muted-foreground"}`}>
                                      {v.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <div>
                            <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider mb-1">
                              Deal Price (PKR) — default Rs {defaultPrice}
                            </p>
                            <Input
                              type="number" min="0"
                              placeholder={`Rs ${defaultPrice}`}
                              value={itemPrices[item.id] ?? ""}
                              onChange={(e) => setItemPrices((p) => ({ ...p, [item.id]: e.target.value }))}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredItems.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-6">No products found.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Step 3 – Price Summary */}
          {selectedItemIds.length > 0 && (
            <Card className="shadow-sm border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <StepBadge n={3} active done={step2Done} />
                  <div>
                    <CardTitle className="text-base">Price Summary</CardTitle>
                    <CardDescription className="text-xs mt-0.5">Live total calculated from your items</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {selectedItemIds.map((id) => {
                    const item = menuItems.find((m) => m.id === id);
                    if (!item) return null;
                    const varId = selectedVariants[id];
                    const varObj = item.variants?.find((v) => v.id === varId);
                    const raw = itemPrices[id];
                    const price = raw && !isNaN(Number(raw)) ? Number(raw) : item.price + (varObj?.priceModifier ?? 0);
                    return (
                      <div key={id} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {item.imageUrl
                            ? <img src={item.imageUrl} alt={item.name} className="h-5 w-5 rounded object-cover border shrink-0" />
                            : <span className="text-base shrink-0">🍔</span>}
                          <span className="font-semibold truncate">{item.name}</span>
                          {varObj && <span className="text-muted-foreground shrink-0">({varObj.name})</span>}
                        </div>
                        <span className="font-black shrink-0 text-foreground">Rs {price}</span>
                      </div>
                    );
                  })}
                  <div className="border-t pt-2 mt-2 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-bold">Rs {computedSubtotal}</span>
                    </div>
                    {discountPercent && !isNaN(Number(discountPercent)) && (
                      <div className="flex justify-between text-xs text-emerald-600">
                        <span>Discount ({discountPercent}%)</span>
                        <span className="font-bold">− Rs {computedSubtotal - discountedTotal}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center font-black text-lg text-primary pt-1 border-t">
                      <span className="text-sm">Deal Total</span>
                      <span>Rs {discountedTotal}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4 – Schedule & Publish */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <StepBadge n={4} active={step1Done && step2Done} done={false} />
                <div>
                  <CardTitle className="text-base">Schedule & Publish</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Set validity dates and go live</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">From</Label>
                    <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="mt-1" required />
                  </div>
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Until</Label>
                    <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} className="mt-1" required />
                  </div>
                </div>

                {/* Active toggle */}
                <button
                  type="button"
                  onClick={() => setIsActive((v) => !v)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 transition-all font-semibold text-sm
                    ${isActive ? "border-primary bg-primary/5 text-primary" : "border-border bg-muted/30 text-muted-foreground"}`}>
                  <div className="flex items-center gap-2">
                    {isActive
                      ? <ToggleRight className="h-5 w-5" />
                      : <ToggleLeft className="h-5 w-5" />}
                    <span>{isActive ? "Active — visible to customers" : "Inactive — hidden from customers"}</span>
                  </div>
                  <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "ON" : "OFF"}</Badge>
                </button>

                <div className="flex gap-2">
                  <Button type="submit" className="flex-1 font-bold gap-2" disabled={saving || !step1Done || !step2Done}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {editingId ? "Save Changes" : "Create Deal"}
                  </Button>
                  {editingId && (
                    <Button type="button" variant="outline" onClick={resetForm} className="gap-1.5">
                      <X className="h-4 w-4" /> Cancel
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ── DEALS LIST (right 3 cols) ── */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-extrabold">All Deals <span className="text-muted-foreground font-normal text-sm ml-1">({deals.length})</span></h2>
          </div>

          {deals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 rounded-2xl border-2 border-dashed text-center">
              <ShoppingBag className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="font-bold text-muted-foreground">No deals yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create your first deal using the form.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {deals.map((deal) => {
                const dealItems = menuItems.filter((i) => deal.menuItemIds?.includes(i.id));
                const dealTotal = dealItems.reduce((sum, i) => {
                  const custom = deal.itemPrices?.[i.id];
                  if (custom !== undefined) return sum + custom;
                  const varId = deal.selectedVariants?.[i.id];
                  const mod = varId ? (i.variants?.find((v) => v.id === varId)?.priceModifier ?? 0) : 0;
                  return sum + i.price + mod;
                }, 0);
                const finalPrice = deal.discountPercent
                  ? Math.round(dealTotal * (1 - deal.discountPercent / 100))
                  : (deal.fixedPrice ?? dealTotal);

                return (
                  <div key={deal.id}
                    className="group rounded-2xl border-2 bg-card shadow-sm hover:shadow-md hover:border-primary/20 transition-all overflow-hidden">
                    {/* Header strip */}
                    <div className={`h-1.5 w-full ${deal.isActive ? "bg-gradient-to-r from-primary via-primary/70 to-primary/30" : "bg-muted"}`} />
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-extrabold text-lg leading-tight text-primary">{deal.title}</h3>
                            <Badge variant={deal.isActive ? "default" : "secondary"} className="text-[10px]">
                              {deal.isActive ? "Active" : "Inactive"}
                            </Badge>
                            {deal.discountPercent && (
                              <Badge variant="destructive" className="text-[10px] gap-1">
                                <BadgePercent className="h-2.5 w-2.5" /> {deal.discountPercent}% OFF
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{deal.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-2xl font-black text-primary">Rs {finalPrice}</p>
                          {deal.discountPercent && dealTotal !== finalPrice && (
                            <p className="text-xs text-muted-foreground line-through">Rs {dealTotal}</p>
                          )}
                        </div>
                      </div>

                      {/* Item image strip */}
                      {dealItems.length > 0 && (
                        <div className="mt-4">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2">Included Products</p>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {dealItems.map((i) => {
                              const varId = deal.selectedVariants?.[i.id];
                              const varObj = i.variants?.find((v) => v.id === varId);
                              const price = deal.itemPrices?.[i.id] ?? (i.price + (varObj?.priceModifier ?? 0));
                              return (
                                <div key={i.id} className="flex-shrink-0 w-20 rounded-xl overflow-hidden border bg-muted/20 text-center">
                                  {i.imageUrl
                                    ? <img src={i.imageUrl} alt={i.name} className="h-14 w-full object-cover" />
                                    : <div className="h-14 w-full bg-muted flex items-center justify-center text-2xl">🍔</div>}
                                  <div className="p-1.5">
                                    <p className="text-[9px] font-bold truncate">{i.name}</p>
                                    {varObj && <p className="text-[8px] text-muted-foreground">{varObj.name}</p>}
                                    <p className="text-[9px] font-black text-primary">Rs {price}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mt-4 flex items-center justify-between">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" />
                          {new Date(deal.validFrom).toLocaleDateString()} → {new Date(deal.validTo).toLocaleDateString()}
                        </p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleEdit(deal)} className="h-8 gap-1.5">
                            <Edit2 className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(deal.id)} className="h-8">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
