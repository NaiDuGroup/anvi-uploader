"use client";

import { useState } from "react";
import { Gift, Package } from "lucide-react";
import { PRODUCT_TYPE_ICONS } from "@/lib/productTypeIcons";
import { cn } from "@/lib/utils";

/**
 * «Набор»: small photo of a set item (mug / notebook / pen variant) so the
 * staff see which product it is, not just its colour. No photo → the colour
 * dot; neither → a box icon. A set's stock line (`icon`: the A/B box, the C
 * set item) without a photo shows a box / gift icon (with a small colour dot), never a bare dot.
 */
export function GiftSetItemThumb({
  imageUrl,
  swatch,
  alt,
  size = "md",
  icon,
  className,
}: {
  imageUrl: string | null | undefined;
  swatch: string | null | undefined;
  alt: string;
  size?: "sm" | "md";
  /**
   * Icon instead of the colour dot when there is no photo: the set's stock line (box / gift),
   * or a ready set's notebook / pen row (the set photo would show the whole set there).
   */
  icon?: "box" | "gift" | "notebook" | "pen";
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
      {icon ? (
        <span className="relative inline-flex" data-testid="gift-set-item-icon">
          {icon === "gift" ? (
            <Gift className="h-5 w-5 text-fuchsia-700/80" />
          ) : icon === "notebook" || icon === "pen" ? (
            (() => {
              const TypeIcon = PRODUCT_TYPE_ICONS[icon];
              return <TypeIcon className="h-5 w-5 text-gray-600" />;
            })()
          ) : (
            <Package className="h-5 w-5 text-amber-800/70" />
          )}
          {swatch ? (
            <span className="absolute -bottom-1 -right-1.5 h-2.5 w-2.5 rounded-full border border-white ring-1 ring-black/10" style={{ backgroundColor: swatch }} />
          ) : null}
        </span>
      ) : swatch ? (
        <span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: swatch }} />
      ) : (
        <Package className="h-4 w-4 text-gray-400" />
      )}
    </span>
  );
}
