import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { parseInvoiceXml } from "@/lib/efactura/parseInvoiceXml";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Super admin: re-reads totals from the stored XML of supplier invoices whose
 * VAT is larger than the total (SFS header TotalTVA lost its decimal point;
 * the parser now takes the line VAT in that case). Idempotent.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM purchase_invoices
    WHERE vat_amount IS NOT NULL AND total_amount IS NOT NULL
      AND ABS(vat_amount) > ABS(total_amount) AND raw_xml IS NOT NULL`;

  const fixed: Array<{ document: string; vatBefore: string | null; vatAfter: string | null }> = [];
  let unchanged = 0;
  for (const { id } of rows) {
    const inv = await prisma.purchaseInvoice.findUnique({
      where: { id },
      select: { seria: true, number: true, rawXml: true, vatAmount: true },
    });
    if (!inv?.rawXml) continue;
    const parsed = parseInvoiceXml(inv.rawXml);
    const total = parsed.totalAmount != null ? Number(parsed.totalAmount) : NaN;
    const vat = parsed.vatAmount != null ? Number(parsed.vatAmount) : NaN;
    if (!Number.isFinite(total) || !Number.isFinite(vat) || Math.abs(vat) > Math.abs(total)) {
      unchanged++;
      continue;
    }
    await prisma.purchaseInvoice.update({
      where: { id },
      data: {
        totalAmount: new Prisma.Decimal(total.toFixed(2)),
        vatAmount: new Prisma.Decimal(vat.toFixed(2)),
        totalExVat: new Prisma.Decimal((total - vat).toFixed(2)),
      },
    });
    fixed.push({
      document: `${inv.seria}${inv.number}`,
      vatBefore: inv.vatAmount?.toString() ?? null,
      vatAfter: vat.toFixed(2),
    });
  }
  return NextResponse.json({ candidates: rows.length, fixed, unchanged });
}
