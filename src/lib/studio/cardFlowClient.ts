"use client";

import type { ShopLang } from "@/lib/storefront/i18n";
import { cardShortDoc, type CardShortState } from "./cardFlow";
import type { StudioDoc, StudioTextLayer } from "./document";
import { loadTextFonts, measureText } from "./fonts";
import type { StudioFields } from "./smartFields";
import type { StudioSurfaceSpec } from "./surfaces";

/**
 * The card of the gallery / short edit with its fonts loaded and its texts
 * measured (browser side of `cardShortDoc`); `fontsReady` false when a font
 * did not arrive in time (the caller redraws once it does).
 */
export async function cardShortDocMeasured(
  state: CardShortState,
  ctx: { fields: StudioFields; lang: ShopLang; specs: readonly StudioSurfaceSpec[]; id?: string },
): Promise<{ doc: StudioDoc; fontsReady: boolean } | null> {
  const draft: StudioDoc | null = cardShortDoc(state, ctx);
  if (!draft) return null;
  const texts: StudioTextLayer[] = draft.surfaces.flatMap((s) => s.layers).filter((l): l is StudioTextLayer => l.kind === "text");
  const fontsReady: boolean = await loadTextFonts(texts);
  const doc: StudioDoc | null = cardShortDoc(state, { ...ctx, measure: measureText });
  return doc ? { doc, fontsReady } : null;
}
