import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { ignoreTransactionSchema } from "@/lib/validations";
import {
  BANK_TRANSACTION_INCLUDE,
  toSerializableBankTransaction,
} from "@/lib/reconciliation/serialize";

export const runtime = "nodejs";

/** Marks a transaction as intentionally not reconciled (or clears that flag). */
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
    const body = await request.json();
    const validated = ignoreTransactionSchema.parse(body);

    const existing = await prisma.bankTransaction.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.bankTransaction.update({
      where: { id },
      data: validated.ignore
        ? { matchStatus: "IGNORED", historicalDocument: null }
        : { matchStatus: "UNMATCHED", historicalDocument: null },
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
    console.error("POST /api/admin/bank-transactions/[id]/ignore:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
