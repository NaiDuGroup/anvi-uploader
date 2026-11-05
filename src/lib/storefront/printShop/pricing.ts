import { checkBusinessCardArtwork } from "@/lib/businessCard/businessCardArtworkCheck";
import { computeBusinessCardSheetLayout } from "@/lib/businessCard/businessCardSheetLayout";
import { effectiveDpi } from "../dtfPrint";
import {
  PS_BLEED_MM,
  PS_DPI,
  PS_LAMINATION_MDL,
  PS_PAPER_SIDE_PRICE_MDL,
  PS_PRODUCT_IDS,
  PS_SAFE_MM,
  PS_SHEET_CM,
  psFormat,
  psProduct,
  type PsFormat,
  type PsLamination,
  type PsProduct,
  type PsProductId,
  type PsSides,
} from "./config";

/**
 * Print shop («Tipografie») line: the shape the cart keeps, the quote and the
 * checkout accept (`kind: "sheetShop"`), its validation and its price. Pure,
 * client-safe — the page's live price and the server re-price are the same
 * function ({@link psLinePrice}).
 */

export type PsFit = "cover" | "contain";

export interface PsQuoteLine {
  kind: "sheetShop";
  product: PsProductId;
  format: string;
  /** Paper weight (g/m²); only for `sheet` products. */
  paper?: number;
  sides: PsSides;
  /** Pieces (sticker sheets: sheets; desk calendars: calendars). One of the product's packs. */
  quantity: number;
  lamination?: PsLamination;
  /** Sticker sheets: contour cut («decupat»). */
  cut?: boolean;
  /** Artwork of other proportions: crop to fill (default) or fit with white margins. */
  fit?: PsFit;
}

export type PsInvalidCode =
  | "ps_product"
  | "ps_format"
  | "ps_paper"
  | "ps_sides"
  | "ps_pack"
  | "ps_lamination"
  | "ps_cut"
  | "ps_fit";

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** Why a line is not a valid print-shop line, or null. Unknown keys are refused (as the strict server schema). */
export function psLineProblem(v: unknown): PsInvalidCode | "invalid_input" | null {
  if (!isObj(v) || v.kind !== "sheetShop") return "invalid_input";
  const allowed = new Set(["kind", "product", "format", "paper", "sides", "quantity", "lamination", "cut", "fit"]);
  if (Object.keys(v).some((k) => !allowed.has(k))) return "invalid_input";
  if (typeof v.product !== "string" || !(PS_PRODUCT_IDS as readonly string[]).includes(v.product)) return "ps_product";
  const p = psProduct(v.product)!;
  if (typeof v.format !== "string" || !psFormat(p, v.format)) return "ps_format";
  const f = psFormat(p, v.format)!;
  if (p.papers.length) {
    if (typeof v.paper !== "number" || !p.papers.includes(v.paper)) return "ps_paper";
  } else if (v.paper != null) return "ps_paper";
  if (v.sides !== "one" && v.sides !== "two") return "ps_sides";
  if (!p.sides.includes(v.sides)) return "ps_sides";
  if (typeof v.quantity !== "number" || !p.packs.includes(v.quantity)) return "ps_pack";
  if (v.lamination != null) {
    if (v.lamination !== "gloss" && v.lamination !== "matte") return "ps_lamination";
    if (!p.lamination?.finishes.includes(v.lamination) || !f.laminationSize) return "ps_lamination";
    if (v.cut === true) return "ps_lamination";
  }
  if (v.cut != null && (typeof v.cut !== "boolean" || (v.cut && !p.cut))) return "ps_cut";
  if (v.fit != null && v.fit !== "cover" && v.fit !== "contain") return "ps_fit";
  return null;
}

export function isPsQuoteLine(v: unknown): v is PsQuoteLine {
  return psLineProblem(v) === null;
}

// ─── Geometry ────────────────────────────────────────────────────────────────

export function psBleedMm(p: PsProduct): number {
  return p.bleedMm ?? PS_BLEED_MM;
}

export function psSafeMm(p: PsProduct): number {
  return p.safeMm ?? PS_SAFE_MM;
}

/** The file the customer sends: finished size + bleed on every side (mm). */
export function psFileMm(p: PsProduct, f: PsFormat): { width: number; height: number } {
  const b: number = psBleedMm(p);
  return { width: f.trimMm.width + 2 * b, height: f.trimMm.height + 2 * b };
}

/** Pieces of a format on one A4+ sheet (the studio imposition: trim + 2 mm bleed, no gap). */
export function psPiecesPerSheet(p: PsProduct, f: PsFormat): number {
  const file = psFileMm(p, f);
  return computeBusinessCardSheetLayout({
    sheetWidthCm: PS_SHEET_CM.widthCm,
    sheetHeightCm: PS_SHEET_CM.heightCm,
    cardWidthCm: file.width / 10,
    cardHeightCm: file.height / 10,
  }).cardsPerSheet;
}

