import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { STATEMENT_EFACTURA_STATUSES } from "@/lib/reconciliation/autoMatch";

export const runtime = "nodejs";

/**
 * Distinct buyers (by fiscal code) for the reconciliation act selector.
 * Uses the same status set as the act itself (includes Archive), and also
 * includes counterparties who paid us even if they have no open invoices —
 * otherwise archived-only clients like ROTAN never appear in the dropdown.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [invoiceRows, paymentRows] = await Promise.all([
      prisma.fiscalInvoice.findMany({
        where: {
          eFacturaStatus: { in: STATEMENT_EFACTURA_STATUSES },
          buyerIdno: { not: null },
        },
        distinct: ["buyerIdno"],
        select: { buyerIdno: true, buyerName: true },
        orderBy: { buyerName: "asc" },
      }),
      prisma.bankTransaction.findMany({
        where: {
          direction: "CREDIT",
          counterpartyIdno: { not: null },
        },
        distinct: ["counterpartyIdno"],
        select: { counterpartyIdno: true, counterpartyName: true },
        orderBy: { bookingDate: "desc" },
      }),
    ]);

    const byIdno = new Map<string, string>();
    for (const r of invoiceRows) {
      if (!r.buyerIdno) continue;
      byIdno.set(r.buyerIdno, r.buyerName?.trim() || r.buyerIdno);
    }
    for (const r of paymentRows) {
      if (!r.counterpartyIdno || byIdno.has(r.counterpartyIdno)) continue;
      byIdno.set(
        r.counterpartyIdno,
        r.counterpartyName?.trim() || r.counterpartyIdno,
      );
    }

    const clients = [...byIdno.entries()]
      .map(([idno, name]) => ({ idno, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ clients });
  } catch (error) {
    console.error("GET /api/admin/reconciliation/clients:", error);
    return NextResponse.json(
      { error: "Failed to load clients" },
      { status: 500 },
    );
  }
}
