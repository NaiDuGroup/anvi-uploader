import { cmToPx } from "@/lib/printDimensions";
import { buildDtfLineData } from "@/lib/dtf/buildDtfLineData";
import type { DtfGarmentJson } from "@/lib/dtf/dtfDto";
import { roundMoney2, type DtfPresetOption, type DtfUnitCosts } from "@/lib/dtf/dtfLineCalc";
import { dtfLineInputSchema } from "@/lib/dtf/dtfLineInput";
import type { DtfSettings } from "@/lib/dtf/dtfSettings";
import { tierPriceForQuantity } from "@/lib/dtf/garmentPriceTiers";
import { CART_MAX_QTY } from "@/lib/storefront/cart";
import { SHOP_DESIGN_PREVIEW_MAX, type ShopDesignLayout, type ShopLineDesign, type ShopLineStudio } from "@/lib/storefront/design";
import { CAP_ZONE_NOTE, frontPlacementFor } from "@/lib/storefront/dtfPrint";
import { inStock, maxOrderQty } from "@/lib/storefront/stock";
import type { ShopDtfColor, ShopDtfPlacement, ShopDtfZoneLine, ShopFileRef, ShopProduct, ShopQuoteLine } from "@/lib/storefront/types";
import { layerQrMatrix } from "./qr";
import type { StudioDoc, StudioLayer, StudioSurface } from "./document";
import type { StudioSurfaceSpec } from "./surfaces";

/**
 * ANVI Studio for DTF apparel (`apparel`): T-shirts, polos and caps from the
 * shop's DTF products. Pure and client-safe (unit-tested).
 *
 * One design document, one surface per print zone (`front`, `back`). A zone's
 * surface is exactly the DTF price-list format the customer picked for it
 * (A4 = 210 × 300 mm), transparent (no background: DTF prints only what is
 * drawn), exported at 300 dpi. The cap's front is its fixed 9 × 5 cm logo,
 * included in the cap price.
 *
 * A zone is printed (and priced) only when its surface has something on it,
 * so an empty back costs nothing. The cart line is the ordinary `dtf` line
 * the product page sends — colour id, sizes, zones with the format — plus one
 * transparent PNG per printed zone (`zone: "front" | "back"`, checkout files
 * `dtf:<zoneId>`), so checkout, the order view, the film layout and the price
 * engine work unchanged.
 */

export type ApparelShape = "tshirt" | "polo" | "cap";
export type ApparelZoneId = "front" | "back";

/** Which price-list formats a zone offers: every one, the logo class (longest side ≤ 10 cm), or the item's fixed logo. */
export type ApparelFormatRule = "all" | "logo" | "fixed";

export interface ApparelZoneConfig {
  id: ApparelZoneId;
  formats: ApparelFormatRule;
  /** Format a new design starts with: a label prefix («A4»), else the smallest offered. */
  defaultLabel?: string;
}

export interface ApparelGarmentConfig {
  /** Shop product slug (a `dtf` product in the catalog). */
  slug: string;
  /** Mockup drawing and zone rules. */
  shape: ApparelShape;
  zones: ApparelZoneConfig[];
}

/**
 * Garments the apparel Studio offers, in this order. Adding one = a DTF
 * product slug here (its shape picks the mockup and the zone rules).
 * Polo: the front is the left-chest logo only (the placket sits where a
 * centred chest print would go); the back takes every format.
 */
export const APPAREL_GARMENTS: readonly ApparelGarmentConfig[] = [
  {
    slug: "tricou-dogo",
    shape: "tshirt",
    zones: [
      { id: "front", formats: "all", defaultLabel: "A4" },
      { id: "back", formats: "all", defaultLabel: "A4" },
    ],
  },
  {
    slug: "polo-austral",
    shape: "polo",
    zones: [
      { id: "front", formats: "logo" },
      { id: "back", formats: "all", defaultLabel: "A4" },
    ],
  },
  { slug: "sapca-eris", shape: "cap", zones: [{ id: "front", formats: "fixed" }] },
];

export function apparelGarment(slug: string | null | undefined): ApparelGarmentConfig | null {
  return APPAREL_GARMENTS.find((g) => g.slug === slug) ?? null;
}

