"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * «Набор»: small photo of a set item (mug / notebook / pen variant) so the
 * staff see which product it is, not just its colour. No photo → the colour
 * dot; neither (the box) → a box icon.
 */
export function GiftSetItemThumb({
  imageUrl,
  swatch,
  alt,
  size = "md",
  className,
}: {
  imageUrl: string | null | undefined;
  swatch: string | null | undefined;
  alt: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const box = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  // A photo that does not load falls back to the colour dot.
  const [broken, setBroken] = useState<string | null>(null);
  if (imageUrl && broken !== imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- stock photos come from the storage bucket as is
      <img
        src={imageUrl}
        alt={alt}
        loading="lazy"
        onError={() => setBroken(imageUrl)}
        data-testid="gift-set-item-thumb"
        className={cn(box, "shrink-0 rounded-md border border-gray-200 bg-white object-contain", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(box, "inline-flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50", className)}
    >
      {swatch ? (
        <span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: swatch }} />
      ) : (
        <Package className="h-4 w-4 text-gray-400" />
      )}
    </span>
  );
}
