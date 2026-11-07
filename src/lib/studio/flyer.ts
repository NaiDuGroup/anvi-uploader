import type { PrintSizeCm } from "@/lib/printDimensions";
import type { ShopDesignLayout, ShopLineDesign, ShopLineStudio } from "@/lib/storefront/design";
import { SHOP_DESIGN_PREVIEW_MAX } from "@/lib/storefront/design";
import { PS_DPI, psProduct, type PsFormat, type PsLamination, type PsProduct } from "@/lib/storefront/printShop/config";
import { psFileMm, psLinePrice, type PsQuoteLine } from "@/lib/storefront/printShop/pricing";
import type { ShopFileRef, ShopQuoteLine } from "@/lib/storefront/types";
import type { StudioDoc } from "./document";
import { CARD_BACK_ID, type StudioSurfaceSpec } from "./surfaces";

/**
 * Flyers in ANVI Studio (`flyer`): the formats of the print-shop flyer
 * product (`printShop/config.ts`: A6, A5, DL, A4 — portrait), the print file
 * of each (trim + 2 mm bleed at 300 dpi, exactly what the upload page asks
 * for) and the cart line: the ordinary print-shop flyer line
 * (`kind: "sheetShop"`, product `flyers`, priced by `psLinePrice` — no new
 * prices) with one PNG per printed side in the `front` / `back` zones, so
 * the checkout and the workshop imposition treat it like an uploaded flyer.
 * Pure (unit-tested).
 */

export const FLYER_PRODUCT_ID = "flyers" as const;
export const FLYER_IDS = ["a6", "a5", "dl", "a4"] as const;
export type FlyerFormatId = (typeof FLYER_IDS)[number];
export const FLYER_DEFAULT_FORMAT: FlyerFormatId = "a5";

export function flyerProduct(): PsProduct {
  return psProduct(FLYER_PRODUCT_ID)!;
}

export function isFlyerFormatId(v: unknown): v is FlyerFormatId {
  return typeof v === "string" && (FLYER_IDS as readonly string[]).includes(v);
}

export function flyerFormat(id: FlyerFormatId | string): PsFormat {
  const p = flyerProduct();
  return p.formats.find((f) => f.id === id) ?? p.formats.find((f) => f.id === FLYER_DEFAULT_FORMAT)!;
}

/** The print file of a format (trim + bleed, mm). */
export function flyerFileMm(id: FlyerFormatId | string): { width: number; height: number } {
  return psFileMm(flyerProduct(), flyerFormat(id));
}

/** The Studio print area of a format (what `studioSurfaces("flyer", …)` takes). */
export function flyerPrint(id: FlyerFormatId | string): PrintSizeCm {
  const f = flyerFileMm(id);
  return { widthCm: f.width / 10, heightCm: f.height / 10, dpi: PS_DPI };
}

/** The format a document was made for (by its file size), else null. */
export function flyerFormatOfDoc(doc: Pick<StudioDoc, "surfaces"> | null | undefined): FlyerFormatId | null {
  const s = doc?.surfaces[0];
  if (!s) return null;
  for (const id of FLYER_IDS) {
    const f = flyerFileMm(id);
    if (Math.abs(f.width - s.widthMm) < 0.6 && Math.abs(f.height - s.heightMm) < 0.6) return id;
  }
  return null;
}

/** DL (99 × 210) is much taller than the ISO formats: templates have their own DL layout. */
export function isTallFlyer(widthMm: number, heightMm: number): boolean {
  return heightMm / widthMm > 1.8;
}

export interface FlyerOrderOptions {
  format: FlyerFormatId;
  paper: number;
  pack: number;
  lamination?: PsLamination | null;
}

export function flyerDefaultOptions(format: FlyerFormatId = FLYER_DEFAULT_FORMAT): FlyerOrderOptions {
  const p = flyerProduct();
  return { format, paper: p.defaultPaper ?? p.papers[0]!, pack: p.defaultPack, lamination: null };
}