/** A shop product the apparel Studio can design (configured slug, DTF T-shirt or cap). */
export function isApparelProduct(product: Pick<ShopProduct, "slug" | "dtf">): boolean {
  const g = apparelGarment(product.slug);
  if (!g || !product.dtf) return false;
  return g.shape === "cap" ? product.dtf.garment === "cap" : product.dtf.garment === "tshirt";
}

/** Longest side of the logo class (left chest), cm: as `frontPlacementFor`. */
export const APPAREL_LOGO_MAX_CM = 10;
/** Print resolution of the exported zone PNGs. */
export const APPAREL_DPI = 300;
/** The cap's logo when the product carries none (as `CAP_LOGO_ZONE`). */
const CAP_FALLBACK = { widthCm: 9, heightCm: 5 };

/** One print size a zone offers. `presetId` null = the cap's fixed logo (included in the price). */
export interface ApparelFormat {
  presetId: string | null;
  label: string;
  widthCm: number;
  heightCm: number;
  /** List price of one print (retail, before the run discount); 0 for the cap's included logo. */
  price: number;
}

/** Print sizes a zone offers, smallest first. */
export function apparelZoneFormats(product: Pick<ShopProduct, "dtf">, zone: ApparelZoneConfig): ApparelFormat[] {
  const dtf = product.dtf;
  if (!dtf) return [];
  if (zone.formats === "fixed") {
    const z = dtf.fixedZone ?? CAP_FALLBACK;
    return [{ presetId: null, label: `Logo ${fmtCm(z.widthCm)}×${fmtCm(z.heightCm)}`, widthCm: z.widthCm, heightCm: z.heightCm, price: 0 }];
  }
  return dtf.prints
    .filter((p) => zone.formats === "all" || Math.max(p.widthCm, p.heightCm) <= APPAREL_LOGO_MAX_CM + 1e-6)
    .map((p) => ({ presetId: p.presetId, label: p.label, widthCm: p.widthCm, heightCm: p.heightCm, price: p.price }))
    .sort((a, b) => a.widthCm * a.heightCm - b.widthCm * b.heightCm);
}

