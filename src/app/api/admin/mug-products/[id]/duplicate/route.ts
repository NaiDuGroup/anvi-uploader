import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { toAdminMugProductJson } from "@/lib/mug/toAdminMugProductJson";
import {
  duplicateMugCatalogItem,
  loadMugVariantForAdmin,
} from "@/lib/mug/mugCatalogWrite";
import { resolveMugVariantId } from "@/lib/mug/mugVariant";

const MAX_SKU_ATTEMPTS = 10;

function generatedDuplicateSku(): string {
  return `COPY-${nanoid(10).toUpperCase()}`;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id: string | null = await resolveMugVariantId(prisma, rawId);
  const existing = id ? await loadMugVariantForAdmin(prisma, id) : null;
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  for (let attempt = 0; attempt < MAX_SKU_ATTEMPTS; attempt++) {
    const sku = generatedDuplicateSku();
    try {
      // The copy starts with zero stock (a new catalog row, not a second pile).
      const created = await prisma.$transaction((tx) =>
        duplicateMugCatalogItem(tx, existing, sku, user.id),
      );
      return NextResponse.json({ item: toAdminMugProductJson(created) });
    } catch (e) {
      const code =
        typeof e === "object" && e !== null && "code" in e
          ? (e as { code?: string }).code
          : undefined;
      if (code === "P2002") continue;
      console.error("POST /api/admin/mug-products/[id]/duplicate:", e);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "sku_generation_failed" }, { status: 500 });
}
