import type { UvSettings } from "@/lib/printMethods/uvSettings";
import type { UvStockItemJson } from "@/lib/uv/dto";
import { computeUvConsumption, type UvInkCosts } from "@/lib/uv/uvLineCalc";

/**
 * Ink, varnish and primer cost of printing one stock item (pen, notebook) by
 * its «Параметры печати» (area) and «Нормы UV-печати» (underbase, varnish,
 * primer), at the current UV norms and ink prices. 0 when the item has no
 * print area. The profit report uses it for designer pen / notebook lines,
 * whose snapshot holds only the item purchase cost.
 */
export function uvItemPrintCostPerPieceMdl(
  item: Pick<UvStockItemJson, "printArea" | "printNorms">,
  settings: UvSettings,
  inkCosts: UvInkCosts,
): number {
  if (!item.printArea) return 0;
  const c = computeUvConsumption(
    [
      {
        widthCm: item.printArea.widthCm,
        heightCm: item.printArea.heightCm,
        whiteLayers: item.printNorms.whiteLayers,
        varnish: item.printNorms.varnish,
        primer: item.printNorms.primer,
      },
    ],
    1,
    settings,
  );
  const cost: number =
    c.cmykMl * inkCosts.cmykPerMlMdl +
    c.whiteMl * inkCosts.whitePerMlMdl +
    c.varnishMl * inkCosts.varnishPerMlMdl +
    (c.primerMl ?? 0) * (inkCosts.primerPerMlMdl ?? 0);
  return Math.round(cost * 10000) / 10000;
}

/** Print cost per piece keyed by stock variant id, for every UV stock item. */
export function uvPrintCostPerPieceByVariant(
  items: readonly Pick<UvStockItemJson, "id" | "printArea" | "printNorms">[],
  settings: UvSettings,
  inkCosts: UvInkCosts,
): Map<string, number> {
  return new Map(items.map((i) => [i.id, uvItemPrintCostPerPieceMdl(i, settings, inkCosts)]));
}
