import { RESTAURANT } from "@/constants";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">About {RESTAURANT.name}</h1>
      <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
        Located in {RESTAURANT.location}, we serve premium pizzas and gourmet burgers made with fresh ingredients.
        From family dinners to late-night cravings — Rush Pizza & Burger delivers quality you can taste.
      </p>
    </div>
  );
}
