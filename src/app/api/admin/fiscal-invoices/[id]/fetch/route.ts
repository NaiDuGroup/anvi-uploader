import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { getEFacturaClient, isEFacturaLive } from "@/lib/efactura";
import { EFACTURA_STATUS, type EFacturaInvoice } from "@/lib/efactura/types";

export const runtime = "nodejs";

/**
 * On-demand enrichment: pulls the full signed XML for a single fiscal invoice
 * from e-Factura (`GetInvoicesBySeriaNumber`) and stores it in `rawPayload` so
 * the detail view can show goods/services lines. Enriches amounts/buyer and
 * persists InvoiceStatus (so rejected/cancelled drop out of acts).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isEFacturaLive()) {
    return NextResponse.json(
      { error: "e-Factura is not connected (mock mode)" },
      { status: 400 },
    );
  }

  const { id } = await params;
  const f = await prisma.fiscalInvoice.findUnique({ where: { id } });
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const client = getEFacturaClient();

  // SFS numbers are typically 9 digits; try as-is, then zero-padded.
  const candidates = [f.number];
  if (f.number.length < 9) candidates.push(f.number.padStart(9, "0"));

  let found: EFacturaInvoice | null = null;
  try {
    for (const num of candidates) {
      found = await client.getInvoiceBySeriaNumber(f.seria, num);
      if (found) break;
    }
  } catch (error) {
    console.error("POST /api/admin/fiscal-invoices/[id]/fetch:", error);
    return NextResponse.json(
      { error: "Failed to fetch from e-Factura" },
      { status: 502 },
    );
  }

  if (!found) {
    return NextResponse.json(
      { error: "Invoice not found in e-Factura" },
      { status: 404 },
    );
  }

  const receiptSettledAt = found.settledByReceipt
    ? found.receiptDate
      ? new Date(found.receiptDate)
      : found.issueDate
        ? new Date(found.issueDate)
        : f.issueDate ?? new Date()
    : null;

  await prisma.fiscalInvoice.update({
    where: { id },
    data: {
      rawPayload: (found.raw ?? undefined) as Prisma.InputJsonValue | undefined,
      ...(Number.isFinite(found.status) && found.status !== EFACTURA_STATUS.DRAFT
        ? { eFacturaStatus: found.status }
        : {}),
      ...(found.totalAmount ? { totalAmount: found.totalAmount } : {}),
      ...(found.vatAmount ? { vatAmount: found.vatAmount } : {}),
      ...(found.buyerName ? { buyerName: found.buyerName } : {}),
      ...(found.buyerIdno ? { buyerIdno: found.buyerIdno } : {}),
      ...(found.issueDate && !f.issueDate
        ? { issueDate: new Date(found.issueDate) }
        : {}),
      // Fiscal receipt (B/f): mark the invoice settled at the POS terminal.
      ...(found.settledByReceipt
        ? {
            receiptRef: found.receiptRef ?? null,
            receiptMethod: found.receiptMethod ?? null,
            receiptSettledAt,
            paidAt: receiptSettledAt,
          }
        : {}),
      detailsFetchedAt: new Date(),
      lastSyncedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, settledByReceipt: !!found.settledByReceipt });
}
