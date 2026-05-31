"use client";

import { useState } from "react";
import POSPage from "../pos/page";
import KitchenPage from "../kitchen/page";
import { Monitor, ChefHat } from "lucide-react";

export default function PosKitchenUnifiedPage() {
  const [activeTab, setActiveTab] = useState<"pos" | "kitchen">("pos");

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Floating Toggle Selector */}
      <div className="absolute left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/20 bg-stone-900/90 p-1.5 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          onClick={() => setActiveTab("pos")}
          className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-black uppercase tracking-wider transition-all duration-300 ${
            activeTab === "pos"
              ? "bg-primary text-white shadow-md"
              : "text-stone-300 hover:text-white"
          }`}
        >
          <Monitor className="h-4 w-4" />
          POS
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("kitchen")}
          className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-black uppercase tracking-wider transition-all duration-300 ${
            activeTab === "kitchen"
              ? "bg-primary text-white shadow-md"
              : "text-stone-300 hover:text-white"
          }`}
        >
          <ChefHat className="h-4 w-4" />
          Kitchen
        </button>
      </div>

      {/* Page Content */}
      <div className="h-full w-full">
        {activeTab === "pos" ? <POSPage /> : <KitchenPage />}
      </div>
    </div>
  );
}
