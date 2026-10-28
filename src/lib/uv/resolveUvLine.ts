import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PrintMethodCode } from "@/lib/printMethods/methods";
import { loadPrintMethodSettings } from "@/lib/printMethods/printMethodsDb";
import type { UvSettings } from "@/lib/printMethods/uvSettings";
import { PrinterCode, PrinterSlotRole } from "@/lib/stock/unified/printerMath";
import { loadPrinterSlots } from "@/lib/stock/unified/printers";
import { buildUvLineData } from "@/lib/uv/buildUvLineData";
import type { UvStockItemJson } from "@/lib/uv/dto";
import { toNumber, uvStockItemsFromStockItem, uvStockItemsFromStockItems } from "@/lib/uv/stockItems";
import { UV_PRIMER_SKU, UV_PRINT_METHOD } from "@/lib/uv/uvConstants";
import { uvInkCostsFromSlots, type UvInkCosts } from "@/lib/uv/uvLineCalc";
import type { UvLineInput } from "@/lib/uv/uvLineInput";
import type { UvCustomerType, UvLineData } from "@/lib/uv/types";

/** UV norms and fees from `PrintMethod('uv').settings` (defaults for missing keys). */
export function loadUvSettings(): Promise<UvSettings> {
  return loadPrintMethodSettings(PrintMethodCode.Uv);
}

/**
 * Per-ml costs of the UV printer's inks from the variants in its ink slots
 * (avg cost, else the purchase-cost hint): CMYK blended over C/M/Y/K by share,
 * white and varnish from their slots. Primer is not in a slot (wiped on by
 * hand): its cost comes from the `UV_PRIMER_SKU` variant. 0 while unknown.
 */
export async function loadUvInkCosts(): Promise<UvInkCosts> {
  const [slots, primer] = await Promise.all([
    loadPrinterSlots(prisma, PrinterCode.Uv, PrinterSlotRole.Ink),
    prisma.stockVariant.findUnique({ where: { sku: UV_PRIMER_SKU }, select: { avgCost: true, purchaseCost: true } }),
  ]);
  const primerCost: number | null = primer ? (toNumber(primer.avgCost) ?? toNumber(primer.purchaseCost)) : null;
  return { ...uvInkCostsFromSlots(slots), primerPerMlMdl: primerCost ?? 0 };
}

const UV_STOCK_ITEM_INCLUDE = {
  category: {
    select: {
      code: true,
      nameRo: true,
      nameRu: true,
      nameEn: true,
      sortOrder: true,
      isActive: true,
      printMethods: true,
    },
  },
  variants: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.StockItemInclude;

/** Every active variant from unified stock categories printable with UV. */
export async function loadUvStockItems(): Promise<UvStockItemJson[]> {
  const items = await prisma.stockItem.findMany({
    where: { isActive: true, category: { isActive: true, printMethods: { has: UV_PRINT_METHOD } } },
    include: UV_STOCK_ITEM_INCLUDE,
  });
  return uvStockItemsFromStockItems(items);
}

/** One UV stock item by variant id; null when gone, inactive or not printable. */
export async function loadUvStockItem(variantId: string | undefined): Promise<UvStockItemJson | null> {
  if (!variantId) return null;
  const variant = await prisma.stockVariant.findUnique({ where: { id: variantId }, select: { itemId: true } });
  if (!variant) return null;
  const item = await prisma.stockItem.findUnique({ where: { id: variant.itemId }, include: UV_STOCK_ITEM_INCLUDE });
  if (!item) return null;
  return uvStockItemsFromStockItem(item).find((v) => v.id === variantId) ?? null;
}

/**
 * Price one UV line from the UV settings (rates per m²), item prices and ink
 * costs, producing the persisted snapshot. Throws {@link UvLineError}.
 */
export async function resolveUvLine(input: UvLineInput, customerType: UvCustomerType): Promise<UvLineData> {
  const [settings, inkCosts, item] = await Promise.all([
    loadUvSettings(),
    loadUvInkCosts(),
    input.source === "stock" ? loadUvStockItem(input.variantId) : Promise.resolve(null),
  ]);
  return buildUvLineData(input, customerType, { item, settings, inkCosts });
}
