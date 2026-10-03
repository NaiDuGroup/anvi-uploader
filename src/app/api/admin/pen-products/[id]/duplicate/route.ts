import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManagePenCatalog } from "@/lib/roles";
import { toAdminPenProductJson } from "@/lib/pen/toAdminPenProductJson";

const MAX_SKU_ATTEMPTS = 10;

function generatedDuplicateSku(): string {
  return `COPY-${nanoid(10).toUpperCase()}`;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManagePenCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.penProduct.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  for (let attempt = 0; attempt < MAX_SKU_ATTEMPTS; attempt++) {
    const sku = generatedDuplicateSku();
    try {
      const created = await prisma.penProduct.create({
        data: {
          sku,
          nameRo: existing.nameRo,
          nameRu: existing.nameRu,
          nameEn: existing.nameEn,
          // A copy is a new catalog row, not a second pile of the same pens.
          stockQuantity: 0,
          sellPrice: existing.sellPrice,
          dealerPrice: existing.dealerPrice,
          purchaseCost: existing.purchaseCost,
          imageUrl: existing.imageUrl,
          bodyColorHex: existing.bodyColorHex,
          clipColorHex: existing.clipColorHex,
          printWidthCm: existing.printWidthCm,
          printHeightCm: existing.printHeightCm,
          printDpi: existing.printDpi,
          has3dPreview: existing.has3dPreview,
          isActive: existing.isActive,
          sortOrder: existing.sortOrder,
          internalNotes: existing.internalNotes,
          createdById: user.id,
        },
        include: { createdBy: { select: { name: true, displayName: true } } },
      });
      return NextResponse.json({ product: toAdminPenProductJson(created) });
    } catch (e) {
      const code =
        typeof e === "object" && e !== null && "code" in e
          ? (e as { code?: string }).code
          : undefined;
      if (code === "P2002") continue;
      console.error("POST /api/admin/pen-products/[id]/duplicate:", e);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "sku_generation_failed" }, { status: 500 });
}