/** Files of a line: `front` (+ `back` when two-sided). Paper products take one file. */
export type PsZone = "front" | "back";
export function psRequiredZones(line: Pick<PsQuoteLine, "sides">): PsZone[] {
  return line.sides === "two" ? ["front", "back"] : ["front"];
}

// ─── Price ───────────────────────────────────────────────────────────────────

export interface PsPrice {
  quantity: number;
  /** Pieces per A4+ sheet and sheets used (sheet products); pages for the desk calendar. */
  piecesPerSheet: number | null;
  sheets: number | null;
  /** Print per piece (sides and cut included), lei — before lamination. */
  printPerPiece: number;
  laminationPerPiece: number;
  /** Whole line, lei (rounded to whole lei — ⚠ ASSUMPTION for non-round per-piece prices such as DL 3.33). */
  total: number;
  unitPrice: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Lamination price per piece for a finish, or null when not offered. */
export function psLaminationPerPiece(p: PsProduct, f: PsFormat, finish: PsLamination): number | null {
  if (!p.lamination?.finishes.includes(finish) || !f.laminationSize) return null;
  return p.lamination.override?.[finish] ?? PS_LAMINATION_MDL[f.laminationSize][finish];
}

/** Print price per piece (lei) for the options; null when not offered. */
export function psPrintPerPiece(p: PsProduct, f: PsFormat, paper: number | null, sides: PsSides, cut: boolean): number | null {
  if (!p.sides.includes(sides)) return null;
  if (cut) return p.cut ? p.cut.perPiece : null;
  if (p.pricing.kind === "fixed") return p.pricing.perPiece[sides] ?? null;
  const side: number | undefined = paper != null ? PS_PAPER_SIDE_PRICE_MDL[paper] : undefined;
  const per: number = psPiecesPerSheet(p, f);
  if (side == null || per < 1) return null;
  return (side * (sides === "two" ? 2 : 1)) / per;
}

/** Price of a line, or null when it is not a valid print-shop line. */
export function psLinePrice(line: unknown): PsPrice | null {
  if (!isPsQuoteLine(line)) return null;
  const p = psProduct(line.product)!;
  const f = psFormat(p, line.format)!;
  const print = psPrintPerPiece(p, f, line.paper ?? null, line.sides, line.cut === true);
  if (print == null) return null;
  const lam: number = line.lamination ? (psLaminationPerPiece(p, f, line.lamination) ?? NaN) : 0;
  if (!Number.isFinite(lam)) return null;
  const total: number = Math.round(line.quantity * (print + lam));
  const per: number | null = p.path === "sheet" ? psPiecesPerSheet(p, f) : null;
  return {
    quantity: line.quantity,
    piecesPerSheet: per,
    sheets: per ? Math.ceil(line.quantity / per) : p.id === "stickerSheets" ? line.quantity : null,
    printPerPiece: round2(print),
    laminationPerPiece: lam,
    total,
    unitPrice: round2(total / line.quantity),
  };
}

/** Lowest price per piece of a product (its cheapest format, paper and one side), for listings. */
export function psFromPerPiece(p: PsProduct): number {
  let best = Infinity;
  for (const f of p.formats) {
    for (const paper of p.papers.length ? p.papers : [null]) {
      for (const s of p.sides) {
        const v = psPrintPerPiece(p, f, paper, s, false);
        if (v != null && v < best) best = v;
      }
    }
  }
  return round2(best);
}

/** Total of the default configuration (listing «from» price). */
export function psDefaultLine(p: PsProduct): PsQuoteLine {
  return {
    kind: "sheetShop",
    product: p.id,
    format: p.formats[0]!.id,
    ...(p.defaultPaper != null ? { paper: p.defaultPaper } : {}),
    sides: p.sides[0]!,
    quantity: p.defaultPack,
  };
}

// ─── Artwork check ───────────────────────────────────────────────────────────

export type PsArtworkIssue = "no_bleed" | "wrong_proportions" | "too_small" | "low_dpi" | "pages";

export interface PsArtworkCheck {
  ok: boolean;
  issues: PsArtworkIssue[];
  dpi?: number;
  px?: { width: number; height: number };
  sizeMm?: { width: number; height: number };
  pages?: number;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Size / quality check of a file for a format: a PDF by its page size (and
 * page count when the product has several pages), an image by its
 * proportions (trim + bleed) and its resolution at the file size (≥ 300 dpi).
 * Warnings only — the studio checks every file too. Null when unmeasurable.
 */
export function psCheckArtwork(
  p: PsProduct,
  f: PsFormat,
  input: { px?: { width: number; height: number } | null; pageMm?: { width: number; height: number } | null; pages?: number | null },
): PsArtworkCheck | null {
  const trimCm = { widthCm: f.trimMm.width / 10, heightCm: f.trimMm.height / 10 };
  const bleedCm: number = psBleedMm(p) / 10;
  const pageIssue: PsArtworkIssue[] =
    p.pagesPerPiece && input.pages != null && input.pages !== p.pagesPerPiece ? ["pages"] : [];
  if (input.pageMm && input.pageMm.width > 0 && input.pageMm.height > 0) {
    const sizeMm = { width: r1(input.pageMm.width), height: r1(input.pageMm.height) };
    const r = checkBusinessCardArtwork({ widthCm: input.pageMm.width / 10, heightCm: input.pageMm.height / 10 }, trimCm, bleedCm);
    const issues: PsArtworkIssue[] = [...(r.ok ? [] : [r.issue]), ...pageIssue];
    return { ok: issues.length === 0, issues, sizeMm, ...(input.pages != null ? { pages: input.pages } : {}) };
  }
  const px = input.px;
  if (!px || !(px.width > 0) || !(px.height > 0)) return pageIssue.length ? { ok: false, issues: pageIssue } : null;
  const file = psFileMm(p, f);
  const dpi: number = effectiveDpi(px, { widthCm: file.width / 10, heightCm: file.height / 10 });
  const at300 = { widthCm: (px.width / PS_DPI) * 2.54, heightCm: (px.height / PS_DPI) * 2.54 };
  const r = checkBusinessCardArtwork(at300, trimCm, bleedCm);
  const issues: PsArtworkIssue[] = [];
  if (!r.ok && r.issue !== "too_small") issues.push(r.issue);
  if (dpi < PS_DPI * 0.97) issues.push("low_dpi");
  issues.push(...pageIssue);
  return { ok: issues.length === 0, issues, dpi, px: { ...px }, sizeMm: { width: r1(at300.widthCm * 10), height: r1(at300.heightCm * 10) } };
}

/** Pixels of the file at `dpi`. */
export function psExpectedPx(p: PsProduct, f: PsFormat, dpi: number = PS_DPI): { width: number; height: number } {
  const file = psFileMm(p, f);
  return { width: Math.round((file.width / 25.4) * dpi), height: Math.round((file.height / 25.4) * dpi) };
}

/** Where an image lands in a box for a fit (centred; `cover` crops, `contain` adds margins). */
export function psFitRect(
  img: { width: number; height: number },
  box: { width: number; height: number },
  fit: PsFit,
): { x: number; y: number; width: number; height: number } {
  if (!(img.width > 0) || !(img.height > 0)) return { x: 0, y: 0, width: box.width, height: box.height };
  const s: number = fit === "cover" ? Math.max(box.width / img.width, box.height / img.height) : Math.min(box.width / img.width, box.height / img.height);
  return { x: (box.width - img.width * s) / 2, y: (box.height - img.height * s) / 2, width: img.width * s, height: img.height * s };
}

/**
 * Print template (SVG at the file size): bleed area, cut line, safe zone, the
 * fold line for a tent calendar. Built on the fly — nothing to host.
 */
export function psTemplateSvg(p: PsProduct, f: PsFormat, labels: { bleed: string; trim: string; safe: string; fold: string }): string {
  const { width: W, height: H } = psFileMm(p, f);
  const b: number = psBleedMm(p);
  const s: number = b + psSafeMm(p);
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fs: number = Math.max(2, Math.min(W, H) / 40);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="${b > 0 ? "#fde2e2" : "#ffffff"}"/>`,
    `<rect x="${b}" y="${b}" width="${W - 2 * b}" height="${H - 2 * b}" fill="#ffffff" stroke="#e11d48" stroke-width="0.3"/>`,
    `<rect x="${s}" y="${s}" width="${W - 2 * s}" height="${H - 2 * s}" fill="none" stroke="#2563eb" stroke-width="0.3" stroke-dasharray="1.2 1"/>`,
  ];
  if (b > 0) parts.push(`<text x="${W / 2}" y="${Math.max(1.4, b * 0.75)}" font-family="Arial, sans-serif" font-size="${Math.min(1.6, b * 0.7)}" fill="#9f1239" text-anchor="middle">${esc(labels.bleed)}</text>`);
  parts.push(`<text x="${b + 1}" y="${H - b - 1}" font-family="Arial, sans-serif" font-size="${fs * 0.8}" fill="#e11d48">${esc(labels.trim)}</text>`);
  parts.push(`<text x="${W / 2}" y="${H / 2 - (f.foldHalf ? fs * 1.5 : 0)}" font-family="Arial, sans-serif" font-size="${fs}" fill="#2563eb" text-anchor="middle">${esc(labels.safe)}</text>`);
  if (f.foldHalf) {
    parts.push(`<line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#16a34a" stroke-width="0.4" stroke-dasharray="3 1.5"/>`);
    parts.push(`<text x="${W / 2}" y="${H / 2 + fs * 1.4}" font-family="Arial, sans-serif" font-size="${fs * 0.8}" fill="#16a34a" text-anchor="middle">${esc(labels.fold)}</text>`);
  }
  parts.push(`</svg>`);
  return parts.join("");
}

/** «148×210 mm». */
export function psSizeText(f: PsFormat): string {
  const s = `${f.trimMm.width}×${f.trimMm.height}`;
  return f.name ? `${f.name} ${s}` : s;
}
