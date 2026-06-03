"use client";

import { cn } from "@/lib/utils";
import { PublicImage } from "@/components/ui/PublicImage";

export type CatalogOptionThumbProps =
  | {
      variant: "mug";
      imagePublicUrl: string | null;
      bodyColorHex: string;
      className?: string;
    }
  | {
      variant: "notebook";
      imagePublicUrl: string | null;
      coverColorHex: string;
      className?: string;
    };

/**
 * Small square preview for catalog rows (matches admin select density).
 * Images are decorative thumbnails; empty alt when using `img`.
 */
export function CatalogOptionThumb(props: CatalogOptionThumbProps) {
  const { className, imagePublicUrl } = props;
  const fallbackBg =
    props.variant === "mug" ? props.bodyColorHex : props.coverColorHex;

  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-400/70 bg-gray-50",
        className,
      )}
      aria-hidden
    >
      {imagePublicUrl ? (
        <PublicImage
          src={imagePublicUrl}
          alt=""
          className="h-full w-full object-contain"
          fallback={<div className="h-full w-full" style={{ backgroundColor: fallbackBg }} />}
        />
      ) : (
        <div className="h-full w-full" style={{ backgroundColor: fallbackBg }} />
      )}
    </div>
  );
}
