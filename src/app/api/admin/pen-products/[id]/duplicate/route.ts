import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManagePenCatalog } from "@/lib/roles";
import { toAdminPenProductJson } from "@/lib/pen/toAdminPenProductJson";
import { duplicatePenCatalogItem, loadPenVariantForAdmin } from "@/lib/pen/penCatalogWrite";
import { resolvePenVariantId } from "@/lib/pen/penVariant";

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

  const { id: rawId } = await params;
  const id: string | null = await resolvePenVariantId(prisma, rawId);
  const existing = id ? await loadPenVariantForAdmin(prisma, id) : null;
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  for (let attempt = 0; attempt < MAX_SKU_ATTEMPTS; attempt++) {
    const sku = generatedDuplicateSku();
    try {
      const created = await prisma.$transaction((tx) =>
        duplicatePenCatalogItem(tx, existing, sku, user.id),
      );
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
