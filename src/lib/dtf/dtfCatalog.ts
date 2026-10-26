import type { DtfCatalogJson, DtfPresetJson } from "@/lib/dtf/dtfDto";
import { loadDtfSettings, loadDtfStockGarments, loadDtfUnitCosts } from "@/lib/dtf/resolveDtfLine";
import { PrintMethodCode } from "@/lib/printMethods/methods";
import { loadPrintPresets } from "@/lib/printMethods/printMethodsDb";

export function loadDtfPresets(activeOnly: boolean): Promise<DtfPresetJson[]> {
  return loadPrintPresets(PrintMethodCode.Dtf, activeOnly);
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
