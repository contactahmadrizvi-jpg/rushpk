"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FoodCard } from "@/components/customer/food-card";
import { ItemCustomizeDialog } from "@/components/customer/item-customize-dialog";
import { getActiveCategories, subscribeMenuItems } from "@/services/menu.service";
import { useCartStore } from "@/stores/cart-store";
import type { MenuCategory, MenuItem } from "@/types";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { toast } from "sonner";

function MenuContent() {
  const params = useSearchParams();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categorySlug, setCategorySlug] = useState(params.get("category") ?? "all");
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    if (!isFirebaseConfigured()) { setLoading(false); return; }
    getActiveCategories().then(setCategories);
    const unsub = subscribeMenuItems((data) => {
      setItems(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    let list = items;
    if (categorySlug !== "all") {
      const cat = categories.find((c) => c.slug === categorySlug);
      if (cat) list = list.filter((i) => i.categoryId === cat.id);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    return list;
  }, [items, categories, categorySlug, search]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold">Our Menu</h1>
      <div className="mt-6 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search pizza, burger..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCategorySlug("all")} className={`rounded-full px-4 py-2 text-sm font-medium ${categorySlug === "all" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>All</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setCategorySlug(c.slug)} className={`rounded-full px-4 py-2 text-sm font-medium ${categorySlug === c.slug ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{c.name}</button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="mt-12 text-center text-muted-foreground">No items found. Add menu in Admin Dashboard.</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <FoodCard 
              key={item.id} 
              item={item} 
              onAdd={(variantId) => {
                const custom: any = {};
                if (variantId && item.variants) {
                  const v = item.variants.find((x) => x.id === variantId);
                  if (v) {
                    custom.variantId = v.id;
                    custom.variantName = v.name;
                  }
                }
                addItem(item, 1, custom);
                toast.success(`Added ${item.name} to cart`);
              }} 
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MenuPage() {
  return (
    <Suspense fallback={<div className="p-8"><Skeleton className="h-96 w-full" /></div>}>
      <MenuContent />
    </Suspense>
  );
}
