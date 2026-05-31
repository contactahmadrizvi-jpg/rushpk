import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: {
    default: "Rush Pizza and Burger Sheikhupura - Order Food Online | Rusk PK",
    template: "%s | Rush Pizza & Burger Sheikhupura"
  },
  description: "Order premium, delicious pizza, gourmet burgers, and wraps online from Rush Pizza and Burger in Sheikhupura, Pakistan. Fast home delivery and hot takeaway options.",
  keywords: [
    "pizza in sheikhupura",
    "burgers in sheikhupura",
    "rush pizza and burger",
    "rush pizza sheikhupura",
    "food delivery sheikhupura",
    "best restaurant in sheikhupura",
    "order food online sheikhupura",
    "ruskpk",
    "rusk pk",
    "rush burger sheikhupura",
    "dine in sheikhupura",
    "fast food sheikhupura"
  ],
  metadataBase: new URL("https://ruskpk.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Rush Pizza and Burger Sheikhupura - Order Food Online | Rusk PK",
    description: "Experience the premium taste of pizza and gourmet burgers in Sheikhupura. Swift delivery right to your doorstep.",
    url: "https://ruskpk.com",
    siteName: "Rush Pizza and Burger",
    images: [
      {
        url: "/logo.jpeg",
        width: 800,
        height: 800,
        alt: "Rush Pizza and Burger Sheikhupura Logo",
      }
    ],
    locale: "en_PK",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/logo.jpeg",
    apple: "/logo.jpeg",
  },
  appleWebApp: { capable: true, title: "Rush Pizza", statusBarStyle: "default" },
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
