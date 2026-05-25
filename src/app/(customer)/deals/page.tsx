"use client";

import { useEffect, useState } from "react";
import { getActiveDeals } from "@/services/menu.service";
import type { Deal } from "@/types";

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  useEffect(() => { getActiveDeals().then(setDeals); }, []);
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
