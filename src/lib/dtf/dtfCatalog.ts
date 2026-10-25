import type { DtfCatalogJson, DtfPresetJson } from "@/lib/dtf/dtfDto";
import { toDtfPresetJson } from "@/lib/dtf/dtfJson";
import { loadDtfSettings, loadDtfStockGarments, loadDtfUnitCosts } from "@/lib/dtf/resolveDtfLine";
import { prisma } from "@/lib/prisma";

export async function loadDtfPresets(activeOnly: boolean): Promise<DtfPresetJson[]> {
  const rows = await prisma.dtfPrintPreset.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return rows.map(toDtfPresetJson);
}

export async function loadDtfCatalog(): Promise<DtfCatalogJson> {
  const [garments, presets, settings, unitCosts] = await Promise.all([
    loadDtfStockGarments(),
    loadDtfPresets(true),
    loadDtfSettings(),
    loadDtfUnitCosts(),
  ]);
  return { garments, presets, settings, unitCosts };
}
