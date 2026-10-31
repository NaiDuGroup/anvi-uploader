import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { autofillMug, type MugSupplierFacts } from "@/lib/mug/mugAutofill";
import { loadMugVariantForAdmin } from "@/lib/mug/mugCatalogWrite";
import { resolveMugVariantId } from "@/lib/mug/mugVariant";
import { gorFactoryModelCode, gorFactoryMugFacts, loadGorFactoryCatalog } from "@/lib/imports/gorFactoryMedia";
import { parseStockItemDescription } from "@/lib/stock/unified/itemDescription";

const body = z.object({
  /** Existing catalog row (variant id); absent while adding a new mug. */
  id: z.string().min(1).max(64).optional(),
  sku: z.string().max(64).default(""),
  nameRo: z.string().max(200).default(""),
  nameRu: z.string().max(200).default(""),
  nameEn: z.string().max(200).default(""),
});

/**
 * POST: suggested 3D look (colours, finish, gradient, shape) for a mug from the
 * supplier catalog and its names. Nothing is saved: the admin form fills its
 * fields, the admin checks the preview and saves.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const b = parsed.data;

  let supplierCode: string | null = b.sku.trim() || null;
  const descriptions: string[] = [];
  if (b.id) {
    const variantId = await resolveMugVariantId(prisma, b.id);
    const row = variantId ? await loadMugVariantForAdmin(prisma, variantId) : null;
    if (row) {
      supplierCode = row.supplierCode ?? supplierCode;
      const d = parseStockItemDescription(row.item.description);
      if (d) descriptions.push(d.ru, d.ro, d.en);
    }
  }

  let supplier: MugSupplierFacts | null = null;
  let supplierError = false;
  if (supplierCode && gorFactoryModelCode(supplierCode)) {
    try {
      supplier = gorFactoryMugFacts(await loadGorFactoryCatalog(), supplierCode);
    } catch {
      supplierError = true;
    }
  }

  const result = autofillMug({
    names: [b.nameRu, b.nameRo, b.nameEn].filter(Boolean),
    descriptions: descriptions.filter(Boolean),
    sku: b.sku,
    supplier,
  });
  return NextResponse.json({ ...result, supplierError });
}
