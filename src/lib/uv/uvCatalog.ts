import type { UvCatalogJson } from "@/lib/uv/dto";
import { loadUvInkCosts, loadUvSettings, loadUvStockItems } from "@/lib/uv/resolveUvLine";

export async function loadUvCatalog(): Promise<UvCatalogJson> {
  const [items, settings, inkCosts] = await Promise.all([loadUvStockItems(), loadUvSettings(), loadUvInkCosts()]);
  return { items, settings, inkCosts };
}
