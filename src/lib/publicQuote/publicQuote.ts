import { AdminOrderResolveError, resolveSheetProductLine } from "@/lib/adminOrderCreateHelpers";
import { DtfLineError, DtfLineErrorCode } from "@/lib/dtf/dtfLineCalc";
import { dtfLineInputSchema, type DtfLineInput } from "@/lib/dtf/dtfLineInput";
import { dtfLayoutRunQuantities } from "@/lib/dtf/dtfLayoutRuns";
import { cappedTierTotal, tierPriceForQuantity } from "@/lib/dtf/garmentPriceTiers";
import { dtfVariantPriceTiers } from "@/lib/dtf/stockGarments";
import { resolveDtfLine } from "@/lib/dtf/resolveDtfLine";
import type { DtfLineData } from "@/lib/dtf/types";
import { loadMugVariant } from "@/lib/mug/mugVariant";
import { loadNotebookVariant } from "@/lib/notebook/notebookVariant";
import { loadPenVariant } from "@/lib/pen/penVariant";
import { round2 } from "@/lib/money";
import { resolveShopBusinessCardLine } from "@/lib/shop/businessCardShop";
import { shopPrintPrice, type ShopPrintQuote } from "@/lib/storefront/printPrices";
import { prisma } from "@/lib/prisma";
import { ROLL_MEDIA_CATEGORY_CODE, SHEET_PAPER_CATEGORY_CODE } from "@/lib/stock/unified/materials";
import { PRINTER_CONSUMABLE_CATEGORY_CODES } from "@/lib/stock/unified/printers";
import { buildUvLineData } from "@/lib/uv/buildUvLineData";
import { loadUvInkCosts, loadUvSettings, loadUvStockItem, resolveUvLine } from "@/lib/uv/resolveUvLine";
import { UvLineError, UvLineErrorCode } from "@/lib/uv/uvLineCalc";
import { uvLineInputSchema } from "@/lib/uv/uvLineInput";
import type { UvLineData } from "@/lib/uv/types";
import {
  parsePublicQuoteLine,
  type PublicBusinessCardLineInput,
  type PublicDtfLineInput,
  type PublicQuoteKind,
  type PublicQuoteLineInput,
  type PublicQuoteLocale,
  type PublicUvLineInput,
} from "./publicQuoteSchema";

/**
 * Public (storefront) price quote: the retail price of each configured line,
 * computed by the same engines and the same rules as order creation, and
 * returned through a strict allowlist — never a cost, margin or consumption
 * figure. The customer tier is always retail; dealers price in the cabinet.
 *
 * A line that cannot be priced from the catalog (no retail price set, empty
 * price list) answers `price_unavailable` instead of 0.
 */

export type PublicQuoteFailureReason = "price_unavailable" | "invalid";

export type PublicQuoteBreakdownKey = "item" | "print" | "press" | "transfer" | "setup" | "runCap" | "minimum";

export interface PublicQuoteBreakdownRow {
  key: PublicQuoteBreakdownKey;
  label: string;
  amount: number;
}

export type PublicQuoteLineResult =
  | {
      ok: true;
      kind: PublicQuoteKind;
      /** Pieces priced (business cards: the run raised to whole sheets). */
      quantity: number;
      unitPrice: number;
      total: number;
      currency: "MDL";
      breakdown?: PublicQuoteBreakdownRow[];
    }
  | {
      ok: false;
      kind: PublicQuoteKind | null;
      reason: PublicQuoteFailureReason;
      /** Stable machine code («dtf_size_unknown», «bc_paper_not_found», …). */
      code: string;
    };

export interface PublicQuoteResult {
  currency: "MDL";
  lines: PublicQuoteLineResult[];
  /** Sum of the line totals; null when any line has no price. */
  subtotal: number | null;
}

const RETAIL = "retail" as const;

const LABELS: Record<PublicQuoteLocale, Record<PublicQuoteBreakdownKey, string>> = {
  ro: {
    item: "Produs",
    print: "Imprimare",
    press: "Presare",
    transfer: "Transfer UV-DTF",
    setup: "Pregătire",
    runCap: "Nu mai scump decât un tiraj mai mare",
    minimum: "Supliment până la comanda minimă",
  },
  ru: {
    item: "Изделие",
    print: "Печать",
    press: "Термопресс",
    transfer: "Перенос UV-DTF",
    setup: "Подготовка",
    runCap: "Не дороже большего тиража",
    minimum: "Доплата до минимального заказа",
  },
  en: {
    item: "Item",
    print: "Print",
    press: "Heat press",
    transfer: "UV-DTF transfer",
    setup: "Setup",
    runCap: "No more than a larger run",
    minimum: "Minimum order surcharge",
  },
};

