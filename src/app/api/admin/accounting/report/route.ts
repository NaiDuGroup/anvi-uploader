import { loadUvCatalog } from "@/lib/uv/uvCatalog";
import { uvPrintCostPerPieceByVariant } from "@/lib/uv/uvItemPrintCost";
import { NextRequest, NextResponse } from "next/server";
import type { BusinessExpense } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";
import { profitVatBasisFromSettings, snapshotCostDivisor, type ProfitVatBasis } from "@/lib/accounting/vatBasis";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { parseProductionCostsJson } from "@/lib/accounting/types";
import {
  buildOrderProfitRows,
  computeGiftSetProfits,
  normalizeProfitScalar,
  summarizeGiftSetProfits,
  summarizeProfitRows,
  type GiftSetProfit,
  type LiveUnitCosts,
  type ProfitOrderLineInput,
} from "@/lib/accounting/orderProfit";
import { effectiveUnitCost } from "@/lib/stock/effectiveUnitCost";
import { giftSetExtraStockSkus, parseOrderLineSetData } from "@/lib/giftSet/giftSet";
import type { ExpenseForAccrual } from "@/lib/accounting/expenseAccrual";
import { expenseTotalInPeriod } from "@/lib/accounting/expenseAccrual";
import { chisinauDayEndExclusive, chisinauDayStart } from "@/lib/chisinauDay";
import { dayKeyOf } from "@/lib/shop/report/period";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today as a Chișinău calendar day (orders are counted by the studio's day). */
function defaultToday(): string {
  return dayKeyOf(new Date());
}

function parseRange(
  req: NextRequest,
): { from: string; to: string } | { error: string } {
  const fromRaw = req.nextUrl.searchParams.get("from")?.trim() ?? "";
  const toRaw = req.nextUrl.searchParams.get("to")?.trim() ?? "";
  const from = fromRaw || defaultToday();
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

  // Chișinău calendar days: [00:00 of `from`, 00:00 of the day after `to`).
  const start = chisinauDayStart(from);
  const endExclusive = chisinauDayEndExclusive(to);
  if (!start || !endExclusive) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const [orders, expenseRows, settingsRow, company] = await Promise.all([
    prisma.order.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: start, lt: endExclusive },
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

  /** Unified mug / pen / notebook variants of the lines (every catalog line carries its variant). */
  const variantIds = new Set<string>();
  for (const o of orders) {
    for (const line of o.orderLines) {
      if (line.stockVariantId) variantIds.add(line.stockVariantId);
    }
  }
  const variantRows = variantIds.size
    ? await prisma.stockVariant.findMany({
        where: { id: { in: [...variantIds] } },
        select: { id: true, purchaseCost: true, avgCost: true },
      })
    : [];

  /** «Набор»: boxes / ready set items the sets write off (by SKU). */
  const setSkus = new Set<string>();
  for (const o of orders) {
    for (const line of o.orderLines) {
      if (!line.setGroupId) continue;
      for (const sku of giftSetExtraStockSkus(parseOrderLineSetData(line.setData))) setSkus.add(sku);
    }
  }
  const setUnitRows = setSkus.size
    ? await prisma.stockVariant.findMany({
        where: { sku: { in: [...setSkus] } },
        select: { sku: true, purchaseCost: true, avgCost: true },
      })
    : [];

  const decimalToNumber = (
    d: { toString(): string } | null | undefined,
  ): number | null => (d == null ? null : Number(d.toString()));

  /** Live unit cost per variant id (lines whose snapshot predates cost capture). */
  const variantCosts = new Map<string, number | null>(
    variantRows.map((r) => [r.id, effectiveUnitCost(r.avgCost, r.purchaseCost)]),
  );
  const uvCatalog = await loadUvCatalog();
  const liveCosts: LiveUnitCosts = {
    mug: variantCosts,
    notebook: variantCosts,
    pen: variantCosts,
    uvPrintPerPiece: uvPrintCostPerPieceByVariant(uvCatalog.items, uvCatalog.settings, uvCatalog.inkCosts),
    giftSetUnitBySku: new Map(setUnitRows.map((r) => [r.sku, effectiveUnitCost(r.avgCost, r.purchaseCost)])),
  };

  const production = parseProductionCostsJson(settingsRow.productionCosts);
  const accrualExpenses = expenseRows.map(toExpenseAccrual);

  const orderInputs = orders.map((o) => {
    const lines: ProfitOrderLineInput[] = o.orderLines.map((l) => ({
      productType: l.productType,
      mugProductSnapshot: l.mugProductSnapshot,
      notebookProductSnapshot: l.notebookProductSnapshot,
      stockVariantId: l.stockVariantId,
      penProductSnapshot: l.penProductSnapshot,
      largeFormatLineData: l.largeFormatLineData,
      dtfLineData: l.dtfLineData,
      uvLineData: l.uvLineData,
      sublimationLineData: l.sublimationLineData,
      setData: l.setGroupId ? l.setData : null,
      setGroupId: l.setGroupId,
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

  // «Набор»: profit of each set (set price − items − print − box), per order and per template.
  const giftSetsByOrder = new Map<string, GiftSetProfit[]>();
  for (const o of orderInputs) {
    if (!o.orderLines.some((l) => l.setGroupId)) continue;
    const sets = computeGiftSetProfits(o.orderLines, production, liveCosts, {
      snapshotDivisor: snapshotCostDivisor(o.createdAt, vatBasis),
      vatBasis,
    });
    if (sets.length > 0) giftSetsByOrder.set(o.id, sets);
  }
  const giftSetsSummary = summarizeGiftSetProfits([...giftSetsByOrder.values()].flat());

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
      giftSets: giftSetsByOrder.get(r.id) ?? [],
    })),
    giftSetsSummary,
    expensesBreakdown,
  });
}
