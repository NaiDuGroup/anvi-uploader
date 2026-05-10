import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { toAdminMugProductJson } from "@/lib/mug/toAdminMugProductJson";

const MAX_SKU_ATTEMPTS = 10;

function generatedDuplicateSku(): string {
  return `COPY-${nanoid(10).toUpperCase()}`;
}

/** Clone a catalog row with a new unique SKU; all other fields copied from the source. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.mugProduct.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  for (let attempt = 0; attempt < MAX_SKU_ATTEMPTS; attempt++) {
    const sku = generatedDuplicateSku();
    try {
      const created = await prisma.mugProduct.create({
        data: {
          sku,
          nameRo: existing.nameRo,
          nameRu: existing.nameRu,
          nameEn: existing.nameEn,
          stockQuantity: existing.stockQuantity,
          sellPrice: existing.sellPrice,
          dealerPrice: existing.dealerPrice,
          imageUrl: existing.imageUrl,
          bodyColorHex: existing.bodyColorHex,
          handleColorHex: existing.handleColorHex,
          innerColorHex: existing.innerColorHex,
          rimColorHex: existing.rimColorHex,
          printWidthCm: existing.printWidthCm,
          printHeightCm: existing.printHeightCm,
          printDpi: existing.printDpi,
          has3dPreview: existing.has3dPreview,
          isActive: existing.isActive,
          sortOrder: existing.sortOrder,
          internalNotes: existing.internalNotes,
          createdById: user.id,
        },
      });
      return NextResponse.json({ item: toAdminMugProductJson(created) });
    } catch (e) {
      const code =
        typeof e === "object" && e !== null && "code" in e
          ? (e as { code?: string }).code
          : undefined;
      if (code === "P2002") {
        continue;
      }
      console.error("POST /api/admin/mug-products/[id]/duplicate:", e);
      if (code === "P2022" || code === "P2021") {
        return NextResponse.json(
          {
            error: "database_schema_outdated",
            hint:
              "Run `npm run db:prepare` (or `npx prisma migrate deploy`) so the database matches prisma/migrations, then restart the dev server.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "sku_generation_failed" }, { status: 500 });
}
