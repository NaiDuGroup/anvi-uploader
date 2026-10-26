import type { SublimationCatalogJson } from "@/lib/sublimation/dto";
import {
  loadSublimationConsumableCosts,
  loadSublimationSettings,
  loadSublimationStockItems,
} from "@/lib/sublimation/resolveSublimationLine";

export async function loadSublimationCatalog(): Promise<SublimationCatalogJson> {
  const [items, settings, consumableCosts] = await Promise.all([
    loadSublimationStockItems(),
    loadSublimationSettings(),
    loadSublimationConsumableCosts(),
  ]);
  return { items, settings, consumableCosts };
}
