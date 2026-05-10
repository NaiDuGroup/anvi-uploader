import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { getMaybeCustomerUser } from "@/lib/auth";
import { pickProductPrice } from "@/lib/pricing";

/**
 * Active mug SKUs for public mug flow + studio order creation.
 *
 * Session-aware: when the request carries a valid customer cookie and the
 * linked StudioCustomer has `isDealer = true`, each product carries the
 * dealer price as `displayPrice`. Anonymous + non-dealer customers always see
 * the retail price. We never expose `dealerPrice` to non-dealers, even as a
 * sibling field.
 */
export async function GET() {
  try {
    const customer = await getMaybeCustomerUser();
    const isDealer = customer?.studioCustomer?.isDealer === true;

    const rows = await prisma.mugProduct.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { sku: "asc" }],
    });

    const items = rows.map((r) => {
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
        handleColorHex: r.handleColorHex,
        innerColorHex: r.innerColorHex,
        rimColorHex: r.rimColorHex,
        printWidthCm: Number(r.printWidthCm.toString()),
        printHeightCm: Number(r.printHeightCm.toString()),
        printDpi: r.printDpi,
        has3dPreview: r.has3dPreview,
        /** Tier-correct price for the current viewer (retail or dealer). */
        displayPrice,
        priceTier,
        /**
         * Back-compat: existing public flows read `sellPrice`. We mirror
         * `displayPrice` here so they don't have to be migrated in the same
         * change. Dealer viewers therefore see dealer prices via `sellPrice`
         * too — that is intentional, since `sellPrice` was always the
         * "price shown to this user" semantically.
         */
        sellPrice: displayPrice,
      };
    });

    return NextResponse.json({ items, viewerTier: isDealer ? "dealer" : "retail" });
  } catch (e) {
    console.error("GET /api/mug-products:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
