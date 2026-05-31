"use client";

import { useEffect, useState } from "react";
import { getActiveDeals, getAvailableMenuItems } from "@/services/menu.service";
import type { Deal, MenuItem } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    Promise.all([getActiveDeals(), getAvailableMenuItems()])
      .then(([dList, mItems]) => {
        setDeals(dList);
        setItems(mItems);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12">
        <Skeleton className="h-9 w-48" />
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Special Combos & Deals</h1>
        <p className="text-sm text-muted-foreground mt-2">Satisfy your appetite while keeping it budget friendly.</p>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {deals.map((d) => {
          const dealItems = items.filter((i) => d.menuItemIds?.includes(i.id));
          return (
            <div key={d.id} className="relative rounded-2xl border bg-card p-6 shadow-md flex flex-col justify-between hover:border-primary/30 transition-all">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-bold leading-tight">{d.title}</h2>
                  {d.discountPercent && (
                    <span className="rounded-full bg-red-100 text-red-700 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shrink-0">
                      {d.discountPercent}% OFF
                    </span>
                  )}
                  {d.fixedPrice && (
                    <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shrink-0">
                      Rs {d.fixedPrice}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm text-muted-foreground font-semibold">{d.description}</p>
                
                {dealItems.length > 0 && (
                  <div className="mt-4 space-y-1 bg-muted/40 p-2.5 rounded-xl border border-dashed">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Includes:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {dealItems.map((item) => (
                        <span key={item.id} className="bg-background text-[11px] px-2 py-0.5 rounded-md font-semibold border">
                          {item.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Button 
                onClick={() => {
                  if (dealItems.length === 0) {
                    toast.error("This deal has no items configured.");
                    return;
                  }
                  dealItems.forEach((item) => {
                    addItem(item, 1, {});
                  });
                  toast.success(`Combo deal "${d.title}" added to cart!`, { duration: 2000 });
                }}
                className="mt-6 w-full font-bold bg-primary hover:bg-primary/95 text-xs text-white"
              >
                Grab This Combo
              </Button>
            </div>
          );
        })}
        {!deals.length && (
          <p className="text-muted-foreground text-center col-span-full py-16">
            No active deals available. Check back soon for hot updates!
          </p>
        )}
      </div>
    </div>
  );
}
