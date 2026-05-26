import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { coerceNotebookPaperKind } from "@/lib/notebook/notebookPaperKind";
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

    const rows = await prisma.notebookProduct.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { sku: "asc" }],
    });

    const items = rows.map((r) => {
      const sellPriceNum =
        r.sellPrice == null ? null : Number(r.sellPrice.toString());
      const dealerPriceNum =
        r.dealerPrice == null ? null : Number(r.dealerPrice.toString());
      const { displayPrice, priceTier } = pickProductPrice(
        { sellPrice: sellPriceNum, dealerPrice: dealerPriceNum },
        isDealer,
      );
      return {
        id: r.id,
        sku: r.sku,
        nameRo: r.nameRo,
        nameRu: r.nameRu,
        nameEn: r.nameEn,
        imagePublicUrl: publicAssetUrlFromStorageKey(r.imageUrl),
        coverColorHex: r.coverColorHex,
        strapColorHex: r.strapColorHex,
        bookmarkColorHex: r.bookmarkColorHex,
        paperKind: coerceNotebookPaperKind(r.paperKind),
        printWidthCm: Number(r.printWidthCm.toString()),
        printHeightCm: Number(r.printHeightCm.toString()),
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
