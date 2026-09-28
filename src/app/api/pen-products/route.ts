import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { getMaybeCustomerUser } from "@/lib/auth";
import { pickProductPrice } from "@/lib/pricing";

/**
 * Active pen SKUs for public pen flow + studio order creation.
 *
 * Session-aware: similar to mug/notebook products. Returns dealer pricing when
 * authenticated customer has isDealer=true.
 */
export async function GET() {
  try {
    const customer = await getMaybeCustomerUser();
    const isDealer = customer?.studioCustomer?.isDealer === true;

    const rows = await prisma.penProduct.findMany({
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
        bodyColorHex: r.bodyColorHex,
        clipColorHex: r.clipColorHex,
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
    console.error("GET /api/pen-products:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
