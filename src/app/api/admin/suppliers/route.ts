import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { normalizeCounterparty } from "@/lib/bankStatement/counterparty";

export const runtime = "nodejs";

type Kind = "transfers" | "commissions" | "all";

function kindFilter(kind: Kind): Prisma.BankTransactionWhereInput {
  // TD=1 = client transfers (real supplier payments); TD=6 = bank fees/acquiring.
  if (kind === "transfers") return { txTypeCode: "1" };
  if (kind === "commissions") return { txTypeCode: "6" };
  return {};
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim().toLowerCase();
    const kind = (searchParams.get("kind") as Kind) || "transfers";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(
      100,
      Math.max(5, Number(searchParams.get("pageSize")) || 25),
    );

    const dateFromRaw = searchParams.get("dateFrom");
    const dateToRaw = searchParams.get("dateTo");
    const dateFrom = dateFromRaw ? new Date(`${dateFromRaw}T00:00:00.000Z`) : null;
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

    const rows = await prisma.bankTransaction.findMany({
      where: {
        direction: "DEBIT",
        ...kindFilter(kind),
        ...bookingDateFilter,
      },
      select: {
        amount: true,
        bookingDate: true,
        counterpartyName: true,
        counterpartyIdno: true,
      },
    });

    // Aggregate by counterparty (IDNO when present, else normalized name).
    const map = new Map<
      string,
      {
        idno: string | null;
        name: string;
        count: number;
        total: Prisma.Decimal;
        first: Date;
        last: Date;
      }
    >();

    for (const r of rows) {
      const name = normalizeCounterparty(r.counterpartyName);
      const key = r.counterpartyIdno || name || "—";
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.total = existing.total.add(r.amount);
        if (r.bookingDate < existing.first) existing.first = r.bookingDate;
        if (r.bookingDate > existing.last) existing.last = r.bookingDate;
        if (!existing.name && name) existing.name = name;
      } else {
        map.set(key, {
          idno: r.counterpartyIdno || null,
          name,
          count: 1,
          total: r.amount,
          first: r.bookingDate,
          last: r.bookingDate,
        });
      }
    }

    let suppliers = [...map.values()];
    if (q) {
      suppliers = suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.idno ?? "").toLowerCase().includes(q),
      );
    }
    suppliers.sort((a, b) => b.total.comparedTo(a.total));

    const grandTotal = suppliers.reduce(
      (sum, s) => sum.add(s.total),
      new Prisma.Decimal(0),
    );
    const totalCount = suppliers.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const paged = suppliers.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      page,
      pageSize,
      totalPages,
      totalCount,
      grandTotal: grandTotal.toString(),
      suppliers: paged.map((s) => ({
        idno: s.idno,
        name: s.name || "—",
        count: s.count,
        total: s.total.toString(),
        firstPaymentDate: s.first.toISOString(),
        lastPaymentDate: s.last.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/suppliers:", error);
    return NextResponse.json(
      { error: "Failed to load suppliers" },
      { status: 500 },
    );
  }
}
