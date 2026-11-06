import { STUDIO_APPROVAL_CHECKS } from "@/lib/storefront/design";
import type { ShopVariant } from "@/lib/storefront/types";
import type { StudioDoc } from "./document";
import { layerQrMatrix } from "./qr";

/**
 * «Verifică designul» helpers. Pure.
 *
 * The step shows ONE read-only checklist (what to look at, with the print
 * findings) and ONE required «Am verificat designul» checkbox. None of the
 * four old checklist boxes was a legal consent (the order terms and the
 * «personalised goods are not returned» clause are accepted at checkout), so
 * they were merged into the approval. A new cart line stores every checklist
 * item in `checks` — the list the customer approved as a whole — which keeps
 * the stored shape valid for `parseLineStudio` and the checkout schema (old
 * lines with any subset still parse).
 */

/** `checks` stored with a new approval: the whole read-only checklist the approval covers. */
export function studioApprovalChecks(): string[] {
  return [...STUDIO_APPROVAL_CHECKS];
}

/** What the variant choice of a product is about: colour, volume (320 / 450 ml) or another variant. */
export type StudioVariantChoiceKind = "color" | "volume" | "variant";

const VOLUME_RE = /\d\s*(?:ml|мл|l|л|oz)(?!\p{L})/iu;

export function studioVariantChoiceKind(variants: readonly Pick<ShopVariant, "label" | "hex">[]): StudioVariantChoiceKind {
  if (variants.length > 1 && variants.every((v) => VOLUME_RE.test(v.label))) return "volume";
  // One colour for every variant: the choice is not a colour (same rule as the product page).
  if (new Set(variants.map((v) => v.hex.toLowerCase())).size <= 1) return "variant";
  return "color";
}

export interface StudioVerifyNotes {
  /** Template sample texts left as they were: they print exactly as shown. */
  samples: { layerId: string; text: string }[];
  /** Parts of the design that do not go into the print file. */
  notPrinted: { layerId: string; what: "photoSpot" | "qrEmpty" | "hidden" | "sampleText"; text?: string; surfaceId?: string }[];
}

/**
 * Template leftovers to list before the approval: empty photo spots, empty
 * QR codes and hidden layers are never printed; untouched sample texts are
 * (the render draws every text), so they are listed apart — except on
 * business cards (`card`), where an untouched sample is not printed: it is
 * listed with the empty fields (`sampleText`).
 */
export function studioVerifyNotes(doc: StudioDoc): StudioVerifyNotes {
  const card: boolean = doc.kind === "card";
  const out: StudioVerifyNotes = { samples: [], notPrinted: [] };
  for (const s of doc.surfaces) {
    for (const l of s.layers) {
      if (l.hidden) {
        // Hidden on purpose: say so only when it has content (a hidden empty spot is noise).
        if ((l.kind === "text" && l.text.trim()) || (l.kind === "image" && l.src) || l.kind === "shape" || l.kind === "qr") {
          out.notPrinted.push({ layerId: l.id, what: "hidden" });
        }
        continue;
      }
      if (l.kind === "image" && !l.src) out.notPrinted.push({ layerId: l.id, what: "photoSpot" });
      else if (l.kind === "qr" && !layerQrMatrix(l)) out.notPrinted.push({ layerId: l.id, what: "qrEmpty" });
      else if (l.kind === "text" && l.placeholder && l.text.trim()) {
        if (card) out.notPrinted.push({ layerId: l.id, what: "sampleText", text: l.text.trim().slice(0, 60), surfaceId: s.id });
        else out.samples.push({ layerId: l.id, text: l.text.trim().slice(0, 60) });
      }
    }
  }
  return out;
}
