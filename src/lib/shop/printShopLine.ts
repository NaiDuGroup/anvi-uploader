import { AdminOrderResolveError, resolveSheetProductLine } from "@/lib/adminOrderCreateHelpers";
import { prisma } from "@/lib/prisma";
import { psFormat, psProduct, type PsFormat, type PsProduct } from "@/lib/storefront/printShop/config";
import { psLinePrice, type PsPrice, type PsQuoteLine } from "@/lib/storefront/printShop/pricing";
import { psFinishingRu } from "@/lib/storefront/printShop/text";
import type { FileInput } from "@/lib/validations";
import type { ShopPaperRow } from "./businessCardShop";

/**
 * Print shop («Tipografie») line → the order as production reads it. Used by
 * the public quote and the checkout, so the quoted price is the stored one.
 *
 * - `sheet` products (flyers, postcards, invitations, menus, pocket / poster /
 *   tent calendars): a studio **flyer** line — the paper of the chosen weight,
 *   the format (studio preset or custom size), sides, the pack as the run, the
 *   shop price (`shopPack`), the imposition on A4+ and the paper write-off, as
 *   a staff-entered flyer. `businessCardLineData.shopPrint` adds the product
 *   and the finishing (lamination) for the admin and the board.
 * - `paper` products (sticker sheets — no self-adhesive paper in the catalog
 *   yet; desk calendars — assembled by hand): a `paper_print` line, one `File`
 *   row with the format and the copies, priced from the config.
 */

/** What the sheet line data carries about the shop product (`BusinessCardLineData.shopPrint`). */
export interface ShopPrintLineInfo {
  product: string;
  format: string;
  lamination?: "gloss" | "matte";
  /** Russian label for staff («Листовки · ламинация мат»). */
  finishingRu: string;
}

function paperGsm(p: ShopPaperRow): number | null {
  if (p.gsm != null) return p.gsm;
  const m = /(\d{2,3})\s*g/i.exec(p.name);
  return m ? Number(m[1]) : null;
}

/** First active paper of a weight (by sort order), or null. */
export function pickShopPaperByGsm(papers: readonly ShopPaperRow[], gsm: number): ShopPaperRow | null {
  return papers.find((p) => paperGsm(p) === gsm) ?? null;
}

function lineParts(line: PsQuoteLine): { p: PsProduct; f: PsFormat; price: PsPrice } {
  const price = psLinePrice(line);
  const p = psProduct(line.product);
  const f = p ? psFormat(p, line.format) : null;
  if (!price || !p || !f) throw new AdminOrderResolveError("ps_invalid");
  return { p, f, price };
}

/** Production path of a valid line. */
export function psLinePath(line: PsQuoteLine): "sheet" | "paper" {
  return psProduct(line.product)?.path ?? "paper";
}

/**
 * Resolve a `sheet` print-shop line into a flyer line (paper, imposition,
 * shop total). Throws {@link AdminOrderResolveError}: `ps_invalid`,
 * `bc_paper_not_found` (no active paper of that weight) and the sheet engine's codes.
 */
export async function resolveShopPrintSheetLine(line: PsQuoteLine) {
  const { p, f, price } = lineParts(line);
  if (p.path !== "sheet" || line.paper == null) throw new AdminOrderResolveError("ps_invalid");
  const papers = await prisma.sheetPaper.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, gsm: true },
  });
  const paper = pickShopPaperByGsm(papers, line.paper);
  if (!paper) throw new AdminOrderResolveError("bc_paper_not_found");
  const resolved = await resolveSheetProductLine({
    productType: "flyer",
    sheetPaperId: paper.id,
    quantity: line.quantity,
    sides: line.sides,
    cardPresetId: f.presetId ?? "custom",
    ...(f.presetId ? {} : { cardTrimWidthCm: f.trimMm.width / 10, cardTrimHeightCm: f.trimMm.height / 10 }),
    customerType: "retail",
    shopPack: { totalSellPriceMdl: price.total, pricePerCardMdl: price.unitPrice },
  });
  const shopPrint: ShopPrintLineInfo = {
    product: p.id,
    format: f.id,
    ...(line.lamination ? { lamination: line.lamination } : {}),
    finishingRu: psFinishingRu(line),
  };
  return {
    ...resolved,
    businessCardLineData: { ...resolved.businessCardLineData, artworkFit: line.fit ?? "cover", shopPrint },
  };
}

/** `paperType` of the `File` row of a paper print-shop line («A4», desk calendar «other:21x14.8»). */
export function psPaperFilePaperType(f: PsFormat): string {
  if (f.name === "A4" && f.trimMm.width === 210 && f.trimMm.height === 297) return "A4";
  return `other:${f.trimMm.width / 10}x${f.trimMm.height / 10}`;
}

/**
 * `File` rows of a paper print-shop line: the one file with the run as its
 * copies, the format and (desk calendar) the page count.
 */
export function psPaperFiles(line: PsQuoteLine, files: readonly { fileKey: string; fileName: string }[]): FileInput[] {
  const { p, f } = lineParts(line);
  return files.slice(0, 1).map((file) => ({
    fileName: file.fileName,
    fileUrl: file.fileKey,
    copies: line.quantity,
    color: "color" as const,
    paperType: psPaperFilePaperType(f),
    ...(p.pagesPerPiece ? { pageCount: p.pagesPerPiece } : {}),
  }));
}

/**
 * Files a print-shop line needs: sheet products one per printed side
 * (zones `front` / `back`); paper products exactly one. «required» when one
 * is missing, «too_many» when there is an extra one.
 */
export function psFilesProblem(line: PsQuoteLine, files: readonly { zone?: string }[]): "required" | "too_many" | null {
  if (psLinePath(line) === "paper") {
    if (files.length === 0) return "required";
    return files.length > 1 ? "too_many" : null;
  }
  const zones: string[] = files.map((f) => (f.zone === "back" ? "back" : "front"));
  const need: string[] = line.sides === "two" ? ["front", "back"] : ["front"];
  if (need.some((z) => !zones.includes(z))) return "required";
  if (zones.length !== need.length || new Set(zones).size !== zones.length) return "too_many";
  return null;
}
