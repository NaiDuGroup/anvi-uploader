import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { settlePosSchema } from "@/lib/validations";
import { STATEMENT_EFACTURA_STATUSES } from "@/lib/reconciliation/autoMatch";
import { excludeNonDeliveryWhere } from "@/lib/reconciliation/fiscalFlags";
import { buildManualReceiptRef } from "@/lib/reconciliation/posSettle";

export const runtime = "nodejs";

/**
 * Manually settle selected open fiscal invoices as cash/card (POS) with a
 * receipt photo. Sets receiptSettledAt / paidAt so the debtors balance drops.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ idno: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { idno: raw } = await params;
  const idno = decodeURIComponent(raw).trim();
  if (!idno) {
    return NextResponse.json({ error: "idno_required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validated = settlePosSchema.parse(body);
    const ids = [...new Set(validated.fiscalInvoiceIds)];

    const found = await prisma.fiscalInvoice.findMany({
      where: {
        id: { in: ids },
        buyerIdno: idno,
        paidAt: null,
        receiptSettledAt: null,
        eFacturaStatus: { in: STATEMENT_EFACTURA_STATUSES },
        AND: [excludeNonDeliveryWhere()],
      },
      select: { id: true, totalAmount: true },
    });

    if (found.length !== ids.length) {
      return NextResponse.json(
        { error: "invoices_not_open_or_wrong_buyer" },
        { status: 400 },
      );
    }

    const now = new Date();
    const receiptRef = buildManualReceiptRef(validated.method, now);
    const noteSuffix = validated.note?.trim()
      ? ` · ${validated.note.trim()}`
      : "";

    await prisma.fiscalInvoice.updateMany({
      where: { id: { in: ids } },
      data: {
        receiptMethod: validated.method,
        receiptSettledAt: now,
        paidAt: now,
        receiptRef: `${receiptRef}${noteSuffix}`.slice(0, 200),
        receiptPhotoKey: validated.photoKey,
      },
    });

    const settledAmount = found.reduce(
      (s, f) => s + Number(f.totalAmount?.toFixed(2) ?? 0),
      0,
    );

    return NextResponse.json({
      settled: ids.length,
      settledAmount: settledAmount.toFixed(2),
      method: validated.method,
      photoKey: validated.photoKey,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error(
      "POST /api/admin/reconciliation/debtors/[idno]/settle-pos:",
      error,
    );
    return NextResponse.json({ error: "Settle failed" }, { status: 500 });
  }
}
