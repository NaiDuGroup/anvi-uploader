"use client";

import { fontOptionById, FONT_OPTIONS } from "@/lib/editor/editorPalette";
import { ensureFontsLoadedForExport, uniqueFontRequests, type FontRequest } from "@/lib/editor/fontLoading";
import type { DesignDoc } from "./doc";

/**
 * Font handling for the Design Studio.
 *
 * The studio is admin-only and loads fonts through `DesignFontLoader`
 * (a Google Fonts `<link>`), so the real CSS family name from `FONT_OPTIONS`
 * can be handed straight to `ctx.font` — no need for the CSS-variable
 * round-trip the public editors use with `next/font`'s hashed families.
 */

export function resolveDesignFontFamily(fontId: string): string {
  return fontOptionById(fontId).family;
}

/**
 * Faces the document draws: one per text element's family / weight / style,
 * deduplicated. Pure (tested); `ensureDesignFontsLoaded` loads exactly these.
 */
export function designDocFontRequests(doc: DesignDoc): FontRequest[] {
  const requests: FontRequest[] = [];
  for (const element of doc.elements) {
    if (element.kind !== "text") continue;
    requests.push({
      family: resolveDesignFontFamily(element.fontId),
      weight: element.fontWeight,
      style: element.italic ? "italic" : "normal",
    });
  }
  return uniqueFontRequests(requests);
}

/** Every character the document draws (picks latin / cyrillic subsets). */
export function designDocText(doc: DesignDoc): string {
  let text = "";
  for (const element of doc.elements) {
    if (element.kind !== "text") continue;
    text += element.uppercase ? element.text.toUpperCase() : element.text;
  }
  return text;
}

/**
 * Ensure every font used by the document is actually loaded before rendering
 * (first paint, export). Waits at most `FONT_LOAD_TIMEOUT_MS`; without this
 * the canvas silently falls back to a system font.
 */
export async function ensureDesignFontsLoaded(doc: DesignDoc): Promise<void> {
  await ensureFontsLoadedForExport(designDocFontRequests(doc), { text: designDocText(doc) });
}

/** Load every catalog font at a nominal size (used by font pickers). */
export async function preloadAllDesignFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    FONT_OPTIONS.map((f) =>
      document.fonts.load(`400 32px "${f.family}"`).catch(() => undefined),
    ),
  );
}
