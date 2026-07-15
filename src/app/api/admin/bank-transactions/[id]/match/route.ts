import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { matchTransactionSchema } from "@/lib/validations";
import { applyAllocation } from "@/lib/reconciliation/autoMatch";
import {
  BANK_TRANSACTION_INCLUDE,
  toSerializableBankTransaction,
} from "@/lib/reconciliation/serialize";

export const runtime = "nodejs";

const ZERO = new Prisma.Decimal(0);

function unauthorized(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  const denied = unauthorized(user);
  if (denied) return denied;
  const { id } = await params;

  try {
    const body = await request.json();
    const validated = matchTransactionSchema.parse(body);

    const tx = await prisma.bankTransaction.findUnique({
      where: { id },
      include: { allocations: true },
    });
    if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const alreadyAllocated = tx.allocations.reduce(
      (s, a) => s.plus(a.amount),
      ZERO,
    );
    let remainingOnTx = tx.amount.minus(alreadyAllocated);

    const fiscalIds = validated.allocations.map((a) => a.fiscalInvoiceId);
    const fiscalInvoices = await prisma.fiscalInvoice.findMany({
      where: { id: { in: fiscalIds } },
      select: { id: true, totalAmount: true },
    });
    const fiscalMap = new Map(fiscalInvoices.map((i) => [i.id, i]));
    const allocSums = await prisma.paymentAllocation.groupBy({
      by: ["fiscalInvoiceId"],
      where: { fiscalInvoiceId: { in: fiscalIds } },
      _sum: { amount: true },
    });
    const paidMap = new Map(
      allocSums
        .filter((g) => g.fiscalInvoiceId)
        .map((g) => [g.fiscalInvoiceId as string, g._sum.amount ?? ZERO]),
    );

    await prisma.$transaction(async (dbtx) => {
      for (const a of validated.allocations) {
        const fi = fiscalMap.get(a.fiscalInvoiceId);
        if (!fi) continue;
        const fiRemaining =
          fi.totalAmount != null
            ? fi.totalAmount.minus(paidMap.get(a.fiscalInvoiceId) ?? ZERO)
            : null;
        const requested =
          a.amount != null
            ? new Prisma.Decimal(a.amount)
            : fiRemaining ?? remainingOnTx;
        const amount = Prisma.Decimal.min(
          requested,
          remainingOnTx.greaterThan(0) ? remainingOnTx : requested,
        );
        if (amount.lessThanOrEqualTo(0)) continue;
        await applyAllocation(dbtx, {
          bankTransactionId: id,
          fiscalInvoiceId: a.fiscalInvoiceId,
          amount: amount.toFixed(2),
          matchedBy: "MANUAL",
          matchedById: user!.id,
          note: validated.note ?? null,
        });
        remainingOnTx = remainingOnTx.minus(amount);
      }
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
    console.error("POST /api/admin/bank-transactions/[id]/match:", error);
    return NextResponse.json({ error: "Match failed" }, { status: 500 });
  }
}

/** Clears all allocations for a transaction and reverts affected receivables. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  const denied = unauthorized(user);
  if (denied) return denied;
  const { id } = await params;

  try {
    const allocations = await prisma.paymentAllocation.findMany({
      where: { bankTransactionId: id },
      select: { fiscalInvoiceId: true },
    });
    const fiscalIds = [
      ...new Set(allocations.map((a) => a.fiscalInvoiceId).filter((v): v is string => !!v)),
    ];

    await prisma.$transaction(async (dbtx) => {
      await dbtx.paymentAllocation.deleteMany({ where: { bankTransactionId: id } });

      // Revert fiscal invoices no longer fully covered.
      for (const fiscalInvoiceId of fiscalIds) {
        const fi = await dbtx.fiscalInvoice.findUnique({
          where: { id: fiscalInvoiceId },
          select: { id: true, totalAmount: true, paidAt: true },
        });
        if (!fi || !fi.paidAt) continue;
        const sum = await dbtx.paymentAllocation.aggregate({
          where: { fiscalInvoiceId },
          _sum: { amount: true },
        });
        const paid = sum._sum.amount ?? ZERO;
        if (fi.totalAmount == null || paid.lessThan(fi.totalAmount)) {
          await dbtx.fiscalInvoice.update({
            where: { id: fiscalInvoiceId },
            data: { paidAt: null },
          });
        }
      }

      await dbtx.bankTransaction.update({
        where: { id },
        data: { matchStatus: "UNMATCHED" },
      });
    });

    const updated = await prisma.bankTransaction.findUniqueOrThrow({
      where: { id },
      include: BANK_TRANSACTION_INCLUDE,
    });
    return NextResponse.json({
      transaction: toSerializableBankTransaction(updated),
    });
  } catch (error) {
    console.error("DELETE /api/admin/bank-transactions/[id]/match:", error);
    return NextResponse.json({ error: "Unmatch failed" }, { status: 500 });
  }
}
