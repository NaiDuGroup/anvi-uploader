"use client";

import type { LibraryItem } from "./libraryClient";
import { libraryMetaText } from "./libraryClient";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { LibraryDictionary } from "@/lib/i18n/library/types";

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

/** One file of `GET /api/admin/orders/:id/repeat-files` (see `RepeatFileJson`). */
export interface RepeatFileWire {
  fileName: string;
  fileUrl: string;
  source: WizardReusedFile["source"];
  libraryFileId: string | null;
  library?: Pick<LibraryItem, "title" | "sizeBytes" | "pixelWidth" | "pixelHeight" | "dpi" | "widthMm" | "heightMm" | "pageCount">;
}

/** Wizard row reuse from a repeat-files entry: library rows carry their title and file facts. */
export function reuseFromRepeatFile(f: RepeatFileWire, units?: LibraryDictionary["meta"]): WizardReusedFile {
  const out: WizardReusedFile = { fileName: f.fileName, fileUrl: f.fileUrl, source: f.source, libraryFileId: f.libraryFileId };
  if (f.source === "library" && f.library) {
    out.title = f.library.title;
    out.metaText = libraryMetaText(f.library, units) || undefined;
  }
  return out;
}

/** `GET /api/admin/orders/:id/repeat-files`: per file id, the reusable key or null (gone). */
export async function loadRepeatOrderFiles(orderId: string): Promise<Record<string, WizardReusedFile | null>> {
  const res = await fetch(`/api/admin/orders/${orderId}/repeat-files`);
  if (!res.ok) throw new Error(useLanguageStore.getState().t.library.repeatFilesFailed);
  const body = (await res.json()) as { files: Record<string, RepeatFileWire | null> };
  const out: Record<string, WizardReusedFile | null> = {};
  for (const [id, f] of Object.entries(body.files ?? {})) out[id] = f ? reuseFromRepeatFile(f) : null;
  return out;
}
