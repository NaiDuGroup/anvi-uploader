import { NextRequest, NextResponse } from "next/server";
import type { BusinessExpense, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";
import { profitVatBasisFromSettings, type ProfitVatBasis } from "@/lib/accounting/vatBasis";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { parseProductionCostsJson } from "@/lib/accounting/types";
import {
  buildOrderProfitRows,
  normalizeProfitScalar,
  summarizeProfitRows,
  type LiveUnitCosts,
  type ProfitOrderLineInput,
} from "@/lib/accounting/orderProfit";
import { effectiveUnitCost } from "@/lib/stock/effectiveUnitCost";
import type { ExpenseForAccrual } from "@/lib/accounting/expenseAccrual";
import { expenseTotalInPeriod } from "@/lib/accounting/expenseAccrual";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function defaultTodayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseRange(
  req: NextRequest,
): { from: string; to: string } | { error: string } {
  const fromRaw = req.nextUrl.searchParams.get("from")?.trim() ?? "";
  const toRaw = req.nextUrl.searchParams.get("to")?.trim() ?? "";
  const from = fromRaw || defaultTodayUtc();
  const to = toRaw || from;
  if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) {
    return { error: "invalid_date" };
  }
  if (from > to) {
    return { error: "range_inverted" };
  }
  return { from, to };
}

function toExpenseAccrual(e: BusinessExpense): ExpenseForAccrual {
  return {
    type: e.type,
    period: e.period,
    amount: e.amount,
    isActive: e.isActive,
    startDate: e.startDate,
    endDate: e.endDate,
  };
}

function orderCustomerLabel(
  clientName: string | null,
  studioClient: {
    personName: string | null;
    companyName: string | null;
  } | null,
): string | null {
  if (studioClient) {
    const c =
      studioClient.companyName?.trim() || studioClient.personName?.trim();
    if (c) return c;
  }
  return clientName?.trim() || null;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: superadmin only" },
      { status: 403 },
    );
  }

  const range = parseRange(request);
  if ("error" in range) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }
  const { from, to } = range;

  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T23:59:59.999Z`);

  const [orders, expenseRows, settingsRow, company] = await Promise.all([
    prisma.order.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: start, lte: end },
      },
      include: {
        orderLines: {
          orderBy: { sortOrder: "asc" },
          include: { files: true },
        },
        studioClient: {
          select: { personName: true, companyName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.businessExpense.findMany({
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    }),
    getOrCreateAccountingSettings(),
    getOrCreateCompanyProfile(),
  ]);

  const mugIds = new Set<string>();
  const notebookIds = new Set<string>();
  const penIds = new Set<string>();
  for (const o of orders) {
    for (const line of o.orderLines) {
      if (line.mugProductId) mugIds.add(line.mugProductId);
      if (line.notebookProductId) notebookIds.add(line.notebookProductId);
      if (line.penProductId) penIds.add(line.penProductId);
    }
  }

  const unitCostSelect = { id: true, purchaseCost: true, avgPurchaseCost: true } as const;
  const [mugRows, notebookRows, penRows] = await Promise.all([
    mugIds.size
      ? prisma.mugProduct.findMany({
          where: { id: { in: [...mugIds] } },
          select: unitCostSelect,
        })
      : [],
    notebookIds.size
      ? prisma.notebookProduct.findMany({
          where: { id: { in: [...notebookIds] } },
          select: unitCostSelect,
        })
      : [],
    penIds.size
      ? prisma.penProduct.findMany({
          where: { id: { in: [...penIds] } },
          select: unitCostSelect,
        })
      : [],
  ]);

  const decimalToNumber = (
    d: { toString(): string } | null | undefined,
  ): number | null => (d == null ? null : Number(d.toString()));

  const toCostMap = (
    rows: readonly { id: string; purchaseCost: Prisma.Decimal | null; avgPurchaseCost: Prisma.Decimal | null }[],
  ): Map<string, number | null> =>
    new Map(rows.map((r) => [r.id, effectiveUnitCost(r.avgPurchaseCost, r.purchaseCost)]));

  const liveCosts: LiveUnitCosts = {
    mug: toCostMap(mugRows),
    notebook: toCostMap(notebookRows),
    pen: toCostMap(penRows),
  };

  const production = parseProductionCostsJson(settingsRow.productionCosts);
  const accrualExpenses = expenseRows.map(toExpenseAccrual);

  const orderInputs = orders.map((o) => {
    const lines: ProfitOrderLineInput[] = o.orderLines.map((l) => ({
      productType: l.productType,
      mugProductId: l.mugProductId,
      mugProductSnapshot: l.mugProductSnapshot,
      notebookProductId: l.notebookProductId,
      notebookProductSnapshot: l.notebookProductSnapshot,
      penProductId: l.penProductId,
      penProductSnapshot: l.penProductSnapshot,
      largeFormatLineData: l.largeFormatLineData,
      dtfLineData: l.dtfLineData,
      files: l.files,
    }));
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      price: decimalToNumber(o.price),
      clientName: o.clientName,
      studioClient: o.studioClient,
      orderLines: lines,
    };
  });

  const vatBasis: ProfitVatBasis = profitVatBasisFromSettings(settingsRow);
  const profitRows = buildOrderProfitRows(
    orderInputs,
    accrualExpenses,
    production,
    liveCosts,
    vatBasis,
  ).map((r) => ({
    ...r,
    customerLabel: orderCustomerLabel(r.clientName ?? null, r.studioClient),
  }));

  const summary = summarizeProfitRows(profitRows);

  const expensesBreakdown = expenseRows.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    period: e.period,
    amount: e.amount,
    isActive: e.isActive,
    startDate: e.startDate.toISOString().slice(0, 10),
    endDate: e.endDate ? e.endDate.toISOString().slice(0, 10) : null,
    notes: e.notes,
    accruedInRange: normalizeProfitScalar(
      expenseTotalInPeriod(toExpenseAccrual(e), from, to),
    ),
  }));

  return NextResponse.json({
    currency: company.currency,
    range: { from, to },
    productionCosts: production,
    /** True when revenue and purchase costs are shown without VAT. */
    amountsExVat: vatBasis.exVat,
    summary,
    orders: profitRows.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      createdAt: r.createdAt.toISOString(),
      customerLabel: r.customerLabel,
      revenue: r.revenue,
      productPurchaseCosts: r.productPurchaseCosts,
      productionCosts: r.productionCosts,
      allocatedExpenses: r.allocatedExpenses,
      taxes: r.taxes,
      netProfit: r.netProfit,
      profitMarginPct: r.profitMarginPct,
      missingProductCost: r.missingProductCost,
    })),
    expensesBreakdown,
  });
}
