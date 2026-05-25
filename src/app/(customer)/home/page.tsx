"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-[#e85d04] to-[#f48c06] px-4 py-20 text-white lg:py-28">
        <div className="mx-auto max-w-7xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-sm font-medium uppercase tracking-widest opacity-90">Sheikhupura&apos;s Finest</p>
            <h1 className="mt-2 max-w-2xl text-4xl font-black leading-tight md:text-6xl">
              Rush Pizza & Burger
            </h1>
            <p className="mt-4 max-w-lg text-lg opacity-90">
              Crispy burgers, wood-fired taste pizzas — delivered hot to your door.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/menu">
                <Button size="lg" variant="secondary" className="gap-2 text-primary">
                  Order Now <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Link href="/deals">
                <Button size="lg" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20">
                  View Deals
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {!isFirebaseConfigured() && (
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
            Configure Firebase in <code>.env.local</code> to load live menu data.
          </div>
        </div>
      )}

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

      {loading ? (
        <section className="mx-auto max-w-7xl px-4 pb-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/5] w-full" />
            ))}
          </div>
        </section>
      ) : homeSections.length === 0 ? (
        <section className="mx-auto max-w-7xl px-4 pb-16">
          <p className="text-muted-foreground">Menu coming soon. Add items in Admin → Menu.</p>
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
                <FoodCard key={item.id} item={item} onAdd={() => addItem(item, 1, {})} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
