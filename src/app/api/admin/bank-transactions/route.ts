import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import {
  BANK_TRANSACTION_INCLUDE,
  toSerializableBankTransaction,
} from "@/lib/reconciliation/serialize";

export const runtime = "nodejs";

/**
 * Full bank ledger (CREDIT + DEBIT) with optional direction and date filters.
 * Unlike the reconciliation queue, this is a read-only journal of all imported
 * movements — including IGNORED operational settlements.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, Number(searchParams.get("pageSize")) || 50),
    );

    const directionRaw = searchParams.get("direction")?.trim().toUpperCase();
    const direction =
      directionRaw === "CREDIT" || directionRaw === "DEBIT"
        ? directionRaw
        : null;

    const dateFromRaw = searchParams.get("dateFrom");
    const dateToRaw = searchParams.get("dateTo");
    const dateFrom = dateFromRaw
      ? new Date(`${dateFromRaw}T00:00:00.000Z`)
      : null;
    const dateTo = dateToRaw ? new Date(`${dateToRaw}T23:59:59.999Z`) : null;

    const bookingDateFilter =
      (dateFrom && !Number.isNaN(dateFrom.getTime())) ||
      (dateTo && !Number.isNaN(dateTo.getTime()))
        ? {
            bookingDate: {
              ...(dateFrom && !Number.isNaN(dateFrom.getTime())
                ? { gte: dateFrom }
                : {}),
              ...(dateTo && !Number.isNaN(dateTo.getTime())
                ? { lte: dateTo }
                : {}),
            },
          }
        : {};

    const where = {
      ...(direction ? { direction } : {}),
      ...bookingDateFilter,
    };

    const [total, rows] = await Promise.all([
      prisma.bankTransaction.count({ where }),
      prisma.bankTransaction.findMany({
        where,
        include: {
          ...BANK_TRANSACTION_INCLUDE,
          statement: { select: { id: true, fileName: true } },
        },
        orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      transactions: rows.map((tx) => ({
        ...toSerializableBankTransaction(tx),
        statementFileName: tx.statement?.fileName ?? null,
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/bank-transactions:", error);
    return NextResponse.json(
      { error: "Failed to load bank transactions" },
      { status: 500 },
    );
  }
}
