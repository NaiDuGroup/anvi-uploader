import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";
import { buildDtfLineData } from "@/lib/dtf/buildDtfLineData";
import { DtfConsumable } from "@/lib/dtf/dtfConstants";
import type { GarmentProductJson } from "@/lib/dtf/dtfDto";
import { toDtfPresetOption, toGarmentProductJson } from "@/lib/dtf/dtfJson";
import type { DtfPresetOption, DtfUnitCosts } from "@/lib/dtf/dtfLineCalc";
import type { DtfLineInput } from "@/lib/dtf/dtfLineInput";
import { parseDtfSettingsJson, type DtfSettings } from "@/lib/dtf/dtfSettings";
import type { DtfCustomerType, DtfLineData } from "@/lib/dtf/types";
import { prisma } from "@/lib/prisma";

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

/** Weighted-average cost of film (per m), powder (per g) and DTF ink (per ml). */
export async function loadDtfUnitCosts(): Promise<DtfUnitCosts> {
  const [film, powder, ink] = await Promise.all([
    prisma.dtfConsumableStock.findUnique({ where: { id: DtfConsumable.Film } }),
    prisma.dtfConsumableStock.findUnique({ where: { id: DtfConsumable.Powder } }),
    prisma.inkInventory.findUnique({ where: { id: "dtf_textile" } }),
  ]);
  return {
    filmPerLinearMeterMdl: film ? Number(film.avgCostPerUnit) : 0,
    powderPerGramMdl: powder ? Number(powder.avgCostPerUnit) : 0,
    inkPerMlMdl: ink ? Number(ink.avgCostPerMl) : 0,
  };
}

async function loadGarment(id: string | undefined): Promise<GarmentProductJson | null> {
  if (!id) return null;
  const row = await prisma.garmentProduct.findUnique({ where: { id }, include: { variants: true } });
  return row ? toGarmentProductJson(row) : null;
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
    input.garmentSource === "stock" ? loadGarment(input.garmentProductId) : Promise.resolve(null),
  ]);
  return buildDtfLineData(input, customerType, { garment, presets, settings, unitCosts });
}
