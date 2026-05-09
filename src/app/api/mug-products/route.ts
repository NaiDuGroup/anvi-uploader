import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";

/**
 * Active mug SKUs for public mug flow + studio order creation (no auth).
 */
export async function GET() {
  try {
    const rows = await prisma.mugProduct.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { sku: "asc" }],
    });

    const items = rows.map((r) => ({
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
      /** Retail price for public mug flow (MDL); null if not set in catalog */
      sellPrice: r.sellPrice,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    console.error("GET /api/mug-products:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
