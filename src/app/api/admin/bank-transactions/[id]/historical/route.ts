import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { historicalTransactionSchema } from "@/lib/validations";
import { suggestHistoricalDocument } from "@/lib/reconciliation/match";
import {
  BANK_TRANSACTION_INCLUDE,
  toSerializableBankTransaction,
} from "@/lib/reconciliation/serialize";

export const runtime = "nodejs";

/**
 * Settles a CREDIT against a pre-e-Factura / paper invoice that is not in
 * fiscal_invoices. Leaves the queue and creates a synthetic Act debit.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const validated = historicalTransactionSchema.parse(body ?? {});

    const existing = await prisma.bankTransaction.findUnique({
      where: { id },
      select: {
        id: true,
        direction: true,
        counterpartyIdno: true,
        purpose: true,
        matchStatus: true,
        _count: { select: { allocations: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.direction !== "CREDIT") {
      return NextResponse.json(
        { error: "historical_credit_only" },
        { status: 400 },
      );
    }
    if (!existing.counterpartyIdno?.trim()) {
      return NextResponse.json(
        { error: "historical_idno_required" },
        { status: 400 },
      );
    }
    if (existing._count.allocations > 0 || existing.matchStatus === "MATCHED") {
      return NextResponse.json(
        { error: "historical_unmatch_first" },
        { status: 400 },
      );
    }

    const baseDoc =
      validated.document?.trim() ||
      suggestHistoricalDocument(existing.purpose);
    const note = validated.note?.trim();
    const document = note ? `${baseDoc} (${note})` : baseDoc;

    await prisma.bankTransaction.update({
      where: { id },
      data: {
        matchStatus: "HISTORICAL",
        historicalDocument: document,
      },
    });

    const updated = await prisma.bankTransaction.findUniqueOrThrow({
      where: { id },
      include: BANK_TRANSACTION_INCLUDE,
    });
    return NextResponse.json({
      transaction: toSerializableBankTransaction(updated),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/bank-transactions/[id]/historical:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/** Clears HISTORICAL settlement and returns the tx to the reconciliation queue. */
export async function DELETE(
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
      select: { id: true, matchStatus: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.matchStatus !== "HISTORICAL") {
      return NextResponse.json(
        { error: "not_historical" },
        { status: 400 },
      );
    }

    await prisma.bankTransaction.update({
      where: { id },
      data: {
        matchStatus: "UNMATCHED",
        historicalDocument: null,
      },
    });

    const updated = await prisma.bankTransaction.findUniqueOrThrow({
      where: { id },
      include: BANK_TRANSACTION_INCLUDE,
    });
    return NextResponse.json({
      transaction: toSerializableBankTransaction(updated),
    });
  } catch (error) {
    console.error(
      "DELETE /api/admin/bank-transactions/[id]/historical:",
      error,
    );
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
