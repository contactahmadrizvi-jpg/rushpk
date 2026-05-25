import Link from "next/link";
import { MapPin, Phone, Mail } from "lucide-react";
import { RESTAURANT } from "@/constants";

export function CustomerFooter() {
  return (
    <footer className="mt-auto border-t bg-card">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-3 lg:px-8">
        <div>
          <h3 className="text-lg font-bold text-primary">{RESTAURANT.name}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Premium pizza & burgers in Sheikhupura. Fast delivery, dine-in & takeaway.
          </p>
        </div>
        <div>
          <h4 className="font-semibold">Quick Links</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link href="/menu" className="hover:text-primary">Menu</Link></li>
            <li><Link href="/deals" className="hover:text-primary">Deals</Link></li>
            <li><Link href="/track" className="hover:text-primary">Track Order</Link></li>
          </ul>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{RESTAURANT.location}</p>
          <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-primary" />{RESTAURANT.phone}</p>
          <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" />{RESTAURANT.email}</p>
        </div>
      </div>
      <div className="border-t py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {RESTAURANT.name}. All rights reserved.
      </div>
    </footer>
  );
}
