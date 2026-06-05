"use client";

import { useEffect, useState, useCallback } from "react";
import { getActiveDeals, getAvailableMenuItems } from "@/services/menu.service";
import type { Deal, MenuItem } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ShoppingCart, Tag, Flame } from "lucide-react";

/* ─── Carousel for deal item images ─── */
function DealItemCarousel({ items, deal }: { items: MenuItem[]; deal: Deal }) {
  const [index, setIndex] = useState(0);

  const prev = useCallback(() =>
    setIndex((i) => (i === 0 ? items.length - 1 : i - 1)), [items.length]);
  const next = useCallback(() =>
    setIndex((i) => (i === items.length - 1 ? 0 : i + 1)), [items.length]);

  if (items.length === 0) return null;

  const current = items[index]!;

  return (
    <div className="relative rounded-2xl overflow-hidden bg-muted/20 border">
      <div className="relative h-44 w-full overflow-hidden">
        {items.map((item, i) => (
          <div
            key={item.id}
            className={`absolute inset-0 transition-opacity duration-500 ${i === index ? "opacity-100 z-10" : "opacity-0 z-0"}`}
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-primary/10 to-primary/5 flex flex-col items-center justify-center text-5xl gap-1">
                🍔
              </div>
            )}
            {/* gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          </div>
        ))}

        {/* Item info overlay */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-3">
          <p className="text-white font-bold text-sm leading-tight drop-shadow">{current.name}</p>
          {deal.selectedVariants?.[current.id] && (() => {
            const varObj = current.variants?.find((v) => v.id === deal.selectedVariants![current.id]);
            return varObj ? (
              <span className="text-[10px] text-white/75 font-semibold">{varObj.name}</span>
            ) : null;
          })()}
        </div>

        {/* Nav controls */}
        {items.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-7 w-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors backdrop-blur-sm"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-7 w-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors backdrop-blur-sm"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        {/* Dot indicators */}
        {items.length > 1 && (
          <div className="absolute bottom-10 right-3 z-20 flex gap-1">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {items.length > 1 && (
        <div className="flex gap-1.5 p-2 bg-muted/30 overflow-x-auto">
          {items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setIndex(i)}
              className={`flex-shrink-0 h-10 w-10 rounded-lg overflow-hidden border-2 transition-all ${i === index ? "border-primary scale-110 shadow-md" : "border-transparent opacity-60 hover:opacity-90"}`}
            >
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-muted flex items-center justify-center text-lg">🍔</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
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
            <Skeleton key={i} className="h-80 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
          <Flame className="h-3.5 w-3.5" />
          Hot Deals
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
          Special Combos &amp; Deals
        </h1>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto text-sm">
          Satisfy your appetite while keeping it budget-friendly. Handpicked combos at unbeatable prices.
        </p>
      </div>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {deals.map((d) => {
          const dealItems = items.filter((i) => d.menuItemIds?.includes(i.id));
          const lineItems = dealItems.map((item) => {
            const selectedVarId = d.selectedVariants?.[item.id];
            const varObj = item.variants?.find((v) => v.id === selectedVarId);
            const customPrice = d.itemPrices?.[item.id];
            const qty = d.itemQuantities?.[item.id] ?? 1;
            const unitPrice = customPrice !== undefined
              ? customPrice
              : item.price + (varObj?.priceModifier ?? 0);
            return { item, varObj, price: unitPrice * qty, qty };
          });

          const subtotal = lineItems.reduce((s, l) => s + l.price, 0);
          const dealTotal = d.fixedPrice ?? subtotal;

          return (
            <div
              key={d.id}
              className="relative rounded-3xl border bg-card shadow-md flex flex-col overflow-hidden hover:shadow-xl hover:border-primary/30 transition-all duration-300 group"
            >
              {/* Discount / Deal badge */}
              {d.discountPercent && (
                <div className="absolute top-3 left-3 z-30 flex items-center gap-1 bg-red-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg">
                  <Tag className="h-2.5 w-2.5" />
                  {d.discountPercent}% OFF
                </div>
              )}

              {/* Carousel */}
              <DealItemCarousel items={dealItems} deal={d} />

              {/* Content */}
              <div className="p-5 flex flex-col flex-1 gap-4">
                <div className="min-h-[72px] flex flex-col justify-start">
                  <h2 className="text-xl font-extrabold leading-tight group-hover:text-primary transition-colors line-clamp-1">{d.title}</h2>
                  <p className="text-sm text-muted-foreground font-medium mt-1 line-clamp-2">{d.description}</p>
                </div>

                {/* Per-item pricing breakdown */}
                {lineItems.length > 0 && (
                  <div className="bg-muted/30 rounded-xl border border-dashed p-3 space-y-1.5">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2">What&apos;s Inside:</p>
                    {lineItems.map(({ item, varObj, price, qty }) => (
                      <div key={item.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {item.imageUrl && (
                            <img src={item.imageUrl} alt={item.name} className="h-6 w-6 rounded-md object-cover border flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-bold block truncate">
                              {qty > 1 && <span className="text-primary font-black mr-1">{qty}x</span>}
                              {item.name}
                            </span>
                            {varObj && <span className="text-[9px] text-muted-foreground">{varObj.name}</span>}
                          </div>
                        </div>
                        <span className="text-xs font-black text-primary flex-shrink-0">Rs {price}</span>
                      </div>
                    ))}

                    {/* Total row */}
                    <div className="border-t border-dashed pt-2 mt-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground">Deal Total</span>
                      <div className="flex items-center gap-2">
                        {d.discountPercent && (
                          <span className="text-xs line-through text-muted-foreground/60">Rs {subtotal}</span>
                        )}
                        <span className="text-base font-black text-primary">Rs {dealTotal}</span>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => {
                    if (dealItems.length === 0) {
                      toast.error("This deal has no items configured.");
                      return;
                    }
                    dealItems.forEach((item) => {
                      const varId = d.selectedVariants?.[item.id];
                      const qty = d.itemQuantities?.[item.id] ?? 1;
                      addItem(item, qty, varId ? { variantId: varId } : {});
                    });
                    toast.success(`"${d.title}" added to cart!`, { duration: 2000 });
                  }}
                  className="mt-auto w-full font-extrabold text-sm gap-2 bg-primary hover:bg-primary/90 text-white"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Add to Cart · Rs {dealTotal}
                </Button>
              </div>
            </div>
          );
        })}

        {!deals.length && (
          <div className="col-span-full text-center py-24">
            <p className="text-4xl mb-3">🍕</p>
            <p className="text-lg font-bold">No active deals right now</p>
            <p className="text-sm text-muted-foreground mt-1">Check back soon for hot updates!</p>
          </div>
        )}
      </div>
    </div>
  );
}
