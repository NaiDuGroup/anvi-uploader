"use client";

import type { LibraryItem } from "./libraryClient";
import { libraryMetaText } from "./libraryClient";

/**
 * Stored artwork a wizard row reuses as is (no upload, no copy): a library
 * item (`library/…`) or a file of a repeated order that is still in storage.
 * Sent as the new file's `fileUrl`; the server counts library uses on create.
 */
export interface WizardReusedFile {
  fileName: string;
  fileUrl: string;
  source: "library" | "storage" | "link";
  libraryFileId: string | null;
  /** Library title, when picked from the library. */
  title?: string;
  /** «12 МБ · 300 dpi · 9×5 см» from the library row. */
  metaText?: string;
}

export function reuseFromLibraryItem(item: LibraryItem): WizardReusedFile {
  return {
    fileName: item.fileName,
    fileUrl: item.storageKey,
    source: "library",
    libraryFileId: item.id,
    title: item.title,
    metaText: libraryMetaText(item) || undefined,
  };
}

/** `GET /api/admin/orders/:id/repeat-files`: per file id, the reusable key or null (gone). */
export async function loadRepeatOrderFiles(orderId: string): Promise<Record<string, WizardReusedFile | null>> {
  const res = await fetch(`/api/admin/orders/${orderId}/repeat-files`);
  if (!res.ok) throw new Error("Не удалось проверить файлы заказа");
  const body = (await res.json()) as {
    files: Record<string, { fileName: string; fileUrl: string; source: WizardReusedFile["source"]; libraryFileId: string | null } | null>;
  };
  const out: Record<string, WizardReusedFile | null> = {};
  for (const [id, f] of Object.entries(body.files ?? {})) out[id] = f ? { ...f } : null;
  return out;
}
