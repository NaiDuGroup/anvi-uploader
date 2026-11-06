"use client";

import type { ShopLang } from "@/lib/storefront/i18n";
import { cardShortDoc, type CardShortState } from "./cardFlow";
import type { StudioDoc, StudioImageSrc, StudioTextLayer } from "./document";
import { loadTextFonts, measureText } from "./fonts";
import { logoLookFromImage } from "./logoPalette";
import type { LogoLook } from "./palette";
import type { StudioFields } from "./smartFields";
import { getBlob } from "./storage";
import type { StudioSurfaceSpec } from "./surfaces";

/** Colours / own background of each logo of this browser (read once from its stored file). */
const looks = new Map<string, Promise<LogoLook | null>>();

/** What the card needs to know about the customer's logo (null: no logo, or it cannot be read here). */
export function cardLogoLook(logo: StudioImageSrc | null | undefined): Promise<LogoLook | null> {
  const id: string | undefined = logo?.localId;
  if (!id || !logo) return Promise.resolve(null);
  let p = looks.get(id);
  if (!p) {
    p = (async () => {
      try {
        const blob: Blob | null = await getBlob(id);
        if (!blob || typeof createImageBitmap !== "function") return null;
        const bmp: ImageBitmap = await createImageBitmap(blob);
        const look: LogoLook | null = logoLookFromImage(bmp, bmp.width, bmp.height);
        bmp.close();
        return look;
      } catch {
        return null;
      }
    })();
    looks.set(id, p);
    // Not readable yet (the file is still being stored right after an upload): asked again next time.
    void p.then((r) => r == null && looks.get(id) === p && looks.delete(id));
  }
  return p;
}

/**
 * The card of the gallery / short edit with its fonts loaded and its texts
 * measured (browser side of `cardShortDoc`); `fontsReady` false when a font
 * did not arrive in time (the caller redraws once it does).
 */
export async function cardShortDocMeasured(
  state: CardShortState,
  ctx: { fields: StudioFields; lang: ShopLang; specs: readonly StudioSurfaceSpec[]; id?: string },
): Promise<{ doc: StudioDoc; fontsReady: boolean } | null> {
  const logo: LogoLook | null = await cardLogoLook(ctx.fields.logo);
  const draft: StudioDoc | null = cardShortDoc(state, { ...ctx, logo });
  if (!draft) return null;
  const texts: StudioTextLayer[] = draft.surfaces.flatMap((s) => s.layers).filter((l): l is StudioTextLayer => l.kind === "text");
  const fontsReady: boolean = await loadTextFonts(texts);
  const doc: StudioDoc | null = cardShortDoc(state, { ...ctx, measure: measureText, logo });
  return doc ? { doc, fontsReady } : null;
}
