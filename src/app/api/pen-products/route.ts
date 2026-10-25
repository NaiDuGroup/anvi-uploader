import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { getMaybeCustomerUser } from "@/lib/auth";
import { pickProductPrice } from "@/lib/pricing";
import { listActivePenVariants, penVariantFields } from "@/lib/pen/penVariant";

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

    // Active pens of the unified «Ручки» category; `id` = variant id.
    const rows = await listActivePenVariants(prisma);

    const items = rows.map((v) => {
      const r = penVariantFields(v);
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
        bodyColorHex: r.bodyColorHex,
        clipColorHex: r.clipColorHex,
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
    console.error("GET /api/pen-products:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