type LineOk = Extract<PublicQuoteLineResult, { ok: true }>;
type LineFail = Extract<PublicQuoteLineResult, { ok: false }>;

function fail(kind: PublicQuoteKind | null, reason: PublicQuoteFailureReason, code: string): LineFail {
  return { ok: false, kind, reason, code };
}

/**
 * A priced line. A total of 0 or less is never a real retail price (a catalog
 * gap): it answers `price_unavailable`.
 */
function priced(
  kind: PublicQuoteKind,
  quantity: number,
  total: number,
  locale: PublicQuoteLocale,
  parts?: [PublicQuoteBreakdownKey, number][],
): LineOk | LineFail {
  if (!Number.isFinite(total) || total <= 0 || quantity < 1) return fail(kind, "price_unavailable", "price_not_set");
  const out: LineOk = {
    ok: true,
    kind,
    quantity,
    unitPrice: round2(total / quantity),
    total: round2(total),
    currency: "MDL",
  };
  const rows = (parts ?? []).filter(([, amount]) => amount !== 0).map(([key, amount]) => ({
    key,
    label: LABELS[locale][key],
    amount: round2(amount),
  }));
  // Only a breakdown that adds up exactly (a print smaller than the included one can clamp the subtotal).
  const sum: number = round2(rows.reduce((s, r) => s + r.amount, 0));
  if (rows.length > 1 && Math.abs(sum - out.total) < 0.005) out.breakdown = rows;
  return out;
}

