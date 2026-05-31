import { RESTAURANT } from "@/constants";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us - Best Pizza & Burger Place in Sheikhupura",
  description: "Learn more about Rush Pizza and Burger, the leading fast-food destination in Sheikhupura. Serving gourmet burgers, premium loaded pizzas, wraps and fresh sides.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-extrabold tracking-tight text-stone-900 dark:text-white sm:text-5xl">
        About {RESTAURANT.name}
      </h1>
      <p className="mt-8 text-xl leading-relaxed text-muted-foreground">
        Located at the heart of the city near {RESTAURANT.location.split(',')[2] || "Sheikhupura"}, we are proud to serve the best pizzas and gourmet burgers made with high-quality, fresh ingredients daily. 
      </p>
      <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
        From cozy family dine-ins and custom takeaway pickups to super fast home delivery across Sheikhupura, Rush Pizza & Burger (Rusk PK) is committed to satisfying your cravings with premium flavors and unmatched quality. Taste the difference today!
      </p>
    </div>
  );
}
