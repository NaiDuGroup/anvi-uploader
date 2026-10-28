import type { Prisma, PrismaClient } from "@prisma/client";
import { printableItemWhere } from "@/lib/stock/unified/printMethods";
import { prisma } from "@/lib/prisma";
import { PrintMethodCode } from "@/lib/printMethods/methods";
import { loadPrintMethodSettings } from "@/lib/printMethods/printMethodsDb";
import type { SublimationSettings } from "@/lib/printMethods/sublimationSettings";
import { PrinterCode, PrinterSlotRole } from "@/lib/stock/unified/printerMath";
import { loadPrinterSlots } from "@/lib/stock/unified/printers";
import { buildSublimationLineData } from "@/lib/sublimation/buildSublimationLineData";
import type { SublimationStockItemJson } from "@/lib/sublimation/dto";
import { sublimationStockItemsFromStockItem, sublimationStockItemsFromStockItems } from "@/lib/sublimation/stockItems";
import { SUBLIMATION_PRINT_METHOD } from "@/lib/sublimation/sublimationConstants";
import {
  sublimationConsumableCostsFromSlots,
  type SublimationConsumableCosts,
} from "@/lib/sublimation/sublimationLineCalc";
import type { SublimationLineInput } from "@/lib/sublimation/sublimationLineInput";
import type { SublimationCustomerType, SublimationLineData } from "@/lib/sublimation/types";

type Db = PrismaClient | Prisma.TransactionClient;

/** Norms per category and waste from `PrintMethod('sublimation').settings` (zeros when unset). */
export function loadSublimationSettings(db: Db = prisma): Promise<SublimationSettings> {
  return loadPrintMethodSettings(PrintMethodCode.Sublimation, db);
}

/**
 * Unit costs of the Epson L1800 consumables from the variants in its slots
 * (avg cost, else the purchase-cost hint): ink blended over the six inks by
 * share, paper per sheet, tape per metre. 0 while a slot has no cost yet.
 */
export async function loadSublimationConsumableCosts(db: Db = prisma): Promise<SublimationConsumableCosts> {
  const [ink, paper, tape] = await Promise.all([
    loadPrinterSlots(db, PrinterCode.Sublimation, PrinterSlotRole.Ink),
    loadPrinterSlots(db, PrinterCode.Sublimation, PrinterSlotRole.Paper),
    loadPrinterSlots(db, PrinterCode.Sublimation, PrinterSlotRole.Tape),
  ]);
  return sublimationConsumableCostsFromSlots({ ink, paper, tape });
}

const STOCK_ITEM_INCLUDE = {
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

/** Every active variant of the unified stock categories marked «sublimation» (mugs included). */
export async function loadSublimationStockItems(): Promise<SublimationStockItemJson[]> {
  const items = await prisma.stockItem.findMany({
    where: printableItemWhere(SUBLIMATION_PRINT_METHOD),
    include: STOCK_ITEM_INCLUDE,
  });
  return sublimationStockItemsFromStockItems(items);
}

/** One blank by variant id; null when gone, inactive or not marked for sublimation. */
export async function loadSublimationStockItem(variantId: string | undefined): Promise<SublimationStockItemJson | null> {
  if (!variantId) return null;
  const variant = await prisma.stockVariant.findUnique({ where: { id: variantId }, select: { itemId: true } });
  if (!variant) return null;
  const item = await prisma.stockItem.findUnique({ where: { id: variant.itemId }, include: STOCK_ITEM_INCLUDE });
  if (!item) return null;
  return sublimationStockItemsFromStockItem(item).find((v) => v.id === variantId) ?? null;
}

/**
 * Price one sublimation line from the live tiers, norms and consumable costs,
 * producing the persisted snapshot. Throws {@link SublimationLineError}.
 */
export async function resolveSublimationLine(
  input: SublimationLineInput,
  customerType: SublimationCustomerType,
): Promise<SublimationLineData> {
  const [settings, consumableCosts, item] = await Promise.all([
    loadSublimationSettings(),
    loadSublimationConsumableCosts(),
    loadSublimationStockItem(input.variantId),
  ]);
  return buildSublimationLineData(input, customerType, { item, settings, consumableCosts });
}
