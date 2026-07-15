import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { parseInvoiceXml, type ParsedInvoiceLine } from "@/lib/efactura/parseInvoiceXml";

export const runtime = "nodejs";

/**
 * Extracts goods/services lines and the portal object id from the stored
 * `rawPayload`, which is either the full signed XML string (pulled on-demand)
 * or a `{ source, oid }` object (bulk portal import — no line detail).
 */
function readRawPayload(raw: Prisma.JsonValue | null): {
  lines: ParsedInvoiceLine[];
  hasXml: boolean;
  oid: string | null;
} {
  if (typeof raw === "string" && raw.includes("<")) {
    return { lines: parseInvoiceXml(raw).lines, hasXml: true, oid: null };
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const oid = (raw as Record<string, unknown>).oid;
    return { lines: [], hasXml: false, oid: typeof oid === "string" ? oid : null };
  }
  return { lines: [], hasXml: false, oid: null };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const f = await prisma.fiscalInvoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, companyName: true, personName: true } },
      allocations: {
        orderBy: { createdAt: "desc" },
        include: {
          bankTransaction: {
            select: {
              id: true,
              bookingDate: true,
              amount: true,
              currency: true,
              counterpartyName: true,
              purpose: true,
              documentNumber: true,
            },
          },
        },
      },
    },
  });

  if (!f) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { lines, hasXml, oid } = readRawPayload(f.rawPayload);
  const allocatedTotal = f.allocations.reduce(
    (sum, a) => sum.add(a.amount),
    new Prisma.Decimal(0),
  );

  return NextResponse.json({
    invoice: {
      id: f.id,
      seria: f.seria,
      number: f.number,
      fullNumber: `${f.seria}${f.number}`,
      status: f.eFacturaStatus,
      issueDate: f.issueDate ? f.issueDate.toISOString() : null,
      totalAmount: f.totalAmount ? f.totalAmount.toString() : null,
      vatAmount: f.vatAmount ? f.vatAmount.toString() : null,
      currency: f.currency,
      buyerName: f.buyerName,
      buyerIdno: f.buyerIdno,
      paidAt: f.paidAt ? f.paidAt.toISOString() : null,
      redirections: f.redirections,
      lastSyncedAt: f.lastSyncedAt.toISOString(),
      clientName:
        f.client?.companyName?.trim() || f.client?.personName?.trim() || null,
    },
    lines,
    hasXml,
    oid,
    allocatedTotal: allocatedTotal.toString(),
    allocations: f.allocations.map((a) => ({
      id: a.id,
      amount: a.amount.toString(),
      matchedBy: a.matchedBy,
      confidence: a.confidence,
      note: a.note,
      createdAt: a.createdAt.toISOString(),
      transaction: a.bankTransaction
        ? {
            id: a.bankTransaction.id,
            bookingDate: a.bankTransaction.bookingDate.toISOString(),
            amount: a.bankTransaction.amount.toString(),
            currency: a.bankTransaction.currency,
            counterpartyName: a.bankTransaction.counterpartyName,
            purpose: a.bankTransaction.purpose,
            documentNumber: a.bankTransaction.documentNumber,
          }
        : null,
    })),
  });
}
