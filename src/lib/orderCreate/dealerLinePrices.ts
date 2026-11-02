import "server-only";
import { prisma } from "@/lib/prisma";
import type { ResolvedAdminOrderLine } from "@/lib/adminOrderCreateHelpers";
import type { BusinessCardLineData } from "@/lib/businessCard/types";
import type { LargeFormatLineData } from "@/lib/largeFormat/types";
import type { DtfLineData } from "@/lib/dtf/types";
import type { UvLineData } from "@/lib/uv/types";
import type { SublimationLineData } from "@/lib/sublimation/types";
import type { UvCatalogJson } from "@/lib/uv/dto";
import { loadUvCatalog } from "@/lib/uv/uvCatalog";
import { buildUvLineData } from "@/lib/uv/buildUvLineData";
import { loadMugVariant } from "@/lib/mug/mugVariant";
import { loadNotebookVariant } from "@/lib/notebook/notebookVariant";
import { parsePenProductSnapshot } from "@/lib/pen/penProductSnapshot";
import { isSheetProductType } from "@/lib/sheetProduct/sheetProductConfig";
import { round2 } from "@/lib/money";

function lineCopies(r: ResolvedAdminOrderLine): number {
  return r.input.files.reduce((sum, f) => sum + (Number.isFinite(f.copies) ? f.copies : 0), 0);
}

/** Dealer price per piece: the dealer price when set, else the retail one (as the wizard shows). */
function dealerUnit(prices: { sellPrice: number | null; dealerPrice: number | null } | null): number | null {
  if (!prices) return null;
  const p = prices.dealerPrice ?? prices.sellPrice;
  return p != null && Number.isFinite(p) ? round2(p) : null;
}

/**
 * Notebook / pen line priced as a UV stock line with its main print: the
 * item's run-size / dealer price per piece. Null when the item is not in the
 * UV catalog (the caller falls back to the catalog price).
 */
function designerUvUnit(
  variantId: string,
  quantity: number,
  uv: UvCatalogJson,
): number | null {
  const item = uv.items.find((i) => i.id === variantId);
  if (!item) return null;
  try {
    const data = buildUvLineData(
      {
        source: "stock",
        variantId: item.id,
        quantity,
        zones: [
          {
            id: "main",
            placement: "front",
            whiteLayers: item.printNorms.whiteLayers,
            varnish: item.printNorms.varnish,
            primer: item.printNorms.primer,
          },
        ],
      },
      "dealer",
      { item, settings: uv.settings, inkCosts: uv.inkCosts },
    );
    return round2(data.pricing.unitItemPriceMdl);
  } catch {
    return null;
  }
}

/**
 * Dealer sell total of every resolved order line, computed on the server the
 * same way the order wizard quotes it. Null for a line without a price
 * (paper print, «other» item, item without a price) — the studio prices it.
 */
export async function dealerLineTotalsMdl(
  resolved: ResolvedAdminOrderLine[],
  lfLineTotalsMdl: Map<number, number>,
): Promise<(number | null)[]> {
  let uvCatalog: UvCatalogJson | null = null;
  const uv = async (): Promise<UvCatalogJson> => (uvCatalog ??= await loadUvCatalog());

  const out: (number | null)[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i]!;
    const pt = r.input.productType;
    const qty = lineCopies(r);

    if (pt === "large_format_print") {
      // Grouped lines carry the group share; a line resolved on its own (one
      // roll, size preset) has its total in the line snapshot.
      const own = (r.largeFormatExtras?.largeFormatLineData as unknown as LargeFormatLineData | undefined)
        ?.totalSellPrice;
      const total: number | undefined = lfLineTotalsMdl.get(i) ?? own;
      out.push(typeof total === "number" && Number.isFinite(total) ? total : null);
    } else if (isSheetProductType(pt) && r.businessCardExtras) {
      const data = r.businessCardExtras.businessCardLineData as unknown as BusinessCardLineData;
      out.push(data.totalSellPriceMdl);
    } else if (pt === "dtf_apparel" && r.dtfExtras) {
      out.push((r.dtfExtras.dtfLineData as unknown as DtfLineData).pricing.totalSellPriceMdl);
    } else if (pt === "uv_print" && r.uvExtras) {
      out.push((r.uvExtras.uvLineData as unknown as UvLineData).pricing.totalSellPriceMdl);
    } else if (pt === "sublimation_print" && r.sublimationExtras) {
      out.push(
        (r.sublimationExtras.sublimationLineData as unknown as SublimationLineData).pricing.totalSellPriceMdl,
      );
    } else if (pt === "mug" && r.mugExtras?.stockVariantId && qty > 0) {
      const v = await loadMugVariant(prisma, r.mugExtras.stockVariantId);
      const unit = dealerUnit(
        v
          ? {
              sellPrice: v.sellPrice == null ? null : Number(v.sellPrice.toString()),
              dealerPrice: v.dealerPrice == null ? null : Number(v.dealerPrice.toString()),
            }
          : null,
      );
      out.push(unit == null ? null : round2(unit * qty));
    } else if (pt === "notebook" && r.notebookExtras?.stockVariantId && qty > 0) {
      const variantId = r.notebookExtras.stockVariantId;
      let unit = designerUvUnit(variantId, qty, await uv());
      if (unit == null) {
        const v = await loadNotebookVariant(prisma, variantId);
        unit = dealerUnit(
          v
            ? {
                sellPrice: v.sellPrice == null ? null : Number(v.sellPrice.toString()),
                dealerPrice: v.dealerPrice == null ? null : Number(v.dealerPrice.toString()),
              }
            : null,
        );
      }
      out.push(unit == null ? null : round2(unit * qty));
    } else if (pt === "pen" && r.penExtras?.stockVariantId && qty > 0) {
      let unit = designerUvUnit(r.penExtras.stockVariantId, qty, await uv());
      if (unit == null) {
        const snap = parsePenProductSnapshot(r.penExtras.penProductSnapshot);
        unit = dealerUnit(snap ? { sellPrice: snap.sellPrice, dealerPrice: snap.dealerPrice } : null);
      }
      out.push(unit == null ? null : round2(unit * qty));
    } else {
      out.push(null);
    }
  }
  return out;
}

/** Order price: the sum of the line totals, or null when any line has no price. */
export function dealerOrderTotalMdl(lineTotals: readonly (number | null)[]): number | null {
  if (lineTotals.length === 0 || lineTotals.some((t) => t == null)) return null;
  const sum = lineTotals.reduce<number>((s, t) => s + (t ?? 0), 0);
  return sum > 0 ? round2(sum) : null;
}
