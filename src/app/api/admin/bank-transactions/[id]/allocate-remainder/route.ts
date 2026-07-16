import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { allocateRemainderFifo } from "@/lib/reconciliation/autoMatch";
import {
  BANK_TRANSACTION_INCLUDE,
  toSerializableBankTransaction,
} from "@/lib/reconciliation/serialize";

export const runtime = "nodejs";

/**
 * FIFO-applies the unallocated remainder of a CREDIT onto other open fiscal
 * invoices of the same buyer (does not change existing allocations).
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
  const { id } = await params;

  try {
    const existing = await prisma.bankTransaction.findUnique({
      where: { id },
      select: { id: true, direction: true, counterpartyIdno: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.direction !== "CREDIT") {
      return NextResponse.json(
        { error: "remainder_credit_only" },
        { status: 400 },
      );
    }
    if (!existing.counterpartyIdno?.trim()) {
      return NextResponse.json(
        { error: "remainder_idno_required" },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction((dbtx) =>
      allocateRemainderFifo(dbtx, id),
    );

    const updated = await prisma.bankTransaction.findUniqueOrThrow({
      where: { id },
      include: BANK_TRANSACTION_INCLUDE,
    });
    return NextResponse.json({
      transaction: toSerializableBankTransaction(updated),
      remainder: result,
    });
  } catch (error) {
    console.error(
      "POST /api/admin/bank-transactions/[id]/allocate-remainder:",
      error,
    );
    return NextResponse.json({ error: "Allocate remainder failed" }, { status: 500 });
  }
}
