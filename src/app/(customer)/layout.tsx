import { CustomerHeader } from "@/components/customer/header";
import { CustomerFooter } from "@/components/customer/footer";
import { RESTAURANT } from "@/constants";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FoodEstablishment",
    "name": RESTAURANT.name,
    "image": "https://ruskpk.com/logo.jpeg",
    "@id": "https://ruskpk.com/#restaurant",
    "url": "https://ruskpk.com",
    "telephone": RESTAURANT.phone,
    "priceRange": "$$",
    "menu": "https://ruskpk.com/menu",
    "servesCuisine": ["Pizza", "Burger", "Fast Food", "Pakistani Fusion"],
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "Lahore Rd, opposite Usman CNG, near Makhan Sweets, Jameel Town",
      "addressLocality": "Sheikhupura",
      "addressRegion": "Punjab",
      "postalCode": "39350",
      "addressCountry": "PK"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 31.7131,
      "longitude": 73.9724
    },
    "openingHoursSpecification": {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
      ],
      "opens": "11:00",
      "closes": "23:00"
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CustomerHeader />
      <main className="flex-1">{children}</main>
      <CustomerFooter />
    </div>
  );
}
