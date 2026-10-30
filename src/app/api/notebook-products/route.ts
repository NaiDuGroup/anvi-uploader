import { NextResponse } from "next/server";
import { publicProductMedia } from "@/lib/stock/unified/publicMedia";
import { prisma } from "@/lib/prisma";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import {
  listActiveNotebookVariants,
  notebookVariantFields,
} from "@/lib/notebook/notebookVariant";
import { getMaybeCustomerUser } from "@/lib/auth";
import { pickProductPrice } from "@/lib/pricing";

/**
 * Active notebook SKUs for public notebook flow + studio order creation.
 *
 * Session-aware: see comment on the mug counterpart for the dealer pricing
 * contract. The `sellPrice` field is kept as a tier-correct alias for
 * back-compat with existing pickers/editors.
 */
export async function GET() {
  try {
    const customer = await getMaybeCustomerUser();
    const isDealer = customer?.studioCustomer?.isDealer === true;

    // Active notebooks of the unified «Блокноты» category; `id` = variant id.
    const rows = await listActiveNotebookVariants(prisma);

    const items = rows.map((v) => {
      const r = notebookVariantFields(v);
      const { displayPrice, priceTier } = pickProductPrice(
        { sellPrice: r.sellPrice, dealerPrice: r.dealerPrice },
        isDealer,
      );
      return {
        id: r.id,
        sku: r.sku,
        nameRo: r.nameRo,
        nameRu: r.nameRu,
        nameEn: r.nameEn,
        imagePublicUrl: publicAssetUrlFromStorageKey(r.imageUrl),
        ...publicProductMedia(v.item),
        coverColorHex: r.coverColorHex,
        strapColorHex: r.strapColorHex,
        bookmarkColorHex: r.bookmarkColorHex,
        paperKind: r.paperKind,
        printWidthCm: r.printWidthCm,
        printHeightCm: r.printHeightCm,
        printDpi: r.printDpi,
        has3dPreview: r.has3dPreview,
        displayPrice,
        priceTier,
        sellPrice: displayPrice,
      };
    });

    return NextResponse.json({ items, viewerTier: isDealer ? "dealer" : "retail" });
  } catch (e) {
    console.error("GET /api/notebook-products:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
