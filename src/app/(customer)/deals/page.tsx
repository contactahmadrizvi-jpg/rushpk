"use client";

import { useEffect, useState } from "react";
import { getActiveDeals } from "@/services/menu.service";
import type { Deal } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getActiveDeals()
      .then(setDeals)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <Skeleton className="h-9 w-48" />
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold">Deals & Offers</h1>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {deals.map((d) => (
          <div key={d.id} className="rounded-2xl border bg-gradient-to-br from-primary/10 to-transparent p-8">
            <h2 className="text-xl font-bold">{d.title}</h2>
            <p className="mt-2 text-muted-foreground">{d.description}</p>
          </div>
        ))}
        {!deals.length && <p className="text-muted-foreground">No active deals. Add deals in Admin.</p>}
      </div>
    </div>
  );
}
