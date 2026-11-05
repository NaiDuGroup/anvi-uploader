import { AdminOrderResolveError, resolveSheetProductLine } from "@/lib/adminOrderCreateHelpers";
import { prisma } from "@/lib/prisma";
import type { PublicBusinessCardLineInput } from "@/lib/publicQuote/publicQuoteSchema";
import {
  SHOP_BC_PAPER_GSM,
  SHOP_BC_PRESET_ID,
  isShopBcSides,
  shopBcFitOf,
  shopBcPerCardMdl,
  shopBcTotalMdl,
} from "@/lib/storefront/businessCards";

/**
 * Storefront business-card pack → the studio's sheet-product line. Used by
 * the public quote and by the checkout, so the quoted price is exactly the
 * one stored on the order line.
 */

export interface ShopPaperRow {
  id: string;
  name: string;
  gsm: number | null;
}

/** Paper weight of a sheet paper: `gsm`, else the «350gr» in its name. */
function paperGsm(p: ShopPaperRow): number | null {
  if (p.gsm != null) return p.gsm;
  const m = /(\d{2,3})\s*g/i.exec(p.name);
  return m ? Number(m[1]) : null;
}

/** The default business-card paper among the active ones (first by sort order); null when none weighs 350 g. */
export function pickShopBusinessCardPaper(papers: readonly ShopPaperRow[]): ShopPaperRow | null {
  return papers.find((p) => paperGsm(p) === SHOP_BC_PAPER_GSM) ?? null;
}

async function findShopBusinessCardPaper(): Promise<ShopPaperRow | null> {
  const papers = await prisma.sheetPaper.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, gsm: true },
  });
  return pickShopBusinessCardPaper(papers);
}

/**
 * Resolve a `pricing: "shopPack"` line: the default paper, 90×50, the pack
 * as the run and the shop price. Throws {@link AdminOrderResolveError}.
 */
export async function resolveShopBusinessCardLine(line: PublicBusinessCardLineInput) {
  const opts = { lamination: line.lamination ?? null, corners: line.corners ?? null };
  const total = isShopBcSides(line.sides) ? shopBcTotalMdl(line.quantity, line.sides, opts) : null;
  if (total == null) throw new AdminOrderResolveError("bc_shop_pack");
  const paper = await findShopBusinessCardPaper();
  if (!paper) throw new AdminOrderResolveError("bc_paper_not_found");
  const resolved = await resolveSheetProductLine({
    productType: "business_card",
    sheetPaperId: paper.id,
    quantity: line.quantity,
    sides: line.sides,
    cardPresetId: SHOP_BC_PRESET_ID,
    customerType: "retail",
    shopPack: { totalSellPriceMdl: total, pricePerCardMdl: shopBcPerCardMdl(line.sides, opts) },
  });
  const finishing = {
    ...(line.lamination ? { lamination: line.lamination } : {}),
    ...(line.corners ? { roundedCorners: true } : {}),
  };
  // The imposition crops / fits each face as the customer chose (default: crop to fill).
  return {
    ...resolved,
    businessCardLineData: {
      ...resolved.businessCardLineData,
      artworkFit: shopBcFitOf(line),
      ...(Object.keys(finishing).length ? { shopFinishing: finishing } : {}),
    },
  };
}
