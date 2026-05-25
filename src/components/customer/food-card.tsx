"use client";

import { motion } from "framer-motion";
import { MenuItemImage } from "@/components/menu-item-image";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import type { MenuItem } from "@/types";

interface FoodCardProps {
  item: MenuItem;
  onAdd: () => void;
}

export function FoodCard({ item, onAdd }: FoodCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="group overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-lg"
    >
      <div className="relative aspect-[4/3] bg-muted">
        <MenuItemImage src={item.imageUrl} alt={item.name} fill />
        {item.isPopular && (
          <Badge className="absolute left-3 top-3" variant="warning">Popular</Badge>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-bold">{item.name}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-bold text-primary">{formatCurrency(item.price)}</span>
          <Button size="sm" onClick={onAdd} disabled={!item.isAvailable}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
