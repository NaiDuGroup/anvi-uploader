import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { normalizeCounterparty } from "@/lib/bankStatement/counterparty";

export const runtime = "nodejs";

type Kind = "transfers" | "commissions" | "all";

function kindFilter(kind: Kind): Prisma.BankTransactionWhereInput {
  if (kind === "transfers") return { txTypeCode: "1" };
  if (kind === "commissions") return { txTypeCode: "6" };
  return {};
}

/** Lists individual outgoing payments for one supplier (by IDNO, or by name). */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const idno = searchParams.get("idno")?.trim() || null;
  const name = searchParams.get("name")?.trim() || null;
  const kind = (searchParams.get("kind") as Kind) || "transfers";

  const dateFromRaw = searchParams.get("dateFrom");
  const dateToRaw = searchParams.get("dateTo");
  const dateFrom = dateFromRaw ? new Date(`${dateFromRaw}T00:00:00.000Z`) : null;
  const dateTo = dateToRaw ? new Date(`${dateToRaw}T23:59:59.999Z`) : null;
  const bookingDateFilter =
    (dateFrom && !Number.isNaN(dateFrom.getTime())) ||
    (dateTo && !Number.isNaN(dateTo.getTime()))
      ? {
          bookingDate: {
            ...(dateFrom && !Number.isNaN(dateFrom.getTime()) ? { gte: dateFrom } : {}),
            ...(dateTo && !Number.isNaN(dateTo.getTime()) ? { lte: dateTo } : {}),
          },
        }
      : {};

  if (!idno && !name) {
    return NextResponse.json({ error: "idno or name required" }, { status: 400 });
  }

  let rows = await prisma.bankTransaction.findMany({
    where: {
      direction: "DEBIT",
      ...kindFilter(kind),
      ...bookingDateFilter,
      ...(idno ? { counterpartyIdno: idno } : {}),
    },
    orderBy: { bookingDate: "desc" },
    select: {
      id: true,
      bookingDate: true,
      amount: true,
      currency: true,
      counterpartyName: true,
      purpose: true,
      documentNumber: true,
      txTypeCode: true,
    },
  });

  // Name fallback for counterparties without an IDNO.
  if (!idno && name) {
    const target = name.toLowerCase();
    rows = rows.filter(
      (r) => normalizeCounterparty(r.counterpartyName).toLowerCase() === target,
    );
  }

  const total = rows.reduce((sum, r) => sum.add(r.amount), new Prisma.Decimal(0));

  return NextResponse.json({
    total: total.toString(),
    count: rows.length,
    payments: rows.map((r) => ({
      id: r.id,
      bookingDate: r.bookingDate.toISOString(),
      amount: r.amount.toString(),
      currency: r.currency,
      counterpartyName: normalizeCounterparty(r.counterpartyName),
      purpose: r.purpose,
      documentNumber: r.documentNumber,
      txTypeCode: r.txTypeCode,
    })),
  });
}
