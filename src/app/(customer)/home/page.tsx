"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Star, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FoodCard } from "@/components/customer/food-card";
import { getActiveCategories, getAvailableMenuItems, getActiveDeals } from "@/services/menu.service";
import { HOME_MENU_SECTION_IDS } from "@/data/default-menu-categories";
import { useCartStore } from "@/stores/cart-store";
import type { MenuCategory, MenuItem, Deal } from "@/types";
import { isFirebaseConfigured } from "@/lib/firebase/config";

export default function HomePage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false);
      return;
    }
    Promise.all([getActiveCategories(), getAvailableMenuItems(), getActiveDeals()])
      .then(([c, menuItems, d]) => {
        setCategories(c);
        setItems(menuItems);
        setDeals(d);
      })
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
          animate={{ 
            y: [0, -20, 0],
            rotate: [0, 5, -5, 0]
          }}
          transition={{ 
            duration: 1.2, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
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
      <section className="relative min-h-[min(85vh,720px)] overflow-hidden">
        <Image
          src="https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1920&q=85"
          alt="Fresh pizza and burgers"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/30" />
        <div className="relative mx-auto flex min-h-[min(85vh,720px)] max-w-7xl items-center px-4 py-16 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl text-white"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-300">
              Sheikhupura · Rush Pizza & Burger
            </p>
            <h1 className="mt-3 text-4xl font-black leading-[1.05] md:text-6xl lg:text-7xl">
              Hot pizza.<br />
              Loaded burgers.
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
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/50 bg-white/10 text-lg text-white backdrop-blur hover:bg-white/20"
                >
                  Track Order
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>


      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Truck, title: "Fast Delivery", desc: "30-45 min in Sheikhupura" },
            { icon: Star, title: "Premium Quality", desc: "Fresh ingredients daily" },
            { icon: Clock, title: "Open Daily", desc: "11 AM – 11 PM" },
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

      {deals.length > 0 && (
        <section className="bg-muted/50 py-12">
          <div className="mx-auto max-w-7xl px-4">
            <h2 className="text-2xl font-bold">Featured Deals</h2>
            <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
              {deals.map((d) => (
                <div key={d.id} className="min-w-[280px] rounded-2xl border bg-card p-6 shadow-sm">
                  <h3 className="font-bold">{d.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{d.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-8">
          <h2 className="text-2xl font-bold">Browse by category</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/menu?category=${c.slug}`}
                className="rounded-full border bg-card px-5 py-2.5 text-sm font-semibold shadow-sm transition hover:border-primary hover:text-primary"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {homeSections.length === 0 ? (
        <section className="mx-auto max-w-7xl px-4 pb-16">
          <p className="text-muted-foreground">Our menu is being updated. Check back soon.</p>
        </section>
      ) : (
        homeSections.map(({ cat, items: catItems }) => (
          <section key={cat.id} className="mx-auto max-w-7xl px-4 py-10">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold">{cat.name}</h2>
              <Link
                href={`/menu?category=${cat.slug}`}
                className="shrink-0 text-sm font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {catItems.map((item) => (
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
          </section>
        ))
      )}
    </div>
  );
}
