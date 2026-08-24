"use client";

import { fontOptionById, FONT_OPTIONS } from "@/lib/editor/editorPalette";
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
 * Ensure every font used by the document is actually loaded before rendering.
 * `document.fonts.load` needs a concrete size, so we request the size each
 * text element uses; without this the first paint (and any export) can fall
 * back to a system font.
 */
export async function ensureDesignFontsLoaded(doc: DesignDoc): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;

  const specs = new Set<string>();
  for (const element of doc.elements) {
    if (element.kind !== "text") continue;
    const family = resolveDesignFontFamily(element.fontId);
    specs.add(`${element.fontWeight} ${element.fontSizePx}px "${family}"`);
  }

  await Promise.all(
    [...specs].map((spec) => document.fonts.load(spec).catch(() => undefined)),
  );
  await document.fonts.ready;
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
