"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { thumbKindOf } from "@/lib/library/libraryKeys";
import { libraryExt, type LibraryItem } from "./libraryClient";

export function libraryThumbUrl(id: string): string {
  return `/api/admin/library/${id}/thumb`;
}

export function orderFileThumbUrl(fileId: string): string {
  return `/api/admin/library/order-file-thumb/${fileId}`;
}

/**
 * Preview image (server-rendered WebP: first PDF page, scaled raster / TIF),
 * else — and when the preview fails — the file type label.
 */
export function ThumbImage({ src, fileName, className }: { src: string; fileName: string; className?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  const showImg = thumbKindOf(fileName) !== null && state !== "failed";
  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden bg-gray-50",
        showImg && state === "loading" && "animate-pulse",
        className,
      )}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
          onLoad={() => setState("ok")}
          onError={() => setState("failed")}
        />
      ) : (
        <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-gray-500 ring-1 ring-gray-200">
          {libraryExt(fileName)}
        </span>
      )}
    </div>
  );
}

/** Preview of a library item. */
export function LibraryThumb({ item, className }: { item: Pick<LibraryItem, "id" | "fileName">; className?: string }) {
  return <ThumbImage key={item.id} src={libraryThumbUrl(item.id)} fileName={item.fileName} className={className} />;
}
