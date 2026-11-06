import type { ShopLang } from "@/lib/storefront/i18n";
import {
  SHOP_BC_DEFAULT_PACK,
  SHOP_BC_SLUG,
  isShopBcPack,
  type ShopBcLamination,
  type ShopBcSides,
} from "@/lib/storefront/businessCards";
import type { ShopDesignLayout, ShopLineDesign, ShopLineStudio } from "@/lib/storefront/design";
import { SHOP_DESIGN_PREVIEW_MAX } from "@/lib/storefront/design";
import type { ShopFileRef, ShopQuoteLine } from "@/lib/storefront/types";
import {
  layerBounds,
  ptToMm,
  studioId,
  type StudioDoc,
  type StudioLayer,
  type StudioSurface,
  type StudioTextLayer,
} from "./document";
import { studioInkFor } from "./quality";
import { applyStudioFields, type StudioFields } from "./smartFields";
import { CARD_BACK_ID, CARD_FRONT_ID, surfaceBase, type StudioSurfaceSpec } from "./surfaces";
import { templateSurface, type StudioTemplate } from "./templates";

/**
 * Business cards in ANVI Studio (`card`): the back («Verso») and the cart
 * line. Pure (unit-tested).
 *
 * A card design is sold as the ordinary business-card pack line
 * (`businessCard`, `pricing: "shopPack"`, priced by `shopBcTotalMdl`): each
 * side's 300 dpi PNG (94 × 54 mm = 1110 × 638 px) is a file of that line,
 * `zone: "front"` / `"back"`, which the checkout stores as
 * `business_card_front` / `business_card_back` — the workshop imposes it on
 * A4+ (`businessCardSheetPng`) exactly like an uploaded card.
 */

export function cardHasBack(doc: Pick<StudioDoc, "surfaces">): boolean {
  return doc.surfaces.some((s) => s.id === CARD_BACK_ID);
}

/** Printed sides of the card design. */
export function cardSides(doc: Pick<StudioDoc, "surfaces">): ShopBcSides {
  return cardHasBack(doc) ? "two" : "one";
}

export interface CardOrderOptions {
  pack: number;
  lamination?: ShopBcLamination | null;
  corners?: boolean;
}

/** The business-card pack line of a card design (sides from the document). */
export function cardQuoteLine(doc: Pick<StudioDoc, "surfaces">, opts: CardOrderOptions = { pack: SHOP_BC_DEFAULT_PACK }): ShopQuoteLine {
  return {
    kind: "businessCard",
    pricing: "shopPack",
    sides: cardSides(doc),
    quantity: isShopBcPack(opts.pack) ? opts.pack : SHOP_BC_DEFAULT_PACK,
    ...(opts.lamination ? { lamination: opts.lamination } : {}),
    ...(opts.corners ? { corners: true } : {}),
  };
}

/** How «Adaugă verso» starts the back. */
export type CardBackStart = { kind: "copy" } | { kind: "blank" } | { kind: "template"; template: StudioTemplate };

/** The back's spec among the product's surfaces. */
function backSpec(specs: readonly StudioSurfaceSpec[]): StudioSurfaceSpec | null {
  return specs.find((s) => s.id === CARD_BACK_ID) ?? null;
}

/**
 * «Copie a stilului»: the front's background and decoration (shapes, the
 * logo) without its texts, and the company (or name) in the middle in an ink
 * that reads on it.
 */
function copyStyleLayers(front: StudioSurface, back: Omit<StudioSurface, "layers">, fields: StudioFields, lang: ShopLang): StudioLayer[] {
  const W: number = back.widthMm;
  const H: number = back.heightMm;
  const shapes: StudioLayer[] = front.layers.filter((l) => !l.hidden && l.kind === "shape").map((l) => ({ ...l, id: studioId() }));
  const frontLogo = front.layers.find((l) => !l.hidden && l.kind === "image" && l.bind === "logo");
  // The logo in the upper middle, the text under it.
  const logoH: number = H * 0.36;
  const logo: StudioLayer[] = frontLogo
    ? [{ ...frontLogo, id: studioId(), rotation: 0, h: logoH, w: Math.min(W * 0.5, (frontLogo.w / frontLogo.h) * logoH), x: 0, y: H * 0.17 }].map((l) => ({ ...l, x: W / 2 - l.w / 2 }))
    : [];
  const decor: StudioLayer[] = [...shapes, ...logo];
  const company: string = fields.company?.trim() ?? "";
  const name: string = fields.name?.trim() ?? "";
  const value: string = company || name;
  const sample: Record<ShopLang, string> = { ro: "Compania", ru: "Компания", en: "Company" };
  const sizePt = 14;
  const h: number = ptToMm(sizePt) * 1.2 + 1;
  const w: number = W - back.safeMm * 2;
  const box = { x: back.safeMm, y: (logo.length ? H * 0.72 : H / 2) - h / 2, w, h };
  const draft: StudioSurface = { ...back, background: front.background, layers: decor };
  const text: StudioTextLayer = {
    id: studioId(),
    kind: "text",
    ...box,
    rotation: 0,
    text: value || sample[lang],
    fontFamily: front.layers.find((l): l is StudioTextLayer => l.kind === "text")?.fontFamily ?? "Montserrat",
    bold: true,
    sizePt,
    color: studioInkFor(draft, layerBounds({ ...box, rotation: 0 }), "#ffffff"),
    align: "center",
    lineHeight: 1.2,
    bind: company || !name ? "company" : "name",
    ...(value ? {} : { placeholder: true }),
  };
  return [...decor, text];
}

