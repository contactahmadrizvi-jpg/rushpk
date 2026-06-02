"use client";

import { useState } from "react";
import POSPage from "../pos/page";
import KitchenPage from "../kitchen/page";
import { Monitor, ChefHat } from "lucide-react";

export default function PosKitchenUnifiedPage() {
  const [activeTab, setActiveTab] = useState<"pos" | "kitchen">("pos");

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      {/* Top Header Panel for Toggle Selector */}
      <div className="flex h-16 shrink-0 items-center justify-center border-b bg-white relative z-50 shadow-xs">
        <div className="flex items-center gap-1 rounded-full border border-stone-200 bg-stone-100 p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab("pos")}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-black uppercase tracking-wider transition-all duration-300 ${
              activeTab === "pos"
                ? "bg-primary text-white shadow-xs"
                : "text-stone-600 hover:text-stone-900"
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
                ? "bg-primary text-white shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <ChefHat className="h-4 w-4" />
            Kitchen
          </button>
        </div>
      </div>

      {/* Page Content */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {activeTab === "pos" ? <POSPage /> : <KitchenPage />}
      </div>
    </div>
  );
}