function fmtCm(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Format a zone starts with. */
export function apparelDefaultFormat(formats: readonly ApparelFormat[], zone: ApparelZoneConfig): ApparelFormat | null {
  if (zone.defaultLabel) {
    const want: string = zone.defaultLabel.toLowerCase();
    const hit = formats.find((f) => f.label.trim().toLowerCase().startsWith(want));
    if (hit) return hit;
  }
  return formats[0] ?? null;
}

/** Picked format per zone (preset id; null = the cap's fixed logo). */
export type ApparelFormats = Partial<Record<ApparelZoneId, string | null>>;

/** The format of a zone: the picked one when still offered, else the default. */
export function apparelFormatOf(product: Pick<ShopProduct, "dtf">, zone: ApparelZoneConfig, picked: ApparelFormats): ApparelFormat | null {
  const formats = apparelZoneFormats(product, zone);
  const id = picked[zone.id];
  return formats.find((f) => f.presetId === id) ?? apparelDefaultFormat(formats, zone);
}

/** Every zone's format, resolved (defaults filled in). */
export function apparelResolvedFormats(product: Pick<ShopProduct, "dtf">, garment: ApparelGarmentConfig, picked: ApparelFormats): ApparelFormats {
  const out: ApparelFormats = {};
  for (const z of garment.zones) {
    const f = apparelFormatOf(product, z, picked);
    if (f) out[z.id] = f.presetId;
  }
  return out;
}

/**
 * Surfaces of the design: one per zone at its format, mm, transparent, no
 * bleed / safe band (the transfer is cut along the artwork's own outline).
 */
export function apparelSurfaceSpecs(product: Pick<ShopProduct, "dtf">, garment: ApparelGarmentConfig, picked: ApparelFormats): StudioSurfaceSpec[] {
  const out: StudioSurfaceSpec[] = [];
  for (const z of garment.zones) {
    const f = apparelFormatOf(product, z, picked);
    if (!f) continue;
    out.push({
      id: z.id,
      widthMm: Math.round(f.widthCm * 100) / 10,
      heightMm: Math.round(f.heightCm * 100) / 10,
      bleedMm: 0,
      safeMm: 0,
      background: null,
      dpi: APPAREL_DPI,
      pxW: cmToPx(f.widthCm, APPAREL_DPI),
      pxH: cmToPx(f.heightCm, APPAREL_DPI),
      zones: [],
      seams: [],
    });
  }
  return out;
}

/** Formats as they are drawn in a document (drafts): the offered format of each surface's size. */
export function apparelFormatsOfDoc(product: Pick<ShopProduct, "dtf">, garment: ApparelGarmentConfig, doc: Pick<StudioDoc, "surfaces"> | null | undefined): ApparelFormats {
  const out: ApparelFormats = {};
  if (!doc) return out;
  for (const z of garment.zones) {
    const s = doc.surfaces.find((x) => x.id === z.id);
    if (!s) continue;
    const f = apparelZoneFormats(product, z).find((x) => Math.abs(x.widthCm * 10 - s.widthMm) < 0.6 && Math.abs(x.heightCm * 10 - s.heightMm) < 0.6);
    if (f) out[z.id] = f.presetId;
  }
  return out;
}

/** Where the workshop presses a zone (as the product page: the size class on a T-shirt front). */
export function apparelPlacement(shape: ApparelShape, zone: ApparelZoneId, format: Pick<ApparelFormat, "widthCm" | "heightCm">): ShopDtfPlacement {
  if (shape === "cap") return "other";
  if (zone === "back") return "back";
  if (shape === "polo") return "chest_left";
  return frontPlacementFor(format);
}

// ─── What is printed ─────────────────────────────────────────────────────

/** What the quick «Text» button writes (marked `placeholder` until the customer types). */
export const APPAREL_SAMPLE_TEXTS = { ro: "Textul tău", ru: "Ваш текст", en: "Your text" } as const;

/** A text still showing a sample: flagged as such, or one of the quick button's texts in any language. */
export function isApparelSampleText(l: { kind: string; text?: string; placeholder?: boolean }): boolean {
  if (l.kind !== "text") return false;
  if (l.placeholder) return true;
  const t: string = (l.text ?? "").trim().toLowerCase();
  return Object.values(APPAREL_SAMPLE_TEXTS).some((s) => s.toLowerCase() === t);
}

/** A layer that puts ink on the transfer. */
export function apparelLayerPrints(l: StudioLayer): boolean {
  if (l.hidden) return false;
  if (l.opacity != null && l.opacity <= 0.01) return false;
  switch (l.kind) {
    case "text":
      // A sample text left as it is prints too (the verify step warns, `dtfSampleText`).
      return l.text.trim() !== "";
    case "image":
      return l.src != null;
    case "shape":
      return l.fill != null || (l.stroke != null && (l.strokeMm ?? 0) > 0);
    case "qr":
      return layerQrMatrix(l) != null;
  }
}

export function apparelSurfacePrints(s: Pick<StudioSurface, "layers">): boolean {
  return s.layers.some(apparelLayerPrints);
}

/** Zones with something on them, in the garment's zone order. */
export function apparelUsedZones(garment: ApparelGarmentConfig, doc: Pick<StudioDoc, "surfaces">): ApparelZoneId[] {
  return garment.zones.map((z) => z.id).filter((id) => {
    const s = doc.surfaces.find((x) => x.id === id);
    return s ? apparelSurfacePrints(s) : false;
  });
}

// ─── Sizes ───────────────────────────────────────────────────────────────

/** Pieces per size. */
export type ApparelSizes = Record<string, number>;

/** One size only (cap): the quantity is a stepper, not a grid. */
export function apparelOneSize(color: Pick<ShopDtfColor, "sizes"> | undefined): boolean {
  return (color?.sizes.length ?? 0) <= 1;
}

/** Most pieces of a size: its stock (when tracked), never more than the cart allows. */
export function apparelSizeMax(color: Pick<ShopDtfColor, "sizeStock">, size: string): number {
  return maxOrderQty(color.sizeStock[size], CART_MAX_QTY);
}

/** First pick of a colour: one M when it can be ordered, else one of the first size in stock. */
export function apparelStartSizes(color: Pick<ShopDtfColor, "sizes" | "sizeStock"> | undefined): ApparelSizes {
  if (!color) return {};
  const ok = color.sizes.filter((s) => inStock(color.sizeStock[s]));
  const start = ok.includes("M") ? "M" : ok[0];
  return start ? { [start]: 1 } : {};
}

/** Pieces kept within each size's stock (sizes the colour lacks or has sold out dropped). */
export function apparelClampSizes(color: Pick<ShopDtfColor, "sizes" | "sizeStock"> | undefined, sizes: ApparelSizes): ApparelSizes {
  const out: ApparelSizes = {};
  if (!color) return out;
  for (const s of color.sizes) {
    const q: number = Math.min(Math.max(0, Math.floor(sizes[s] ?? 0)), apparelSizeMax(color, s));
    if (q > 0) out[s] = q;
  }
  return out;
}

export function apparelPieces(sizes: ApparelSizes): number {
  return Object.values(sizes).reduce((a, b) => a + (b > 0 ? b : 0), 0);
}

// ─── Quote line ──────────────────────────────────────────────────────────

/** The DTF zone of a printed zone, as the product page sends it (format size included). */
export function apparelZoneLine(shape: ApparelShape, zone: ApparelZoneId, format: ApparelFormat): ShopDtfZoneLine {
  const placement: ShopDtfPlacement = apparelPlacement(shape, zone, format);
  return {
    id: zone,
    placement,
    ...(placement === "other" ? { placementNote: CAP_ZONE_NOTE } : {}),
    presetId: format.presetId,
    widthCm: format.widthCm,
    heightCm: format.heightCm,
  };
}

/**
 * The cart / quote line of a design: the colour, the sizes with pieces (in
 * the colour's size order) and one zone per printed zone. Null without a
 * colour, a piece or a printed zone.
 */
export function apparelQuoteLine(
  product: Pick<ShopProduct, "slug" | "dtf">,
  sel: { colorKey: string; formats: ApparelFormats; sizes: ApparelSizes },
  used: readonly ApparelZoneId[],
): Extract<ShopQuoteLine, { kind: "dtf" }> | null {
  const garment = apparelGarment(product.slug);
  const color = product.dtf?.colors.find((c) => c.key === sel.colorKey);
  if (!garment || !color) return null;
  const sizes = color.sizes.filter((s) => (sel.sizes[s] ?? 0) > 0).map((s) => ({ size: s, quantity: Math.floor(sel.sizes[s]!) }));
  if (sizes.length === 0) return null;
  const zones: ShopDtfZoneLine[] = [];
  for (const z of garment.zones) {
    if (!used.includes(z.id)) continue;
    const f = apparelFormatOf(product, z, sel.formats);
    if (f) zones.push(apparelZoneLine(garment.shape, z.id, f));
  }
  if (zones.length === 0) return null;
  return { kind: "dtf", garmentId: color.garmentId, sizes, zones };
}

/** The picks of a cart line (re-edit): colour, sizes and zone formats. Null when it is not this product's line. */
export function apparelSelectionOfQuote(
  product: Pick<ShopProduct, "slug" | "dtf">,
  quote: ShopQuoteLine | null | undefined,
): { colorKey: string; formats: ApparelFormats; sizes: ApparelSizes } | null {
  if (!quote || quote.kind !== "dtf") return null;
  const color = product.dtf?.colors.find((c) => c.garmentId === quote.garmentId);
  if (!color) return null;
  const sizes: ApparelSizes = {};
  for (const s of quote.sizes) sizes[s.size] = (sizes[s.size] ?? 0) + s.quantity;
  const formats: ApparelFormats = {};
  for (const z of quote.zones) if (z.id === "front" || z.id === "back") formats[z.id] = z.presetId;
  return { colorKey: color.key, formats, sizes };
}

// ─── Price (the server's own engine, client-side) ────────────────────────

/**
 * What the page gets to price a design exactly as `POST /api/public/quote`
 * does: the active DTF price list (retail), the DTF settings and the
 * product's garment colours — without costs or dealer prices (`apparelServer.ts`).
 */
export interface ApparelPricing {
  presets: DtfPresetOption[];
  settings: DtfSettings;
  garments: DtfGarmentJson[];
}

const NO_COSTS: DtfUnitCosts = { filmPerLinearMeterMdl: 0, powderPerGramMdl: 0, inkPerMlMdl: 0 };

export interface ApparelEstimate {
  total: number;
  pieces: number;
  /** Total / pieces (rounded to the bani). */
  unit: number;
}

/** The line's total from the same engine and data as the server quote (retail); null when it cannot be priced. */
export function apparelEstimate(line: Extract<ShopQuoteLine, { kind: "dtf" }> | null, pricing: ApparelPricing | null): ApparelEstimate | null {
  if (!line || !pricing) return null;
  const parsed = dtfLineInputSchema.safeParse({ garmentSource: "stock", garmentProductId: line.garmentId, sizes: line.sizes, zones: line.zones });
  if (!parsed.success) return null;
  const garment: DtfGarmentJson | null = pricing.garments.find((g) => g.id === line.garmentId) ?? null;
  try {
    const data = buildDtfLineData(parsed.data, "retail", { garment, presets: pricing.presets, settings: pricing.settings, unitCosts: NO_COSTS });
    const total: number = data.pricing.totalSellPriceMdl;
    return { total, pieces: data.quantity, unit: data.quantity > 0 ? roundMoney2(total / data.quantity) : total };
  } catch {
    return null;
  }
}

/** The bare garments of a line at its run (no print), as the engine prices them. */
function garmentOnlyTotal(line: Extract<ShopQuoteLine, { kind: "dtf" }>, pricing: ApparelPricing): number | null {
  const g = pricing.garments.find((x) => x.id === line.garmentId);
  if (!g) return null;
  const run: number = line.sizes.reduce((a, s) => a + s.quantity, 0);
  let total = 0;
  for (const s of line.sizes) {
    const v = g.variants.find((x) => x.size.toUpperCase() === s.size.toUpperCase());
    const tier = v ? tierPriceForQuantity(v.priceTiers, run) : null;
    if (!tier) return null;
    total += tier.priceMdl * s.quantity;
  }
  return roundMoney2(total);
}

/**
 * What a zone adds per piece at the current pieces (the zone tabs' «+X lei»):
 * the total with the zone minus the total without it. 0 for the cap's
 * included logo; null when it cannot be priced.
 */
export function apparelZoneDelta(
  product: Pick<ShopProduct, "slug" | "dtf">,
  sel: { colorKey: string; formats: ApparelFormats; sizes: ApparelSizes },
  used: readonly ApparelZoneId[],
  zone: ApparelZoneId,
  pricing: ApparelPricing | null,
): number | null {
  if (!pricing) return null;
  const garment = apparelGarment(product.slug);
  const z = garment?.zones.find((x) => x.id === zone);
  if (!garment || !z) return null;
  if (z.formats === "fixed") return 0;
  const sizes: ApparelSizes = apparelPieces(sel.sizes) > 0 ? sel.sizes : { [product.dtf?.colors.find((c) => c.key === sel.colorKey)?.sizes[0] ?? "M"]: 1 };
  const s2 = { ...sel, sizes };
  const withZone = apparelQuoteLine(product, s2, [...new Set([...used, zone])]);
  const others = used.filter((u) => u !== zone);
  const without = apparelQuoteLine(product, s2, others);
  const a = apparelEstimate(withZone, pricing);
  if (!a || !withZone) return null;
  const b: number | null = without ? (apparelEstimate(without, pricing)?.total ?? null) : garmentOnlyTotal(withZone, pricing);
  if (b == null) return null;
  return roundMoney2((a.total - b) / a.pieces);
}

/** The next run where the price per piece drops: «de la 10 buc. — 240 lei/buc.». */
export interface ApparelNextStep {
  minQty: number;
  unit: number;
  /** Saving per piece against the current unit price, %. */
  pct: number;
}

/**
 * The next price step above the current pieces (garment run tiers and the
 * print run discount), priced by the same engine with the extra pieces added
 * to the most-picked size; null when there is none.
 */
export function apparelNextStep(line: Extract<ShopQuoteLine, { kind: "dtf" }> | null, pricing: ApparelPricing | null): ApparelNextStep | null {
  if (!line || !pricing) return null;
  const now = apparelEstimate(line, pricing);
  if (!now) return null;
  const bounds = new Set<number>();
  const g = pricing.garments.find((x) => x.id === line.garmentId);
  for (const v of g?.variants ?? []) for (const t of v.priceTiers) bounds.add(t.minQty);
  const st = pricing.settings;
  for (const [m, p] of [
    [st.runDiscount1MinQty, st.runDiscount1Pct],
    [st.runDiscount2MinQty, st.runDiscount2Pct],
    [st.runDiscount3MinQty, st.runDiscount3Pct],
  ] as const) {
    if (m > 0 && p > 0) bounds.add(m);
  }
  const top = [...line.sizes].sort((a, b) => b.quantity - a.quantity)[0]!;
  for (const minQty of [...bounds].filter((b) => b > now.pieces).sort((a, b) => a - b)) {
    const extra: number = minQty - now.pieces;
    const at = apparelEstimate({ ...line, sizes: line.sizes.map((s) => (s === top ? { ...s, quantity: s.quantity + extra } : s)) }, pricing);
    if (!at || at.unit >= now.unit - 0.005) continue;
    return { minQty, unit: at.unit, pct: Math.round((1 - at.unit / now.unit) * 100) };
  }
  return null;
}

// ─── Cart line ───────────────────────────────────────────────────────────

/** One exported zone PNG, uploaded. */
export interface ApparelZoneFile {
  fileKey: string;
  fileName: string;
  sizeBytes?: number;
  thumb?: string | null;
}

/**
 * The cart line of an approved design: the product's own DTF line with one
 * transparent PNG per printed zone (`zone` = the zone id), the Studio
 * approval and the garment picture with the design as the line image.
 */
export function apparelDesignCartLine(args: {
  id: string;
  addedAt: number;
  slug: string;
  quote: Extract<ShopQuoteLine, { kind: "dtf" }>;
  files: Partial<Record<ApparelZoneId, ApparelZoneFile>>;
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
  const files: ShopFileRef[] = [];
  for (const z of args.quote.zones) {
    const f = args.files[z.id as ApparelZoneId];
    if (!f) continue;
    files.push({
      fileKey: f.fileKey,
      fileName: f.fileName,
      ...(f.sizeBytes != null ? { sizeBytes: f.sizeBytes } : {}),
      zone: z.id,
      ...(f.thumb && f.thumb.length <= 200_000 ? { thumb: f.thumb } : {}),
    });
  }
  return {
    id: args.id,
    slug: args.slug,
    title: args.title,
    optionsText: args.optionsText,
    image: preview ?? args.fallbackImage,
    quote: args.quote,
    files,
    lastTotal: args.lastTotal,
    addedAt: args.addedAt,
    design: { editor: "apparel", layout: args.layout, ...(preview ? { preview } : {}), studio: args.studio },
  };
}

/** What the draft keeps besides the document (colour, zone formats, sizes). */
export interface ApparelDraftState {
  colorKey: string;
  formats: ApparelFormats;
  sizes: ApparelSizes;
}

/** A stored draft's picks; null when absent or malformed. */
export function parseApparelDraftState(v: unknown): ApparelDraftState | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.colorKey !== "string" || o.colorKey.length > 80) return null;
  const formats: ApparelFormats = {};
  if (o.formats && typeof o.formats === "object") {
    for (const z of ["front", "back"] as const) {
      const f = (o.formats as Record<string, unknown>)[z];
      if (f === null || (typeof f === "string" && f.length <= 80)) formats[z] = f;
    }
  }
  const sizes: ApparelSizes = {};
  if (o.sizes && typeof o.sizes === "object") {
    for (const [k, n] of Object.entries(o.sizes as Record<string, unknown>).slice(0, 20)) {
      if (k.length <= 16 && typeof n === "number" && Number.isFinite(n) && n > 0) sizes[k] = Math.min(CART_MAX_QTY, Math.floor(n));
    }
  }
  return { colorKey: o.colorKey, formats, sizes };
}