/**
 * The document with a back: a copy of the front's style, blank (white) or a
 * back template, filled with «Datele mele». A document that has a back keeps it.
 */
export function addCardBack(doc: StudioDoc, specs: readonly StudioSurfaceSpec[], start: CardBackStart, lang: ShopLang, fields: StudioFields = {}): StudioDoc {
  if (cardHasBack(doc)) return doc;
  const spec = backSpec(specs);
  if (!spec) return doc;
  const front: StudioSurface = doc.surfaces.find((s) => s.id === CARD_FRONT_ID) ?? doc.surfaces[0]!;
  let back: StudioSurface;
  if (start.kind === "template") back = templateSurface(start.template, "card", spec, lang, fields);
  else if (start.kind === "copy") back = { ...surfaceBase(spec), background: front.background, layers: copyStyleLayers(front, surfaceBase(spec), fields, lang) };
  else back = { ...surfaceBase(spec), background: null, layers: [] };
  const withBack: StudioDoc = { ...doc, surfaces: [...doc.surfaces.filter((s) => s.id !== CARD_BACK_ID), back] };
  // Fill only the new back: the front keeps what the customer made.
  const filled: StudioDoc = applyStudioFields({ ...withBack, surfaces: [back] }, fields);
  return { ...withBack, surfaces: [...withBack.surfaces.slice(0, -1), filled.surfaces[0]!] };
}

/** «Elimină verso»: the card goes back to one printed side. */
export function removeCardBack(doc: StudioDoc): StudioDoc {
  return cardHasBack(doc) ? { ...doc, surfaces: doc.surfaces.filter((s) => s.id !== CARD_BACK_ID) } : doc;
}

/** A side's uploaded print PNG. */
export interface CardSideFile {
  fileKey: string;
  fileName: string;
  sizeBytes?: number;
  /** Small JPEG of the side (cart / edit preview). */
  thumb?: string | null;
}

/**
 * Cart line of a card design: the business-card pack (`quote`) with one
 * print PNG per printed side (`zone` front / back), the Studio approval and
 * the front as the thumbnail. Editing again keeps the line's id and place.
 */
export function cardDesignCartLine(args: {
  id: string;
  addedAt: number;
  quote: ShopQuoteLine;
  front: CardSideFile;
  back?: CardSideFile | null;
  layout: ShopDesignLayout;
  preview: string | null;
  studio: ShopLineStudio;
  title: string;
  optionsText: string;
  lastTotal: number | null;
  fallbackImage: string | null;
}): {
  id: string;
  slug: string;
  title: string;
  optionsText: string;
  image: string | null;
  quote: ShopQuoteLine;
  files: ShopFileRef[];
  lastTotal: number | null;
  addedAt: number;
  design: ShopLineDesign;
} {
  const preview: string | undefined = args.preview && args.preview.length <= SHOP_DESIGN_PREVIEW_MAX ? args.preview : undefined;
  const file = (f: CardSideFile, zone: "front" | "back"): ShopFileRef => ({
    fileKey: f.fileKey,
    fileName: f.fileName,
    ...(f.sizeBytes != null ? { sizeBytes: f.sizeBytes } : {}),
    zone,
    ...(f.thumb && f.thumb.length <= 200_000 ? { thumb: f.thumb } : {}),
  });
  const twoSided: boolean = args.quote.kind === "businessCard" && args.quote.sides === "two";
  return {
    id: args.id,
    slug: SHOP_BC_SLUG,
    title: args.title,
    optionsText: args.optionsText,
    image: preview ?? args.fallbackImage,
    quote: args.quote,
    files: [file(args.front, "front"), ...(twoSided && args.back ? [file(args.back, "back")] : [])],
    lastTotal: args.lastTotal,
    addedAt: args.addedAt,
    design: { editor: "card", layout: args.layout, ...(preview ? { preview } : {}), studio: args.studio },
  };
}