function decimalToNumber(v: { toString(): string } | number | null | undefined): number | null {
  if (v == null) return null;
  const n: number = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

// ─── Per-kind pricing ────────────────────────────────────────────────────────

/** Mug: the variant's retail `sellPrice` × pieces (as the order wizard prices a catalog mug). */
async function quoteMug(line: Extract<PublicQuoteLineInput, { kind: "mug" }>, locale: PublicQuoteLocale) {
  const v = await loadMugVariant(prisma, line.productId, { activeOnly: true });
  if (!v) return fail("mug", "invalid", "mug_not_found");
  const unit: number | null = decimalToNumber(v.sellPrice);
  if (unit == null) return fail("mug", "price_unavailable", "price_not_set");
  return priced("mug", line.quantity, round2(round2(unit) * line.quantity), locale);
}

/**
 * Retail price per piece of a notebook / pen as a UV stock line with its main
 * print (the run-size tier at the quantity); null when the variant is not a UV
 * stock item or the UV engine cannot price it. Mirrors the order wizard's
 * `designerUvLine` / `catalogUnitMdl` and `dealerLinePrices.designerUvUnit`.
 */
export async function designerUvRetailUnit(variantId: string, quantity: number): Promise<number | null> {
  return (await designerUvRetailItem(variantId, quantity))?.unit ?? null;
}

/**
 * Retail item price of a notebook / pen as a UV stock line: the unit and the
 * item total (pens: already capped by every higher tier, exact to the cent).
 */
async function designerUvRetailItem(
  variantId: string,
  quantity: number,
): Promise<{ unit: number; total: number } | null> {
  const item = await loadUvStockItem(variantId);
  if (!item) return null;
  const [settings, inkCosts] = await Promise.all([loadUvSettings(), loadUvInkCosts()]);
  try {
    const data = buildUvLineData(
      {
        source: "stock",
        variantId: item.id,
        quantity,
        zones: [
          {
            id: "main",
            placement: "front",
            whiteLayers: item.printNorms.whiteLayers,
            varnish: item.printNorms.varnish,
            primer: item.printNorms.primer,
          },
        ],
      },
      RETAIL,
      { item, settings, inkCosts },
    );
    return { unit: round2(data.pricing.unitItemPriceMdl), total: round2(data.pricing.itemSellTotalMdl) };
  } catch {
    return null;
  }
}

/**
 * Notebook / pen: the UV run-size price (print included), else the variant's
 * retail `sellPrice`. Pens: a bigger package is never cheaper than a smaller
 * one (the total is capped by every higher tier at its minimum quantity).
 */
async function quoteNotebookOrPen(
  line: Extract<PublicQuoteLineInput, { kind: "notebook" | "pen" }>,
  locale: PublicQuoteLocale,
) {
  const v =
    line.kind === "notebook"
      ? await loadNotebookVariant(prisma, line.productId, { activeOnly: true })
      : await loadPenVariant(prisma, line.productId, { activeOnly: true });
  if (!v) return fail(line.kind, "invalid", `${line.kind}_not_found`);
  const uv = await designerUvRetailItem(v.id, line.quantity);
  // The UV engine already caps pens (as the studio wizard); `sellPrice` fallback caps here.
  if (uv) return priced(line.kind, line.quantity, line.kind === "pen" ? uv.total : round2(uv.unit * line.quantity), locale);
  const unit: number | null = decimalToNumber(v.sellPrice);
  if (unit == null) return fail(line.kind, "price_unavailable", "price_not_set");
  const total: number =
    line.kind === "pen"
      ? cappedTierTotal(dtfVariantPriceTiers(v.priceTiers, v.sellPrice), line.quantity, round2(unit))
      : round2(round2(unit) * line.quantity);
  return priced(line.kind, line.quantity, total, locale);
}

/** Printer consumables and print media are never sold as a plain item. */
const NOT_FOR_SALE_CATEGORY_CODES: string[] = [
  ...PRINTER_CONSUMABLE_CATEGORY_CODES,
  SHEET_PAPER_CATEGORY_CODE,
  ROLL_MEDIA_CATEGORY_CODE,
];

/** A stock variant sold as-is: run-size tiers (else `sellPrice` from one piece) at the quantity. */
async function quoteStockItem(
  line: Extract<PublicQuoteLineInput, { kind: "stockItem" }>,
  locale: PublicQuoteLocale,
) {
  const v = await prisma.stockVariant.findFirst({
    where: {
      id: line.variantId,
      isActive: true,
      item: {
        isActive: true,
        category: { isActive: true, code: { notIn: NOT_FOR_SALE_CATEGORY_CODES } },
      },
    },
    select: { id: true, sellPrice: true, priceTiers: true },
  });
  if (!v) return fail("stockItem", "invalid", "stock_item_not_found");
  const tier = tierPriceForQuantity(dtfVariantPriceTiers(v.priceTiers, v.sellPrice), line.quantity);
  if (!tier) return fail("stockItem", "price_unavailable", "price_not_set");
  return priced("stockItem", line.quantity, round2(tier.priceMdl * line.quantity), locale);
}

const DTF_PRICE_GAPS: ReadonlySet<string> = new Set([DtfLineErrorCode.GarmentNoPrice, DtfLineErrorCode.NoPriceList]);

/** Engine input of a public DTF line: always a stock garment, always pressed. */
export function publicDtfEngineInput(line: PublicDtfLineInput): DtfLineInput | { error: string } {
  const parsed = dtfLineInputSchema.safeParse({
    garmentSource: "stock",
    garmentProductId: line.garmentId,
    sizes: line.sizes,
    zones: line.zones,
    ...(line.layoutKey ? { layoutKey: line.layoutKey } : {}),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.code === "custom" ? issue.message : "invalid_input" };
  }
  return parsed.data;
}

async function quoteDtf(input: DtfLineInput, runQuantity: number | null, locale: PublicQuoteLocale) {
  let data: DtfLineData;
  try {
    data = await resolveDtfLine(input, RETAIL, runQuantity ?? undefined);
  } catch (e) {
    if (e instanceof DtfLineError) {
      return fail("dtf", DTF_PRICE_GAPS.has(e.code) ? "price_unavailable" : "invalid", e.code);
    }
    throw e;
  }
  const p = data.pricing;
  return priced("dtf", data.quantity, p.totalSellPriceMdl, locale, [
    ["item", p.garmentSellTotalMdl],
    ["print", p.printSellTotalMdl],
    ["press", p.pressSellTotalMdl],
    ["runCap", -(p.runCapDiscountMdl ?? 0)],
    ["minimum", p.minimumLineUpliftMdl],
  ]);
}

const UV_PRICE_GAPS: ReadonlySet<string> = new Set([UvLineErrorCode.ItemNoPrice, UvLineErrorCode.PriceNotSet]);

async function quoteUv(line: PublicUvLineInput, locale: PublicQuoteLocale) {
  const parsed = uvLineInputSchema.safeParse({
    source: line.source,
    ...(line.technique ? { technique: line.technique } : {}),
    ...(line.variantId ? { variantId: line.variantId } : {}),
    quantity: line.quantity,
    zones: line.zones,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail("uv", "invalid", issue?.code === "custom" ? issue.message : "invalid_input");
  }
  let data: UvLineData;
  try {
    data = await resolveUvLine(parsed.data, RETAIL);
  } catch (e) {
    if (e instanceof UvLineError) {
      return fail("uv", UV_PRICE_GAPS.has(e.code) ? "price_unavailable" : "invalid", e.code);
    }
    throw e;
  }
  const p = data.pricing;
  return priced("uv", data.quantity, p.totalSellPriceMdl, locale, [
    ["item", p.itemSellTotalMdl],
    [
      "print",
      p.printSellTotalMdl + p.whiteSurchargeTotalMdl + p.varnishSurchargeTotalMdl + (p.primerSurchargeTotalMdl ?? 0),
    ],
    ["transfer", p.transferSellTotalMdl ?? 0],
    ["setup", p.setupFeeMdl],
    ["minimum", p.minimumLineUpliftMdl],
  ]);
}

/** Business cards / flyers: the order resolver, with the run raised to whole sheets (as the cabinet quote). */
async function quoteBusinessCard(line: PublicBusinessCardLineInput, locale: PublicQuoteLocale) {
  if (line.pricing === "shopPack") return quoteShopBusinessCard(line, locale);
  try {
    const res = await resolveSheetProductLine({
      productType: line.productType,
      sheetPaperId: line.sheetPaperId!,
      quantity: line.quantity,
      sides: line.sides,
      cardPresetId: line.cardPresetId,
      cardTrimWidthCm: line.cardTrimWidthCm,
      cardTrimHeightCm: line.cardTrimHeightCm,
      customerType: RETAIL,
      snapQuantity: true,
    });
    const data = res.businessCardLineData;
    if (!(data.pricePerSheetMdl > 0)) return fail("businessCard", "price_unavailable", "price_not_set");
    return priced("businessCard", data.quantity, res.totalSellPriceMdl, locale);
  } catch (e) {
    if (e instanceof AdminOrderResolveError) return fail("businessCard", "invalid", e.message);
    throw e;
  }
}

/** Storefront business-card pack: per-card price on the default paper (`resolveShopBusinessCardLine`). */
async function quoteShopBusinessCard(line: PublicBusinessCardLineInput, locale: PublicQuoteLocale) {
  try {
    const res = await resolveShopBusinessCardLine(line);
    return priced("businessCard", res.businessCardLineData.quantity, res.totalSellPriceMdl, locale);
  } catch (e) {
    if (e instanceof AdminOrderResolveError) {
      return fail("businessCard", e.message === "bc_paper_not_found" ? "price_unavailable" : "invalid", e.message);
    }
    throw e;
  }
}

/** Storefront photo / document printing: the shop price list (`printPrices.ts`), whole lei. */
function quotePrint(line: Extract<PublicQuoteLineInput, { kind: "print" }>, locale: PublicQuoteLocale): LineOk | LineFail {
  const price = shopPrintPrice(line as ShopPrintQuote);
  if (!price) return fail("print", "invalid", "print_invalid");
  return priced("print", price.quantity, price.total, locale);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Price raw cart lines (each validated on its own). DTF lines sharing a
 * `layoutKey` pool their pieces for run-size prices, like an order's lines.
 */
export async function quotePublicLines(
  rawLines: readonly unknown[],
  locale: PublicQuoteLocale = "ro",
): Promise<PublicQuoteResult> {
  const parsed = rawLines.map(parsePublicQuoteLine);
  const dtfInputs: (DtfLineInput | { error: string } | null)[] = parsed.map((p) =>
    p.ok && p.line.kind === "dtf" ? publicDtfEngineInput(p.line) : null,
  );
  const dtfRuns = dtfLayoutRunQuantities(dtfInputs.map((d) => (d && !("error" in d) ? d : null)));

  const lines: PublicQuoteLineResult[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i]!;
    if (!p.ok) {
      lines.push(fail(kindOf(rawLines[i]), "invalid", p.code));
      continue;
    }
    const line = p.line;
    switch (line.kind) {
      case "mug":
        lines.push(await quoteMug(line, locale));
        break;
      case "notebook":
      case "pen":
        lines.push(await quoteNotebookOrPen(line, locale));
        break;
      case "stockItem":
        lines.push(await quoteStockItem(line, locale));
        break;
      case "dtf": {
        const input = dtfInputs[i]!;
        lines.push("error" in input ? fail("dtf", "invalid", input.error) : await quoteDtf(input, dtfRuns[i] ?? null, locale));
        break;
      }
      case "uv":
        lines.push(await quoteUv(line, locale));
        break;
      case "businessCard":
        lines.push(await quoteBusinessCard(line, locale));
        break;
      case "print":
        lines.push(quotePrint(line, locale));
        break;
    }
  }

  const subtotal: number | null = lines.every((l) => l.ok)
    ? round2(lines.reduce((s, l) => s + (l.ok ? l.total : 0), 0))
    : null;
  return { currency: "MDL", lines, subtotal };
}

const KINDS: ReadonlySet<string> = new Set<PublicQuoteKind>([
  "mug",
  "notebook",
  "pen",
  "stockItem",
  "dtf",
  "uv",
  "businessCard",
  "print",
]);

function kindOf(raw: unknown): PublicQuoteKind | null {
  if (raw == null || typeof raw !== "object") return null;
  const kind: unknown = (raw as { kind?: unknown }).kind;
  return typeof kind === "string" && KINDS.has(kind) ? (kind as PublicQuoteKind) : null;
}
