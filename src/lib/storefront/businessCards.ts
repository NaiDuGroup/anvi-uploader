import { checkBusinessCardArtwork } from "@/lib/businessCard/businessCardArtworkCheck";
import { effectiveDpi } from "./dtfPrint";

/**
 * Storefront business cards (cărți de vizită): one product with fixed packs,
 * a price per card and the studio's default heavy paper. The ONE place the
 * shop price lives — the product page, `POST /api/public/quote` (kind
 * `businessCard` with `pricing: "shopPack"`) and the server checkout all
 * read it, so the quote and the order always agree.
 *
 * Printed on the Ricoh Pro C5200s, imposed on A4+ and cut on the guillotine,
 * like a staff-entered business-card line.
 *
 * Client-safe (no server imports).
 *
 * ⚠ Pending owner approval (pilot assumptions, 2026-11-04):
 * - size 90×50 mm, bleed 2 mm per side (file 94×54 mm), safe zone 4 mm;
 * - paper: the active «A4+ 350gr» sheet paper (see `SHOP_BC_PAPER_GSM`);
 * - back side: +0.5 lei per card (`SHOP_BC_BACK_PER_CARD_MDL`);
 * - packs 100 / 200 / 300 / 500 / 1000, all at the same per-card price;
 * - no lamination / Touch Cover / rounded corners in the pilot.
 */

export const SHOP_BC_SLUG = "carti-de-vizita";
/** Card illustration for listings and the cart (`public/business-cards.svg`). */
export const SHOP_BC_IMAGE = "/business-cards.svg";

/** Packs offered (cards). Every pack is priced at the same rate per card. */
export const SHOP_BC_PACKS = [100, 200, 300, 500, 1000] as const;
export type ShopBcPack = (typeof SHOP_BC_PACKS)[number];
export const SHOP_BC_DEFAULT_PACK: ShopBcPack = 100;

/** Owner-approved: 1.5 lei per card, front printed (100 pcs = 150 lei). */
export const SHOP_BC_PRICE_PER_CARD_MDL = 1.5;
/** Back side add-on per card (lei). ⚠ Needs owner approval. */
export const SHOP_BC_BACK_PER_CARD_MDL = 0.5;

export const SHOP_BC_SIDES = ["one", "two"] as const;
export type ShopBcSides = (typeof SHOP_BC_SIDES)[number];

/** Finished size (mm) — the studio preset `trim_90x50`. */
export const SHOP_BC_TRIM_MM = { width: 90, height: 50 } as const;
export const SHOP_BC_PRESET_ID = "trim_90x50" as const;
/** Bleed per side (mm), the same 0.2 cm the studio imposition adds. */
export const SHOP_BC_BLEED_MM = 2;
/** Keep text and logos this far inside the cut line (mm). */
export const SHOP_BC_SAFE_MM = 4;
/** The file the customer sends: trim + bleed on every side (94×54 mm). */
export const SHOP_BC_FILE_MM = {
  width: SHOP_BC_TRIM_MM.width + 2 * SHOP_BC_BLEED_MM,
  height: SHOP_BC_TRIM_MM.height + 2 * SHOP_BC_BLEED_MM,
} as const;

/** Recommended resolution of a raster file. */
export const SHOP_BC_DPI = 300;
/** Default paper weight the server picks from the active sheet papers. ⚠ Needs owner approval. */
export const SHOP_BC_PAPER_GSM = 350;

/** File-zone ids of the two faces (cart files, checkout `zone`). */
export const SHOP_BC_ZONES = ["front", "back"] as const;
export type ShopBcZone = (typeof SHOP_BC_ZONES)[number];

/**
 * How a face is put on the 94×54 card when its proportions differ:
 * `cover` = fill the card and crop the overflow (default), `contain` = the
 * whole image inside the card with white margins. The imposition follows it.
 */
