"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { libraryExt, libraryFileUrl, libraryHasImagePreview, type LibraryItem } from "./libraryClient";

/** Image preview of a library item (raster ≤ 15 MB), else its type label. */
export function LibraryThumb({ item, className }: { item: LibraryItem; className?: string }) {
  const [broken, setBroken] = useState(false);
  const showImg = libraryHasImagePreview(item) && !broken;
  return (
    <div className={cn("flex items-center justify-center overflow-hidden bg-gray-50", className)}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={libraryFileUrl(item.id)}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          className={cn(
            "rounded-md px-2 py-1 text-xs font-bold",
            broken ? "bg-red-50 text-red-600" : "bg-white text-gray-500 ring-1 ring-gray-200",
          )}
        >
          {broken ? "нет файла" : libraryExt(item.fileName)}
        </span>
      )}
    </div>
  );
}
