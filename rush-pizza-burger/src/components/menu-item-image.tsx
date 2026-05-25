"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type MenuItemImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  fill?: boolean;
  fallback?: React.ReactNode;
};

/** Displays ImgBB / external image URLs (native img — no Next.js hostname issues). */
export function MenuItemImage({
  src,
  alt,
  className,
  fill,
  fallback = <span className="text-3xl">🍕</span>,
}: MenuItemImageProps) {
  const [failed, setFailed] = useState(false);
  const url = src?.trim();

  if (!url || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          fill && "absolute inset-0",
          className
        )}
      >
        {fallback}
      </div>
    );
  }

  if (fill) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        className={cn("absolute inset-0 h-full w-full object-cover", className)}
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={cn("object-cover", className)}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
    />
  );
}
