"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Loader2, Calendar } from "lucide-react";
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
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setDiscountPercent("");
    setFixedPrice("");
    setSelectedItemIds([]);
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
      
      // Reload deals list
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
          Create special offers by picking one or multiple items.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Deal Creation / Editing Form */}
        <Card className="lg:col-span-1 h-fit shadow-sm">
          <CardHeader>
            <CardTitle>{editingId ? "Edit Deal" : "New Special Deal"}</CardTitle>
            <CardDescription>Specify the items, pricing, and active dates.</CardDescription>
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
                  placeholder="e.g. Buy 1 Large Pizza & Get 1 Burger Free"
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

              {/* Multiple Item Selection */}
              <div>
                <Label className="block mb-2 font-semibold">Included Items (Select one or multiple)</Label>
                <div className="max-h-48 overflow-y-auto border rounded-lg p-2.5 space-y-1 bg-muted/20">
                  {menuItems.map((item) => {
                    const isSelected = selectedItemIds.includes(item.id);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => handleSelectItem(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "hover:bg-accent text-left"
                        }`}
                      >
                        <span>{item.name}</span>
                        <span className={isSelected ? "text-primary-foreground" : "text-muted-foreground"}>
                          Rs {item.price}
                        </span>
                      </button>
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
                <Label htmlFor="isActive" className="cursor-pointer">Active and Visible to Customers</Label>
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
                      <div className="space-y-2">
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
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground">Includes:</span>
                            {dealItems.map((i) => (
                              <Badge key={i.id} variant="outline" className="text-[10px]">
                                {i.name}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-1">
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
