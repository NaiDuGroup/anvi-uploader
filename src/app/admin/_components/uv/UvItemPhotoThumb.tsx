"use client";

import { ImageIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Where a stored UV item photo is served (staff or the customer whose order it is). */
export function uvItemPhotoUrl(fileUrl: string): string {
  return `/api/uv-item-photo?key=${encodeURIComponent(fileUrl)}`;
}

/**
 * Small thumbnail of a client's item photo; click opens the full photo in a new
 * tab. Formats the browser cannot draw (HEIC outside Safari) or a photo gone
 * from storage fall back to an icon link with the file name.
 */
export function UvItemPhotoThumb({
  photo,
  label,
  className,
  size = "sm",
}: {
  photo: { fileUrl: string; fileName: string; previewUrl?: string };
  /** Accessible name / tooltip («Фото изделия»). */
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const [broken, setBroken] = useState(false);
  const src = photo.previewUrl ?? uvItemPhotoUrl(photo.fileUrl);
  const box = size === "md" ? "h-16 w-16" : "h-10 w-10";
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      title={`${label}: ${photo.fileName}`}
      aria-label={`${label}: ${photo.fileName}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50 hover:border-gray-400",
        box,
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {broken ? (
        <ImageIcon className="h-4 w-4 text-gray-400" aria-hidden />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked route; no Next image loader
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      )}
    </a>
  );
}
