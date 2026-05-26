import { KitchenColumnsSkeleton } from "@/components/ui/loading-skeletons";

export default function KitchenLoading() {
  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex shrink-0 items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-16 w-24 animate-pulse rounded-2xl bg-muted" />
      </header>
      <KitchenColumnsSkeleton />
    </div>
  );
}
