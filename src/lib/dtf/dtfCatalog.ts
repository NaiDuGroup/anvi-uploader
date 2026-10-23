import type { DtfCatalogJson, DtfPresetJson, GarmentProductJson } from "@/lib/dtf/dtfDto";
import { toDtfPresetJson, toGarmentProductJson } from "@/lib/dtf/dtfJson";
import { loadDtfSettings, loadDtfUnitCosts } from "@/lib/dtf/resolveDtfLine";
import { prisma } from "@/lib/prisma";

export async function loadGarmentProducts(activeOnly: boolean): Promise<GarmentProductJson[]> {
  const rows = await prisma.garmentProduct.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    include: { variants: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { colorName: "asc" }],
  });
  return rows.map(toGarmentProductJson);
}

export async function loadDtfPresets(activeOnly: boolean): Promise<DtfPresetJson[]> {
  const rows = await prisma.dtfPrintPreset.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return rows.map(toDtfPresetJson);
}

export async function loadDtfCatalog(): Promise<DtfCatalogJson> {
  const [garments, presets, settings, unitCosts] = await Promise.all([
    loadGarmentProducts(true),
    loadDtfPresets(true),
    loadDtfSettings(),
    loadDtfUnitCosts(),
  ]);
  return { garments, presets, settings, unitCosts };
}
