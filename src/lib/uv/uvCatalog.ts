import { PrintMethodCode } from "@/lib/printMethods/methods";
import { loadPrintPresets } from "@/lib/printMethods/printMethodsDb";
import type { UvCatalogJson } from "@/lib/uv/dto";
import { loadUvInkCosts, loadUvSettings, loadUvStockItems } from "@/lib/uv/resolveUvLine";

export async function loadUvCatalog(): Promise<UvCatalogJson> {
  const [items, presets, settings, inkCosts] = await Promise.all([
    loadUvStockItems(),
    loadPrintPresets(PrintMethodCode.Uv, true),
    loadUvSettings(),
    loadUvInkCosts(),
  ]);
  return { items, presets, settings, inkCosts };
}
