"use client";

import type { ShopFileRef } from "@/lib/storefront/types";

/**
 * «Pentru companii» logo / brief upload: `POST /api/upload-url` with the
 * `corporate` scope (the server refuses types outside `fileTypes.ts`), then a
 * PUT of the file with progress.
 */
export class CorporateUploadError extends Error {
  constructor(public readonly code: "file_type" | "too_big" | "failed") {
    super(code);
  }
}

export function uploadCorporateFile(file: File, onProgress: (pct: number) => void): Promise<ShopFileRef> {
  return (async () => {
    const contentType = file.type || "application/octet-stream";
    const res = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, contentType, fileSize: file.size, scope: "corporate" }),
    });
    if (res.status === 413) throw new CorporateUploadError("too_big");
    if (res.status === 415) throw new CorporateUploadError("file_type");
    if (!res.ok) throw new CorporateUploadError("failed");
    const { uploadUrl, fileKey } = (await res.json()) as { uploadUrl: string; fileKey: string };

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new CorporateUploadError("failed")));
      xhr.onerror = () => reject(new CorporateUploadError("failed"));
      xhr.send(file);
    });
    return { fileKey, fileName: file.name, sizeBytes: file.size };
  })();
}
