import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { computeSuggestions } from "@/lib/reconciliation/autoMatch";
import {
  BANK_TRANSACTION_INCLUDE,
  toSerializableBankTransaction,
} from "@/lib/reconciliation/serialize";

export const runtime = "nodejs";

/**
 * Returns unresolved incoming (CREDIT) transactions with on-the-fly match
 * suggestions for the review UI. Optionally scoped to one statement.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const statementId = searchParams.get("statementId")?.trim() || undefined;
    const includeMatched = searchParams.get("includeMatched") === "true";

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, Number(searchParams.get("pageSize")) || 50),
    );

    const where = {
      direction: "CREDIT",
      ...(statementId ? { statementId } : {}),
      ...(includeMatched
        ? {}
        : { matchStatus: { in: ["UNMATCHED", "SUGGESTED"] } }),
    } as const;

    const total = await prisma.bankTransaction.count({ where });

    const transactions = await prisma.bankTransaction.findMany({
      where,
      include: BANK_TRANSACTION_INCLUDE,
      orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Suggestions are computed only for the current page to keep the query cheap.
    const rows = await Promise.all(
      transactions.map(async (tx) => ({
        transaction: toSerializableBankTransaction(tx),
        suggestions:
          tx.matchStatus === "MATCHED"
            ? []
            : await computeSuggestions(prisma, {
                id: tx.id,
                direction: tx.direction,
                amount: tx.amount,
                counterpartyIdno: tx.counterpartyIdno,
                purpose: tx.purpose,
              }),
      })),
    );

    return NextResponse.json({
      rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("GET /api/admin/reconciliation/queue:", error);
    return NextResponse.json(
      { error: "Failed to build reconciliation queue" },
      { status: 500 },
    );
  }
}
