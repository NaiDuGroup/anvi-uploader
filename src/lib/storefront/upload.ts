"use client";

import { effectiveDpi, SHOP_LOW_DPI } from "./dtfPrint";
import type { ShopFileRef } from "./types";

/**
 * Artwork upload for a cart line: `POST /api/upload-url` (scope «order»),
 * then a PUT of the file with progress. Returns the reference the checkout
 * sends with the line.
 */
export class ShopUploadError extends Error {
  constructor(public readonly code: "too_big" | "failed") {
    super(code);
  }
}

export function uploadArtwork(file: File, onProgress: (pct: number) => void): Promise<ShopFileRef> {
  return (async () => {
    const res = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        fileSize: file.size,
        scope: "order",
      }),
    });
    if (res.status === 413) throw new ShopUploadError("too_big");
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ShopUploadError(body?.error && /size|large|big/i.test(body.error) ? "too_big" : "failed");
    }
    const { uploadUrl, fileKey, contentType } = (await res.json()) as {
      uploadUrl: string;
      fileKey: string;
      /** Signed type; may be coerced to octet-stream for HTML/SVG/XML/JS. */
      contentType?: string;
    };

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", contentType || file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ShopUploadError("failed")));
      xhr.onerror = () => reject(new ShopUploadError("failed"));
      xhr.send(file);
    });
    return { fileKey, fileName: file.name, sizeBytes: file.size };
  })();
}

/** Pixel size of an image file (null for PDFs and unreadable files). */
export function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export interface ArtworkQuality {
  dpi: number;
  low: boolean;
}

export function artworkQuality(
  px: { width: number; height: number } | null,
  cm: { widthCm: number; heightCm: number } | null,
): ArtworkQuality | null {
  if (!px || !cm) return null;
  const dpi: number = effectiveDpi(px, cm);
  return { dpi, low: dpi < SHOP_LOW_DPI };
}
