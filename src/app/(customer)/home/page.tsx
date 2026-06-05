"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Star, Truck, ChevronLeft, ChevronRight, Flame, ShoppingCart, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FoodCard } from "@/components/customer/food-card";
import { getActiveCategories, getAvailableMenuItems, getActiveDeals } from "@/services/menu.service";
import { HOME_MENU_SECTION_IDS } from "@/data/default-menu-categories";
import { useCartStore } from "@/stores/cart-store";
import type { MenuCategory, MenuItem, Deal } from "@/types";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { toast } from "sonner";

/* ─────────────────────────────────────────────
   Deal Image Carousel (per-deal)
───────────────────────────────────────────── */
function DealCarousel({ dealItems }: { dealItems: MenuItem[] }) {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const prev = useCallback(() => setIdx((i) => (i === 0 ? dealItems.length - 1 : i - 1)), [dealItems.length]);
  const next = useCallback(() => setIdx((i) => (i === dealItems.length - 1 ? 0 : i + 1)), [dealItems.length]);

  // Auto-advance every 2.5s
  useEffect(() => {
    if (dealItems.length <= 1) return;
    timerRef.current = setInterval(next, 2500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [next, dealItems.length]);

  if (dealItems.length === 0) {
    return (
      <div className="h-52 w-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-5xl rounded-t-3xl">
        🍔
      </div>
    );
  }

  const current = dealItems[idx]!;

  return (
    <div className="relative h-52 w-full overflow-hidden rounded-t-3xl bg-muted">
      {/* Slides */}
      {dealItems.map((item, i) => (
        <div key={item.id}
          className={`absolute inset-0 transition-opacity duration-700 ${i === idx ? "opacity-100 z-10" : "opacity-0 z-0"}`}>
          {item.imageUrl
            ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
            : <div className="h-full w-full bg-gradient-to-br from-primary/10 to-muted flex items-center justify-center text-6xl">🍔</div>}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        </div>
      ))}

      {/* Item label */}
      <div className="absolute bottom-3 left-4 z-20">
        <p className="text-white font-bold text-sm drop-shadow leading-tight">{current.name}</p>
      </div>

      {/* Arrows */}
      {dealItems.length > 1 && (
        <>
          <button onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-7 w-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition backdrop-blur-sm">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-7 w-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition backdrop-blur-sm">
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {dealItems.length > 1 && (
        <div className="absolute bottom-3 right-3 z-20 flex gap-1">
          {dealItems.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`h-1.5 rounded-full transition-all ${i === idx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`} />
          ))}
        </div>
      )}

      {/* Thumbnail strip */}
      {dealItems.length > 1 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
          {dealItems.map((item, i) => (
            <button key={item.id} onClick={() => setIdx(i)}
              className={`h-8 w-8 rounded-lg overflow-hidden border-2 transition-all ${i === idx ? "border-white scale-110 shadow" : "border-white/30 opacity-60 hover:opacity-90"}`}>
              {item.imageUrl
                ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                : <div className="h-full w-full bg-muted flex items-center justify-center text-sm">🍔</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Page
───────────────────────────────────────────── */
export default function HomePage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    if (!isFirebaseConfigured()) { setLoading(false); return; }
    Promise.all([getActiveCategories(), getAvailableMenuItems(), getActiveDeals()])
      .then(([c, menuItems, d]) => { setCategories(c); setItems(menuItems); setDeals(d); })
      .finally(() => setLoading(false));
  }, []);

  const homeSections = HOME_MENU_SECTION_IDS.map((id) => {
    const cat = categories.find((c) => c.id === id);
    const catItems = items.filter((i) => i.categoryId === id);
    return cat && catItems.length > 0 ? { cat, items: catItems } : null;
  }).filter(Boolean) as { cat: MenuCategory; items: MenuItem[] }[];

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background">
        <motion.div
          animate={{ y: [0, -20, 0], rotate: [0, 5, -5, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          className="text-7xl drop-shadow-xl"
        >
          🍔
        </motion.div>
        <p className="animate-pulse text-xl font-bold tracking-tight text-primary">Serving up deliciousness...</p>
      </div>
    );
  }

  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative min-h-[min(85vh,720px)] overflow-hidden">
        <Image
          src="https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1920&q=85"
          alt="Fresh pizza and burgers"
          fill priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/30" />
        <div className="relative mx-auto flex min-h-[min(85vh,720px)] max-w-7xl items-center px-4 py-16 lg:py-24">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-300">
              Sheikhupura · Rush Pizza &amp; Burger
            </p>
            <h1 className="mt-3 text-4xl font-black leading-[1.05] md:text-6xl lg:text-7xl">
              Hot pizza.<br />Loaded burgers.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-white/90">
              Order shawarma, parathas, premium pizzas and more — delivery or pickup.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/menu">
                <Button size="lg" className="gap-2 bg-primary text-lg font-bold shadow-lg hover:bg-primary/90">
                  Order Now <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Link href="/track">
                <Button size="lg" variant="outline"
                  className="border-white/50 bg-white/10 text-lg text-white backdrop-blur hover:bg-white/20">
                  Track Order
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Feature pills ── */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Truck, title: "Fast Delivery", desc: "30-45 min in Sheikhupura" },
            { icon: Star, title: "Premium Quality", desc: "Fresh ingredients daily" },
            { icon: Clock, title: "Open Daily", desc: "1 PM – 10 PM" },
          ].map((f) => (
            <div key={f.title} className="flex gap-4 rounded-2xl border bg-card p-6 shadow-sm">
              <f.icon className="h-8 w-8 shrink-0 text-primary" />
              <div>
                <h3 className="font-bold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Deals Section ── */}
      {deals.length > 0 && (
        <section className="py-16 bg-gradient-to-b from-primary/5 via-muted/30 to-background">
          <div className="mx-auto max-w-7xl px-4">
            {/* Section header */}
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
                  <Flame className="h-3.5 w-3.5" />
                  Hot Deals
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Special Combos &amp; Deals</h2>
                <p className="text-muted-foreground mt-2 text-sm max-w-md">
                  Handpicked combos at unbeatable prices — crafted to satisfy every craving.
                </p>
              </div>
              <Link href="/deals"
                className="hidden sm:flex items-center gap-1.5 text-sm font-bold text-primary hover:underline shrink-0">
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Deal cards grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {deals.slice(0, 6).map((d) => {
                const dealItems = items.filter((i) => d.menuItemIds?.includes(i.id));

                const lineItems = dealItems.map((item) => {
                  const varId = d.selectedVariants?.[item.id];
                  const varObj = item.variants?.find((v) => v.id === varId);
                  const custom = d.itemPrices?.[item.id];
                  const price = custom !== undefined ? custom : item.price + (varObj?.priceModifier ?? 0);
                  return { item, varObj, price };
                });
                const subtotal = lineItems.reduce((s, l) => s + l.price, 0);
                const dealTotal = d.fixedPrice ?? subtotal;

                return (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4 }}
                    className="group relative rounded-3xl border-2 bg-card shadow-md hover:shadow-xl hover:border-primary/30 transition-all duration-300 flex flex-col overflow-hidden"
                  >
                    {/* Discount badge */}
                    {d.discountPercent && (
                      <div className="absolute top-3 left-3 z-30 flex items-center gap-1 bg-red-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg">
                        <Tag className="h-2.5 w-2.5" />
                        {d.discountPercent}% OFF
                      </div>
                    )}

                    {/* ── Carousel ── */}
                    <DealCarousel dealItems={dealItems} />

                    {/* ── Card Body ── */}
                    <div className="p-5 flex flex-col flex-1 gap-3">
                      <div className="min-h-[68px] flex flex-col justify-start">
                        <h3 className="text-lg font-extrabold group-hover:text-primary transition-colors leading-tight line-clamp-1">
                          {d.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{d.description}</p>
                      </div>

                      {/* Per-item breakdown */}
                      {lineItems.length > 0 && (
                        <div className="bg-muted/30 rounded-xl border border-dashed p-3 space-y-1.5">
                          <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">What&apos;s Inside:</p>
                          {lineItems.map(({ item, varObj, price }) => (
                            <div key={item.id} className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {item.imageUrl && (
                                  <img src={item.imageUrl} alt={item.name}
                                    className="h-5 w-5 rounded object-cover border shrink-0" />
                                )}
                                <span className="text-[11px] font-semibold truncate">{item.name}</span>
                                {varObj && <span className="text-[9px] text-muted-foreground shrink-0">({varObj.name})</span>}
                              </div>
                              <span className="text-[11px] font-black text-primary shrink-0">Rs {price}</span>
                            </div>
                          ))}
                          <div className="border-t border-dashed pt-1.5 mt-1 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-muted-foreground">Deal Total</span>
                            <div className="flex items-center gap-2">
                              {d.discountPercent && subtotal !== dealTotal && (
                                <span className="text-[10px] line-through text-muted-foreground/60">Rs {subtotal}</span>
                              )}
                              <span className="text-sm font-black text-primary">Rs {dealTotal}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <Button
                        onClick={() => {
                          if (dealItems.length === 0) { toast.error("This deal has no items configured."); return; }
                          dealItems.forEach((item) => {
                            const varId = d.selectedVariants?.[item.id];
                            addItem(item, 1, varId ? { variantId: varId } : {});
                          });
                          toast.success(`"${d.title}" added to cart!`, { duration: 2000 });
                        }}
                        className="mt-auto w-full font-extrabold gap-2 bg-primary hover:bg-primary/90 text-white"
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Add to Cart · Rs {dealTotal}
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Mobile view all */}
            <div className="mt-8 text-center sm:hidden">
              <Link href="/deals">
                <Button variant="outline" className="gap-2 font-bold">
                  View All Deals <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Categories ── */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-8">
          <h2 className="text-2xl font-bold">Browse by category</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {categories.map((c) => (
              <Link key={c.id} href={`/menu?category=${c.slug}`}
                className="rounded-full border bg-card px-5 py-2.5 text-sm font-semibold shadow-sm transition hover:border-primary hover:text-primary">
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Menu Sections ── */}
      {homeSections.length === 0 ? (
        <section className="mx-auto max-w-7xl px-4 pb-16">
          <p className="text-muted-foreground">Our menu is being updated. Check back soon.</p>
        </section>
      ) : (
        homeSections.map(({ cat, items: catItems }) => (
          <section key={cat.id} className="mx-auto max-w-7xl px-4 py-10">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold">{cat.name}</h2>
              <Link href={`/menu?category=${cat.slug}`}
                className="shrink-0 text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </div>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {catItems.map((item) => (
                <FoodCard key={item.id} item={item}
                  onAdd={(variantId) => {
                    const custom: any = {};
                    if (variantId && item.variants) {
                      const v = item.variants.find((x) => x.id === variantId);
                      if (v) { custom.variantId = v.id; custom.variantName = v.name; }
                    }
                    addItem(item, 1, custom);
                    toast.success(`Added ${item.name} to cart`, { duration: 1500 });
                  }}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
