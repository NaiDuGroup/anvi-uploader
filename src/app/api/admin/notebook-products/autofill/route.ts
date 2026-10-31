import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageNotebookCatalog } from "@/lib/roles";
import { autofillNotebook, type NotebookSupplierFacts } from "@/lib/notebook/notebookAutofill";
import { loadNotebookVariantForAdmin } from "@/lib/notebook/notebookCatalogWrite";
import { resolveNotebookVariantId } from "@/lib/notebook/notebookVariant";
import { gorFactoryModelCode, gorFactoryProductFacts, loadGorFactoryCatalog } from "@/lib/imports/gorFactoryMedia";
import { photoShowsSpiralBinding, samplePhotoCenterColor } from "@/lib/imports/samplePhotoColor";
import { parseStockItemDescription } from "@/lib/stock/unified/itemDescription";

const body = z.object({
  /** Existing catalog row (variant id); absent while adding a new notebook. */
  id: z.string().min(1).max(64).optional(),
  sku: z.string().max(64).default(""),
  nameRo: z.string().max(200).default(""),
  nameRu: z.string().max(200).default(""),
  nameEn: z.string().max(200).default(""),
});

/**
 * POST: suggested 3D look (size, binding, strap, pen, colours) and print area
 * for a notebook, from the supplier catalog, its description and the names.
 * Nothing is saved: the admin form fills its fields, the admin saves.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canManageNotebookCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const b = parsed.data;

  let supplierCode: string | null = b.sku.trim() || null;
  const descriptions: string[] = [];
  if (b.id) {
    const variantId = await resolveNotebookVariantId(prisma, b.id);
    const row = variantId ? await loadNotebookVariantForAdmin(prisma, variantId) : null;
    if (row) {
      supplierCode = row.supplierCode ?? supplierCode;
      const d = parseStockItemDescription(row.item.description);
      if (d) descriptions.push(d.ru, d.ro, d.en);
    }
  }

  let supplier: NotebookSupplierFacts | null = null;
  let supplierError = false;
  if (supplierCode && gorFactoryModelCode(supplierCode)) {
    try {
      const facts = gorFactoryProductFacts(await loadGorFactoryCatalog(), supplierCode);
      if (facts) {
        let colorHex = facts.colorHex;
        let colorFromPhoto = false;
        if (!colorHex && facts.colourShotUrl) {
          colorHex = await samplePhotoCenterColor(facts.colourShotUrl);
          colorFromPhoto = colorHex != null;
        }
        const photoSpiral = facts.colourShotUrl ? await photoShowsSpiralBinding(facts.colourShotUrl) : null;
        supplier = { sizesCm: facts.sizesCm, colorHex, colorFromPhoto, photoSpiral };
      }
    } catch {
      supplierError = true;
    }
  }

  const result = autofillNotebook({
    names: [b.nameRu, b.nameRo, b.nameEn].filter(Boolean),
    descriptions: descriptions.filter(Boolean),
    supplier,
  });
  return NextResponse.json({ ...result, supplierError });
}
