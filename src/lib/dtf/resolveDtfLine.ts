import type { Prisma } from "@prisma/client";
import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";
import { buildDtfLineData } from "@/lib/dtf/buildDtfLineData";
import type { DtfGarmentJson } from "@/lib/dtf/dtfDto";
import { toDtfPresetOption } from "@/lib/dtf/dtfJson";
import type { DtfPresetOption, DtfUnitCosts } from "@/lib/dtf/dtfLineCalc";
import type { DtfLineInput } from "@/lib/dtf/dtfLineInput";
import { parseDtfSettingsJson, type DtfSettings } from "@/lib/dtf/dtfSettings";
import {
  DTF_PRINT_METHOD,
  dtfGarmentsFromStockItem,
  dtfGarmentsFromStockItems,
  parseDtfGarmentId,
} from "@/lib/dtf/stockGarments";
import type { DtfCustomerType, DtfLineData } from "@/lib/dtf/types";
import { prisma } from "@/lib/prisma";
import { PrinterCode, PrinterSlotRole } from "@/lib/stock/unified/printerMath";
import { printerInkCostPerMl, printerSlotUnitCost } from "@/lib/stock/unified/printers";

export async function loadDtfSettings(): Promise<DtfSettings> {
  const acct = await getOrCreateAccountingSettings();
  return parseDtfSettingsJson(acct.dtfSettings);
}

export async function loadActiveDtfPresets(): Promise<DtfPresetOption[]> {
  const rows = await prisma.dtfPrintPreset.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return rows.map(toDtfPresetOption);
}

/**
 * Unit costs of the DTF printer's consumables: film (per m), powder (per g) and
 * blended ink (per ml), from the variants loaded in its slots (avg cost, else
 * the purchase-cost hint). 0 while a consumable has no cost yet.
 */
export async function loadDtfUnitCosts(): Promise<DtfUnitCosts> {
  const [film, powder, ink] = await Promise.all([
    printerSlotUnitCost(prisma, PrinterCode.Dtf, PrinterSlotRole.Film),
    printerSlotUnitCost(prisma, PrinterCode.Dtf, PrinterSlotRole.Powder),
    printerInkCostPerMl(prisma, PrinterCode.Dtf),
  ]);
  return {
    filmPerLinearMeterMdl: film ?? 0,
    powderPerGramMdl: powder ?? 0,
    inkPerMlMdl: ink ?? 0,
  };
}

const DTF_STOCK_ITEM_INCLUDE = {
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

/** Every active garment colour from unified stock categories printable with DTF. */
export async function loadDtfStockGarments(): Promise<DtfGarmentJson[]> {
  const items = await prisma.stockItem.findMany({
    where: { isActive: true, category: { isActive: true, printMethods: { has: DTF_PRINT_METHOD } } },
    include: DTF_STOCK_ITEM_INCLUDE,
  });
  return dtfGarmentsFromStockItems(items);
}

/** One garment colour by its picker id; null when gone, inactive or not printable. */
export async function loadDtfStockGarment(id: string | undefined): Promise<DtfGarmentJson | null> {
  const parsed = id ? parseDtfGarmentId(id) : null;
  if (!parsed) return null;
  const item = await prisma.stockItem.findUnique({
    where: { id: parsed.stockItemId },
    include: DTF_STOCK_ITEM_INCLUDE,
  });
  if (!item) return null;
  return dtfGarmentsFromStockItem(item).find((g) => g.id === id) ?? null;
}

/**
 * Price one DTF line from the live price list, garment tiers and consumable
 * costs, producing the persisted snapshot. Throws {@link DtfLineError}.
 */
export async function resolveDtfLine(
  input: DtfLineInput,
  customerType: DtfCustomerType,
): Promise<DtfLineData> {
  const [settings, presets, unitCosts, garment] = await Promise.all([
    loadDtfSettings(),
    loadActiveDtfPresets(),
    loadDtfUnitCosts(),
    input.garmentSource === "stock" ? loadDtfStockGarment(input.garmentProductId) : Promise.resolve(null),
  ]);
  return buildDtfLineData(input, customerType, { garment, presets, settings, unitCosts });
}