export const SHOP_BC_FITS = ["cover", "contain"] as const;
export type ShopBcFit = (typeof SHOP_BC_FITS)[number];
export const SHOP_BC_DEFAULT_FIT: ShopBcFit = "cover";

export function isShopBcFit(v: unknown): v is ShopBcFit {
  return v === "cover" || v === "contain";
}

/** The fit of a shop line (default: fill / crop). */
export function shopBcFitOf(line: { fit?: unknown }): ShopBcFit {
  return isShopBcFit(line.fit) ? line.fit : SHOP_BC_DEFAULT_FIT;
}

export function isShopBcPack(n: unknown): n is ShopBcPack {
  return typeof n === "number" && (SHOP_BC_PACKS as readonly number[]).includes(n);
}

export function isShopBcSides(v: unknown): v is ShopBcSides {
  return v === "one" || v === "two";
}

/** Price per card for the chosen sides (lei). */
export function shopBcPerCardMdl(sides: ShopBcSides): number {
  return Math.round((SHOP_BC_PRICE_PER_CARD_MDL + (sides === "two" ? SHOP_BC_BACK_PER_CARD_MDL : 0)) * 100) / 100;
}

/** Total for a pack (lei), or null when `quantity` is not one of the packs. */
export function shopBcTotalMdl(quantity: number, sides: ShopBcSides): number | null {
  if (!isShopBcPack(quantity) || !isShopBcSides(sides)) return null;
  return Math.round(quantity * shopBcPerCardMdl(sides) * 100) / 100;
}

/** Faces that need a file: front, plus back when double-sided. */
export function shopBcRequiredZones(sides: ShopBcSides): ShopBcZone[] {
  return sides === "two" ? ["front", "back"] : ["front"];
}

/** Pixels of a 94×54 mm file at `dpi` (300 dpi → 1110×638). */
export function shopBcExpectedPx(dpi: number = SHOP_BC_DPI): { width: number; height: number } {
  return {
    width: Math.round((SHOP_BC_FILE_MM.width / 25.4) * dpi),
    height: Math.round((SHOP_BC_FILE_MM.height / 25.4) * dpi),
  };
}

export type ShopBcArtworkIssue = "no_bleed" | "wrong_proportions" | "too_small" | "low_dpi";

export interface ShopBcArtworkCheck {
  /** No issue found (a file we could not measure is not «ok», it is unknown). */
  ok: boolean;
  issues: ShopBcArtworkIssue[];
  /** Raster: effective resolution over 94×54 mm. */
  dpi?: number;
  /** Raster: the image's pixels. */
  px?: { width: number; height: number };
  /** Measured size of the file (mm), PDF page or raster at 300 dpi. */
  sizeMm?: { width: number; height: number };
}

const TRIM_CM = { widthCm: SHOP_BC_TRIM_MM.width / 10, heightCm: SHOP_BC_TRIM_MM.height / 10 };
const FILE_CM = { widthCm: SHOP_BC_FILE_MM.width / 10, heightCm: SHOP_BC_FILE_MM.height / 10 };

/**
 * Size / quality check of a card face. A PDF is judged by its page size
 * (must be 94×54 mm, either orientation); a raster image by its proportions
 * (94:54, not the 90:50 of a file without bleed) and by its resolution over
 * 94×54 mm (≥ 300 dpi). Warnings only — the studio checks every file too.
 * Null when nothing could be measured.
 */
