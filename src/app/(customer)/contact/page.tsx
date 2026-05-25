"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RESTAURANT } from "@/constants";
import { toast } from "sonner";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-3xl font-bold">Contact Us</h1>
      <p className="mt-2 text-muted-foreground">{RESTAURANT.location}</p>
      <p className="font-medium">{RESTAURANT.phone}</p>
      <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); toast.success("Message sent!"); }}>
        <Input placeholder="Your name" required />
        <Input placeholder="Phone" required />
        <Textarea placeholder="Message" required />
        <Button type="submit" className="w-full">Send Message</Button>
      </form>
    </div>
  );
}
