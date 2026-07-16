import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { STATEMENT_EFACTURA_STATUSES } from "@/lib/reconciliation/autoMatch";
import { excludeNonDeliveryWhere } from "@/lib/reconciliation/fiscalFlags";

export const runtime = "nodejs";

/**
 * Open (unpaid, not receipt-settled) fiscal invoices for a buyer — used by the
 * debtors "Close cash/card" modal.
 */
export async function GET(
  _request: NextRequest,
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
    const rows = await prisma.fiscalInvoice.findMany({
      where: {
        buyerIdno: idno,
        paidAt: null,
        receiptSettledAt: null,
        eFacturaStatus: { in: STATEMENT_EFACTURA_STATUSES },
        AND: [excludeNonDeliveryWhere()],
      },
      orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        seria: true,
        number: true,
        totalAmount: true,
        issueDate: true,
        currency: true,
      },
    });

    return NextResponse.json({
      invoices: rows.map((r) => ({
        id: r.id,
        fullNumber: `${r.seria}${r.number}`,
        totalAmount: r.totalAmount?.toFixed(2) ?? null,
        issueDate: r.issueDate?.toISOString() ?? null,
        currency: r.currency,
      })),
    });
  } catch (error) {
    console.error(
      "GET /api/admin/reconciliation/debtors/[idno]/open-invoices:",
      error,
    );
    return NextResponse.json({ error: "Failed to list open invoices" }, { status: 500 });
  }
}
