import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "Rush Pizza and Burger | Sheikhupura",
  description: "Premium pizza & burgers — order online or dine in. Sheikhupura, Pakistan.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Rush Pizza" },
};

export const viewport: Viewport = {
  themeColor: "#dc2f02",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.variable} min-h-screen antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
