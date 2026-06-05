"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  Trash2, Edit2, Loader2, Check,
  BadgePercent, Sparkles, X,
  ShoppingBag, ToggleLeft, ToggleRight, Search
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
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
      const qty = itemQuantities[id] ?? 1;
      const raw = itemPrices[id];
      if (raw && !isNaN(Number(raw))) return sum + Number(raw) * qty;
      const item = menuItems.find((m) => m.id === id);
      if (!item) return sum;
      const varId = selectedVariants[id];
      const mod = varId ? (item.variants?.find((v) => v.id === varId)?.priceModifier ?? 0) : 0;
      return sum + (item.price + mod) * qty;
    }, 0), [selectedItemIds, itemPrices, itemQuantities, selectedVariants, menuItems]);

  const discountedTotal = useMemo(() => {
    const pct = Number(discountPercent);
    return !discountPercent || isNaN(pct) ? computedSubtotal : Math.round(computedSubtotal * (1 - pct / 100));
  }, [computedSubtotal, discountPercent]);

  const handleSelectItem = useCallback((id: string) => {
    setSelectedItemIds((prev) => {
      if (prev.includes(id)) {
        setSelectedVariants((v) => { const u = { ...v }; delete u[id]; return u; });
        setItemPrices((p) => { const u = { ...p }; delete u[id]; return u; });
        setItemQuantities((q) => { const u = { ...q }; delete u[id]; return u; });
        return prev.filter((x) => x !== id);
      }
      const item = menuItems.find((m) => m.id === id);
      if (item?.variants?.length) {
        setSelectedVariants((v) => ({ ...v, [id]: item.variants![0]!.id }));
      }
      setItemQuantities((q) => ({ ...q, [id]: q[id] ?? 1 }));
      return [...prev, id];
    });
  }, [menuItems]);

  const resetForm = () => {
    setEditingId(null); setTitle(""); setDescription("");
    setDiscountPercent(""); setSelectedItemIds([]);
    setSelectedVariants({}); setItemPrices({}); setItemQuantities({});
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
    const qs: Record<string, number> = {};
    if (deal.itemQuantities) Object.entries(deal.itemQuantities).forEach(([k, v]) => { qs[k] = v; });
    setItemQuantities(qs);
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
      const numericQuantities: Record<string, number> = {};
      selectedItemIds.forEach((id) => { numericQuantities[id] = itemQuantities[id] ?? 1; });
      // Use far-future dates so deals never expire
      const payload: Omit<Deal, "id"> = {
        title, description,
        discountPercent: discountPercent ? Number(discountPercent) : undefined,
        fixedPrice: discountedTotal > 0 ? discountedTotal : undefined,
        menuItemIds: selectedItemIds, selectedVariants,
        itemPrices: Object.keys(numericPrices).length ? numericPrices : undefined,
        itemQuantities: numericQuantities,
        validFrom: "2000-01-01T00:00:00.000Z",
        validTo: "2100-12-31T23:59:59.999Z",
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
      {/* ── Page Header ── */}
      <div className="flex items-center gap-3">
        <Sparkles className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Deals &amp; Combos</h1>
          <p className="text-sm text-muted-foreground">Create combo deals with custom per-item pricing — total calculated live.</p>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          DEAL FORM  (full width, stacked sections)
      ══════════════════════════════════════════ */}
      <form onSubmit={handleSave}>
        <div className="space-y-5">

          {/* ── Step 1: Deal Info + Settings (side by side) ── */}
          <div className="grid gap-5 md:grid-cols-2">

            {/* Deal Info */}
            <Card className={`border-2 transition-colors ${step1Done ? "border-primary/30" : "border-border"}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <StepBadge n={1} active={!step1Done} done={step1Done} />
                  <div>
                    <CardTitle className="text-base">Deal Information</CardTitle>
                    <CardDescription className="text-xs">Name, description and discount</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Deal Title *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Pizza & Burger Combo" className="mt-1" required />
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Description *</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Medium pizza + gourmet burger" className="mt-1" required />
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <BadgePercent className="h-3 w-3" /> Discount % (optional)
                  </Label>
                  <Input type="number" min="0" max="100" value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)} placeholder="e.g. 20" className="mt-1" />
                </div>
              </CardContent>
            </Card>

            {/* Publish Settings */}
            <Card className="border-2 border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <StepBadge n={3} active={step1Done && step2Done} done={false} />
                  <div>
                    <CardTitle className="text-base">Publish Settings</CardTitle>
                    <CardDescription className="text-xs">Toggle deal visibility for customers</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <button type="button" onClick={() => setIsActive((v) => !v)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 transition-all font-semibold text-sm
                    ${isActive ? "border-primary bg-primary/5 text-primary" : "border-border bg-muted/30 text-muted-foreground"}`}>
                  <div className="flex items-center gap-2">
                    {isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    <span>{isActive ? "Active — visible to customers" : "Inactive — hidden from customers"}</span>
                  </div>
                  <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "ON" : "OFF"}</Badge>
                </button>

                {/* Live Price Summary (shown when items selected) */}
                {selectedItemIds.length > 0 && (
                  <div className="rounded-xl border bg-muted/20 p-3 space-y-1.5">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Live Price Summary</p>
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
                              ? <img src={item.imageUrl} alt={item.name} className="h-4 w-4 rounded object-cover border shrink-0" />
                              : <span className="shrink-0">🍔</span>}
                            <span className="font-semibold truncate">{item.name}</span>
                            {varObj && <span className="text-muted-foreground shrink-0 text-[10px]">({varObj.name})</span>}
                          </div>
                          <span className="font-black shrink-0">Rs {price}</span>
                        </div>
                      );
                    })}
                    <div className="border-t pt-2 space-y-0.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Subtotal</span><span className="font-bold">Rs {computedSubtotal}</span>
                      </div>
                      {discountPercent && !isNaN(Number(discountPercent)) && (
                        <div className="flex justify-between text-xs text-emerald-600">
                          <span>Discount ({discountPercent}%)</span>
                          <span className="font-bold">− Rs {computedSubtotal - discountedTotal}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center font-black text-primary pt-0.5 border-t">
                        <span className="text-xs">Deal Total</span>
                        <span className="text-lg">Rs {discountedTotal}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
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
              </CardContent>
            </Card>
          </div>

          {/* ── Step 2: Select Products (full width, big grid) ── */}
          <Card className={`border-2 transition-colors ${step2Done ? "border-primary/30" : "border-border"}`}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <StepBadge n={2} active={step1Done && !step2Done} done={step2Done} />
                  <div>
                    <CardTitle className="text-base">Select Products &amp; Set Prices</CardTitle>
                    <CardDescription className="text-xs">Click a product to add it — then choose size &amp; set deal price</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {selectedItemIds.length > 0 && (
                    <Badge variant="default" className="gap-1 font-bold">
                      <Check className="h-3 w-3" /> {selectedItemIds.length} selected
                    </Badge>
                  )}
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search products..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 w-52 text-sm"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Grid of product cards */}
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {filteredItems.map((item) => {
                  const isSelected = selectedItemIds.includes(item.id);
                  const hasVariants = item.variants && item.variants.length > 0;
                  const varId = selectedVariants[item.id];
                  const varObj = item.variants?.find((v) => v.id === varId);
                  const defaultPrice = item.price + (varObj?.priceModifier ?? 0);

                  return (
                    <div key={item.id}
                      className={`rounded-2xl border-2 transition-all overflow-hidden flex flex-col
                        ${isSelected
                          ? "border-primary shadow-md shadow-primary/10 bg-primary/5"
                          : "border-border bg-card hover:border-primary/30 hover:shadow-sm"}`}>

                      {/* Image area */}
                      <div className="relative">
                        <button type="button" onClick={() => handleSelectItem(item.id)} className="block w-full">
                          {item.imageUrl
                            ? <img src={item.imageUrl} alt={item.name} className="h-28 w-full object-cover" />
                            : <div className="h-28 w-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center text-4xl">🍔</div>}
                          <div className={`absolute inset-0 transition-colors ${isSelected ? "bg-primary/10" : "bg-transparent hover:bg-black/5"}`} />
                        </button>

                        {/* Selection checkmark */}
                        <div className={`absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center border-2 transition-all
                          ${isSelected ? "bg-primary border-primary text-white shadow-md" : "bg-white/90 border-white/60 text-transparent"}`}>
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-3 flex flex-col flex-1 gap-2">
                        <div>
                          <button type="button" onClick={() => handleSelectItem(item.id)} className="text-left w-full">
                            <p className={`text-sm font-extrabold leading-tight ${isSelected ? "text-primary" : ""}`}>{item.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Base price: Rs {item.price}</p>
                          </button>
                        </div>

                        {/* Expanded controls when selected */}
                        {isSelected && (
                          <div className="space-y-2 pt-2 border-t border-primary/10">
                            {hasVariants && (
                              <div>
                                <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5">Size / Variant</p>
                                <div className="flex flex-wrap gap-1">
                                  {item.variants!.map((v) => {
                                    const isV = selectedVariants[item.id] === v.id;
                                    return (
                                      <button type="button" key={v.id}
                                        onClick={() => setSelectedVariants((prev) => ({ ...prev, [item.id]: v.id }))}
                                        className={`text-[10px] px-2 py-0.5 rounded-lg font-bold transition-all border
                                          ${isV ? "bg-primary text-white border-primary" : "bg-background border-border hover:border-primary/50 text-muted-foreground"}`}>
                                        {v.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Deal Price (PKR)</p>
                                <Input
                                  type="number" min="0"
                                  placeholder={`Default Rs ${defaultPrice}`}
                                  value={itemPrices[item.id] ?? ""}
                                  onChange={(e) => setItemPrices((p) => ({ ...p, [item.id]: e.target.value }))}
                                  className="h-8 text-xs font-bold"
                                />
                              </div>
                              <div>
                                <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Quantity</p>
                                <Input
                                  type="number" min="1"
                                  value={itemQuantities[item.id] ?? 1}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                    setItemQuantities((q) => ({ ...q, [item.id]: val }));
                                  }}
                                  className="h-8 text-xs font-bold"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Search className="h-10 w-10 text-muted-foreground/30 mb-2" />
                  <p className="text-sm font-semibold text-muted-foreground">No products match your search</p>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </form>

      {/* ══════════════════════════════════════════
          EXISTING DEALS LIST
      ══════════════════════════════════════════ */}
      <div>
        <h2 className="text-xl font-extrabold mb-4">
          All Deals <span className="text-muted-foreground font-normal text-sm ml-1">({deals.length})</span>
        </h2>

        {deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 rounded-2xl border-2 border-dashed text-center">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="font-bold text-muted-foreground">No deals yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first deal using the form above.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {deals.map((deal) => {
              const dealItems = menuItems.filter((i) => deal.menuItemIds?.includes(i.id));
              const dealTotal = dealItems.reduce((sum, i) => {
                const custom = deal.itemPrices?.[i.id];
                const qty = deal.itemQuantities?.[i.id] ?? 1;
                const price = custom !== undefined
                  ? custom
                  : i.price + (deal.selectedVariants?.[i.id] ? (i.variants?.find((v) => v.id === deal.selectedVariants?.[i.id])?.priceModifier ?? 0) : 0);
                return sum + price * qty;
              }, 0);
              const finalPrice = deal.discountPercent
                ? Math.round(dealTotal * (1 - deal.discountPercent / 100))
                : (deal.fixedPrice ?? dealTotal);

              return (
                <div key={deal.id}
                  className="group rounded-2xl border-2 bg-card shadow-sm hover:shadow-md hover:border-primary/20 transition-all overflow-hidden">
                  <div className={`h-1.5 w-full ${deal.isActive ? "bg-gradient-to-r from-primary via-primary/70 to-primary/30" : "bg-muted"}`} />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-extrabold text-base text-primary truncate">{deal.title}</h3>
                          <Badge variant={deal.isActive ? "default" : "secondary"} className="text-[10px] shrink-0">
                            {deal.isActive ? "Active" : "Inactive"}
                          </Badge>
                          {deal.discountPercent && (
                            <Badge variant="destructive" className="text-[10px] gap-1 shrink-0">
                              <BadgePercent className="h-2.5 w-2.5" /> {deal.discountPercent}% OFF
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{deal.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-black text-primary">Rs {finalPrice}</p>
                        {deal.discountPercent && dealTotal !== finalPrice && (
                          <p className="text-xs text-muted-foreground line-through">Rs {dealTotal}</p>
                        )}
                      </div>
                    </div>

                    {/* Item image thumbnails */}
                    {dealItems.length > 0 && (
                      <div>
                        <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider mb-2">Products</p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {dealItems.map((i) => {
                            const varId = deal.selectedVariants?.[i.id];
                            const varObj = i.variants?.find((v) => v.id === varId);
                            const qty = deal.itemQuantities?.[i.id] ?? 1;
                            const unitPrice = deal.itemPrices?.[i.id] ?? (i.price + (varObj?.priceModifier ?? 0));
                            const price = unitPrice * qty;
                            return (
                              <div key={i.id} className="flex-shrink-0 w-20 rounded-xl overflow-hidden border bg-muted/20 text-center">
                                {i.imageUrl
                                  ? <img src={i.imageUrl} alt={i.name} className="h-14 w-full object-cover" />
                                  : <div className="h-14 w-full bg-muted flex items-center justify-center text-2xl">🍔</div>}
                                <div className="p-1.5">
                                  <p className="text-[9px] font-bold truncate">
                                    {qty > 1 && <span className="text-primary font-black mr-0.5">{qty}x</span>}
                                    {i.name}
                                  </p>
                                  {varObj && <p className="text-[8px] text-muted-foreground">{varObj.name}</p>}
                                  <p className="text-[9px] font-black text-primary">Rs {price}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-end border-t pt-3">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(deal)} className="h-7 text-xs gap-1">
                          <Edit2 className="h-3 w-3" /> Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(deal.id)} className="h-7">
                          <Trash2 className="h-3 w-3" />
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
  );
}