export function checkShopBcArtwork(input: {
  px?: { width: number; height: number } | null;
  pageMm?: { width: number; height: number } | null;
}): ShopBcArtworkCheck | null {
  if (input.pageMm && input.pageMm.width > 0 && input.pageMm.height > 0) {
    const sizeMm = { width: round1(input.pageMm.width), height: round1(input.pageMm.height) };
    const r = checkBusinessCardArtwork({ widthCm: input.pageMm.width / 10, heightCm: input.pageMm.height / 10 }, TRIM_CM);
    return r.ok ? { ok: true, issues: [], sizeMm } : { ok: false, issues: [r.issue], sizeMm };
  }
  const px = input.px;
  if (!px || !(px.width > 0) || !(px.height > 0)) return null;
  const dpi: number = effectiveDpi(px, FILE_CM);
  const at300 = { widthCm: (px.width / SHOP_BC_DPI) * 2.54, heightCm: (px.height / SHOP_BC_DPI) * 2.54 };
  const r = checkBusinessCardArtwork(at300, TRIM_CM);
  const issues: ShopBcArtworkIssue[] = [];
  // «too_small» at 300 dpi is the resolution warning below.
  if (!r.ok && r.issue !== "too_small") issues.push(r.issue);
  if (dpi < SHOP_BC_DPI * 0.97) issues.push("low_dpi");
  return { ok: issues.length === 0, issues, dpi, px: { width: px.width, height: px.height }, sizeMm: { width: round1(at300.widthCm * 10), height: round1(at300.heightCm * 10) } };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Print template (SVG, 94×54 mm): white bleed area, the cut line and the
 * safe zone, with short notes. Built on the fly — nothing to host.
 */
export function shopBcTemplateSvg(labels: { bleed: string; trim: string; safe: string }): string {
  const W = SHOP_BC_FILE_MM.width;
  const H = SHOP_BC_FILE_MM.height;
  const b = SHOP_BC_BLEED_MM;
  const s = SHOP_BC_BLEED_MM + SHOP_BC_SAFE_MM;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#fde2e2"/>`,
    `<rect x="${b}" y="${b}" width="${W - 2 * b}" height="${H - 2 * b}" fill="#ffffff" stroke="#e11d48" stroke-width="0.25"/>`,
    `<rect x="${s}" y="${s}" width="${W - 2 * s}" height="${H - 2 * s}" fill="none" stroke="#2563eb" stroke-width="0.25" stroke-dasharray="1 0.8"/>`,
    `<text x="${W / 2}" y="1.5" font-family="Arial, sans-serif" font-size="1.4" fill="#9f1239" text-anchor="middle">${esc(labels.bleed)}</text>`,
    `<text x="${b + 0.8}" y="${H - b - 0.8}" font-family="Arial, sans-serif" font-size="1.6" fill="#e11d48">${esc(labels.trim)}</text>`,
    `<text x="${W / 2}" y="${H / 2}" font-family="Arial, sans-serif" font-size="2" fill="#2563eb" text-anchor="middle">${esc(labels.safe)}</text>`,
    `</svg>`,
  ].join("");
}

/**
 * Where an image of `img` px lands in a `box` (same units as the box) for a
 * fit: `cover` fills the box and crops the overflow, `contain` keeps all of
 * it inside with margins — centred, as the imposition (sharp, «centre») does.
 */
export function shopBcFitRect(
  img: { width: number; height: number },
  box: { width: number; height: number },
  fit: ShopBcFit,
): { x: number; y: number; width: number; height: number } {
  if (!(img.width > 0) || !(img.height > 0)) return { x: 0, y: 0, width: box.width, height: box.height };
  const sx: number = box.width / img.width;
  const sy: number = box.height / img.height;
  const s: number = fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
  const width: number = img.width * s;
  const height: number = img.height * s;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

/** Cart thumbnail of a PDF face: a white card with a «PDF» mark (SVG data URL). */
export function shopBcPdfThumbUrl(): string {
  const W = SHOP_BC_FILE_MM.width;
  const H = SHOP_BC_FILE_MM.height;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`,
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="2" fill="#fff" stroke="#d4d4d8"/>`,
    `<rect x="${W / 2 - 13}" y="${H / 2 - 10}" width="26" height="20" rx="3" fill="#dc2626"/>`,
    `<text x="${W / 2}" y="${H / 2 + 4.2}" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">PDF</text>`,
    `</svg>`,
  ].join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