/** The print-shop flyer line of a design (sides from the document: a back = two-sided, priced × 2 by the list). */
export function flyerQuoteLine(doc: Pick<StudioDoc, "surfaces">, opts: FlyerOrderOptions): PsQuoteLine {
  const p = flyerProduct();
  const f = flyerFormat(opts.format);
  const paper: number = p.papers.includes(opts.paper) ? opts.paper : (p.defaultPaper ?? p.papers[0]!);
  const pack: number = p.packs.includes(opts.pack) ? opts.pack : p.defaultPack;
  const lam: PsLamination | null = opts.lamination && f.laminationSize && p.lamination?.finishes.includes(opts.lamination) ? opts.lamination : null;
  return {
    kind: "sheetShop",
    product: FLYER_PRODUCT_ID,
    format: f.id,
    paper,
    sides: doc.surfaces.some((s) => s.id === CARD_BACK_ID) ? "two" : "one",
    quantity: pack,
    ...(lam ? { lamination: lam } : {}),
  };
}

/** Order options of a cart line's flyer quote (editing the line again). */
export function flyerOptionsOfQuote(q: ShopQuoteLine | null | undefined): FlyerOrderOptions | null {
  if (!q || q.kind !== "sheetShop") return null;
  const ps = q as PsQuoteLine;
  if (ps.product !== FLYER_PRODUCT_ID || !isFlyerFormatId(ps.format)) return null;
  return { format: ps.format, paper: ps.paper ?? flyerDefaultOptions().paper, pack: ps.quantity, lamination: ps.lamination ?? null };
}

/** Export size in pixels of a format at 300 dpi (what the upload page expects). */
export function flyerExportPx(id: FlyerFormatId): { width: number; height: number } {
  const f = flyerFileMm(id);
  return { width: Math.round((f.width / 25.4) * PS_DPI), height: Math.round((f.height / 25.4) * PS_DPI) };
}

export interface FlyerSideFile {
  fileKey: string;
  fileName: string;
  sizeBytes?: number;
  thumb?: string | null;
}

/**
 * Cart line of a flyer design: the print-shop flyer line (`quote`) with one
 * print PNG per printed side (`zone` front / back — the checkout stores them
 * as the front / back faces the imposition reads), the Studio approval and
 * the front as the thumbnail.
 */
export function flyerDesignCartLine(args: {
  id: string;
  addedAt: number;
  quote: PsQuoteLine;
  front: FlyerSideFile;
  back?: FlyerSideFile | null;
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
  const file = (f: FlyerSideFile, zone: "front" | "back"): ShopFileRef => ({
    fileKey: f.fileKey,
    fileName: f.fileName,
    ...(f.sizeBytes != null ? { sizeBytes: f.sizeBytes } : {}),
    zone,
    ...(f.thumb && f.thumb.length <= 200_000 ? { thumb: f.thumb } : {}),
  });
  return {
    id: args.id,
    slug: flyerProduct().slug,
    title: args.title,
    optionsText: args.optionsText,
    image: preview ?? args.fallbackImage,
    quote: args.quote as ShopQuoteLine,
    files: [file(args.front, "front"), ...(args.quote.sides === "two" && args.back ? [file(args.back, "back")] : [])],
    lastTotal: args.lastTotal,
    addedAt: args.addedAt,
    design: { editor: "flyer", layout: args.layout, ...(preview ? { preview } : {}), studio: args.studio },
  };
}

// ─── Format switch ───────────────────────────────────────────────────────

/**
 * A flyer line's total from the print-shop list (`psLinePrice`, pure — what
 * `/api/public/quote` answers for it too), null when the list has no price.
 */
export function flyerListTotal(line: ShopQuoteLine | PsQuoteLine | null | undefined): number | null {
  return line ? (psLinePrice(line)?.total ?? null) : null;
}

/** «152x214» — the size a surface / spec is drawn at. */
export function sheetSizeKey(s: Pick<StudioSurfaceSpec, "widthMm" | "heightMm">): string {
  return `${Math.round(s.widthMm * 10)}x${Math.round(s.heightMm * 10)}`;
}

/** The sizes of all the product's surfaces (another flyer format = another key). */
export function sheetSpecsKey(specs: readonly Pick<StudioSurfaceSpec, "id" | "widthMm" | "heightMm">[]): string {
  return specs.map((s) => `${s.id}:${sheetSizeKey(s)}`).join(",");
}

/** The document's side for this spec is drawn at the spec's size (not the previous format's). */
export function docFitsSpec(doc: Pick<StudioDoc, "surfaces">, spec: Pick<StudioSurfaceSpec, "id" | "widthMm" | "heightMm">): boolean {
  const s = doc.surfaces.find((x) => x.id === spec.id);
  return !s || sheetSizeKey(s) === sheetSizeKey(spec);
}
