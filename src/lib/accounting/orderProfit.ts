import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import { parseMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { notebookOrderStockQuantityFromFiles } from "@/lib/notebook/notebookOrderStockQuantity";
import { parseNotebookProductSnapshot } from "@/lib/notebook/notebookProductSnapshot";
import { penOrderStockQuantityFromFiles } from "@/lib/pen/penOrderStockQuantity";
import {
  parsePenProductSnapshot,
  type PenProductSnapshot,
} from "@/lib/pen/penProductSnapshot";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import { sumExpensePoolForDay, type ExpenseForAccrual } from "./expenseAccrual";
import {
  LEGACY_VAT_BASIS,
  revenueOnBasis,
  snapshotCostDivisor,
  type ProfitVatBasis,
} from "./vatBasis";
import type {
  OrderProfitDirectCosts,
  ProductionCostsConfig,
} from "./types";

export type ProfitOrderLineInput = {
  productType: string;
  mugProductId: string | null;
  mugProductSnapshot: unknown;
  notebookProductId: string | null;
  notebookProductSnapshot: unknown;
  penProductId?: string | null;
  penProductSnapshot?: unknown;
  largeFormatLineData: unknown;
  files: readonly { copies: number }[];
};

/** Current unit COGS per catalog SKU id, used when an order snapshot predates cost capture. */
export type LiveUnitCosts = {
  mug: ReadonlyMap<string, number | null>;
  notebook: ReadonlyMap<string, number | null>;
  pen: ReadonlyMap<string, number | null>;
};

export const EMPTY_LIVE_UNIT_COSTS: LiveUnitCosts = {
  mug: new Map(),
  notebook: new Map(),
  pen: new Map(),
};

function orderCreatedUtcDayKey(createdAt: Date): string {
  return createdAt.toISOString().slice(0, 10);
}

function safeMarginPct(net: number, revenue: number): number {
  if (!(revenue > 0) || !Number.isFinite(net) || !Number.isFinite(revenue)) {
    return 0;
  }
  return Math.round((net / revenue) * 10000) / 100;
}

export function normalizeProfitScalar(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

type LineCost = { lineTotal: number; missingUnitCost: boolean };

type CatalogUnitSnapshot = { isOther?: boolean; purchaseCost?: number | null } | null;

function catalogUnitLineCost(
  quantity: number,
  snapshot: CatalogUnitSnapshot,
  productId: string | null | undefined,
  liveCosts: ReadonlyMap<string, number | null>,
  snapshotDivisor: number,
): LineCost {
  if (snapshot?.isOther === true) {
    return { lineTotal: 0, missingUnitCost: false };
  }
  const unit: number | null =
    snapshot?.purchaseCost != null
      ? snapshot.purchaseCost / snapshotDivisor
      : productId
        ? (liveCosts.get(productId) ?? null)
        : null;
  return {
    lineTotal: (unit ?? 0) * quantity,
    missingUnitCost: unit == null,
  };
}

function isOtherPenSnapshot(snapshot: PenProductSnapshot | null): boolean {
  return snapshot?.sku === "OTHER";
}

/**
 * @param snapshotDivisor applied to costs frozen on the order (snapshots), not to
 *   live catalog costs — see {@link snapshotCostDivisor}.
 */
export function computeLineProductPurchaseTotal(
  line: ProfitOrderLineInput,
  liveCosts: LiveUnitCosts,
  snapshotDivisor = 1,
): LineCost {
  if (line.productType === "mug") {
    return catalogUnitLineCost(
      mugOrderStockQuantityFromFiles(line.files),
      parseMugProductSnapshot(line.mugProductSnapshot),
      line.mugProductId,
      liveCosts.mug,
      snapshotDivisor,
    );
  }

  if (line.productType === "notebook") {
    return catalogUnitLineCost(
      notebookOrderStockQuantityFromFiles(line.files),
      parseNotebookProductSnapshot(line.notebookProductSnapshot),
      line.notebookProductId,
      liveCosts.notebook,
      snapshotDivisor,
    );
  }

  if (line.productType === "pen") {
    const snap: PenProductSnapshot | null = parsePenProductSnapshot(line.penProductSnapshot);
    return catalogUnitLineCost(
      penOrderStockQuantityFromFiles(line.files),
      snap ? { isOther: isOtherPenSnapshot(snap), purchaseCost: snap.purchaseCost } : null,
      line.penProductId,
      liveCosts.pen,
      snapshotDivisor,
    );
  }

  if (line.productType === "large_format_print") {
    const lf = parseLargeFormatLineData(line.largeFormatLineData);
    if (!lf || typeof lf.materialCost !== "number") {
      return { lineTotal: 0, missingUnitCost: true };
    }
    if (typeof lf.totalDirectCostMdl === "number") {
      return {
        lineTotal: normalizeProfitScalar(lf.totalDirectCostMdl / snapshotDivisor),
        missingUnitCost: false,
      };
    }
    return {
      lineTotal: normalizeProfitScalar(lf.materialCost / snapshotDivisor),
      missingUnitCost: false,
    };
  }

  return { lineTotal: 0, missingUnitCost: false };
}

export function computeOrderProductPurchaseTotal(
  lines: readonly ProfitOrderLineInput[],
  liveCosts: LiveUnitCosts,
  snapshotDivisor = 1,
): { total: number; missingUnitCost: boolean } {
  let total = 0;
  let missing = false;
  for (const line of lines) {
    const r = computeLineProductPurchaseTotal(line, liveCosts, snapshotDivisor);
    total += r.lineTotal;
    if (r.missingUnitCost) missing = true;
  }
  return { total, missingUnitCost: missing };
}

export function computeOrderProductionCost(
  lines: readonly ProfitOrderLineInput[],
  cfg: ProductionCostsConfig,
): number {
  const variable = lines.reduce((acc, line) => {
    if (line.productType === "mug") {
      const qty = mugOrderStockQuantityFromFiles(line.files);
      return acc + cfg.mugPrintPerUnit * qty;
    }
    if (line.productType === "notebook") {
      const qty = notebookOrderStockQuantityFromFiles(line.files);
      return acc + cfg.notebookPrintPerUnit * qty;
    }
    return acc;
  }, 0);
  const total =
    cfg.packagingPerOrder +
    cfg.otherConsumablesPerOrder +
    variable;
  return normalizeProfitScalar(total);
}

export function computeOrderDirectCosts(
  revenue: number,
  lines: readonly ProfitOrderLineInput[],
  liveCosts: LiveUnitCosts,
  production: ProductionCostsConfig,
): OrderProfitDirectCosts {
  const { total: productPurchaseCosts } = computeOrderProductPurchaseTotal(
    lines,
    liveCosts,
  );
  const productionCosts = computeOrderProductionCost(lines, production);
  return {
    revenue,
    productPurchaseCosts: normalizeProfitScalar(productPurchaseCosts),
    productionCosts,
  };
}

type OrderMeta = {
  id: string;
  revenue: number;
  createdAt: Date;
};

function allocatePoolToOrders(
  pool: number,
  orders: readonly OrderMeta[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (orders.length === 0 || pool === 0) return out;
  const sumRev = orders.reduce((a, o) => a + Math.max(0, o.revenue), 0);
  if (sumRev <= 0) {
    const each = pool / orders.length;
    for (const o of orders) {
      out.set(o.id, normalizeProfitScalar(each));
    }
    return out;
  }
  let allocated = 0;
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i]!;
    const share =
      i < orders.length - 1
        ? (Math.max(0, o.revenue) / sumRev) * pool
        : pool - allocated;
    const rounded = normalizeProfitScalar(share);
    allocated += rounded;
    out.set(o.id, rounded);
  }
  return out;
}

export function buildOrderProfitRows<
  T extends {
    id: string;
    orderNumber: number;
    createdAt: Date;
    price: number | null;
    orderLines: ProfitOrderLineInput[];
  },
>(
  orders: readonly T[],
  expenses: readonly ExpenseForAccrual[],
  production: ProductionCostsConfig,
  liveCosts: LiveUnitCosts,
  vatBasis: ProfitVatBasis = LEGACY_VAT_BASIS,
): Array<
  T & {
    customerLabel: string | null;
    revenue: number;
    productPurchaseCosts: number;
    productionCosts: number;
    allocatedExpenses: number;
    taxes: number;
    netProfit: number;
    profitMarginPct: number;
    missingProductCost: boolean;
  }
> {
  const byDay = new Map<string, T[]>();
  for (const o of orders) {
    const k = orderCreatedUtcDayKey(o.createdAt);
    let g = byDay.get(k);
    if (!g) {
      g = [];
      byDay.set(k, g);
    }
    g.push(o);
  }

  const allocatedNonTax = new Map<string, number>();
  const allocatedTax = new Map<string, number>();

  for (const [dayKey, dayOrders] of byDay) {
    const poolNon = sumExpensePoolForDay(expenses, dayKey, "nonTax");
    const poolTax = sumExpensePoolForDay(expenses, dayKey, "tax");
    const metas: OrderMeta[] = dayOrders.map((o) => ({
      id: o.id,
      revenue: revenueOnBasis(o.price ?? 0, vatBasis),
      createdAt: o.createdAt,
    }));
    const mNon = allocatePoolToOrders(poolNon, metas);
    const mTax = allocatePoolToOrders(poolTax, metas);
    for (const o of dayOrders) {
      allocatedNonTax.set(o.id, mNon.get(o.id) ?? 0);
      allocatedTax.set(o.id, mTax.get(o.id) ?? 0);
    }
  }

  return orders.map((o) => {
    const revenue = normalizeProfitScalar(revenueOnBasis(o.price ?? 0, vatBasis));
    const { total: pc, missingUnitCost } = computeOrderProductPurchaseTotal(
      o.orderLines,
      liveCosts,
      snapshotCostDivisor(o.createdAt, vatBasis),
    );
    const productionCosts = computeOrderProductionCost(o.orderLines, production);
    const taxes = allocatedTax.get(o.id) ?? 0;
    const allocatedExpenses = allocatedNonTax.get(o.id) ?? 0;
    const netProfit = normalizeProfitScalar(
      revenue -
        normalizeProfitScalar(pc) -
        productionCosts -
        allocatedExpenses -
        taxes,
    );
    const profitMarginPct = safeMarginPct(netProfit, revenue);
    return {
      ...o,
      customerLabel: null,
      revenue,
      productPurchaseCosts: normalizeProfitScalar(pc),
      productionCosts,
      allocatedExpenses,
      taxes,
      netProfit,
      profitMarginPct,
      missingProductCost: missingUnitCost,
    };
  });
}

export function summarizeProfitRows(
  rows: readonly {
    revenue: number;
    productPurchaseCosts: number;
    productionCosts: number;
    allocatedExpenses: number;
    taxes: number;
    netProfit: number;
  }[],
): {
  revenue: number;
  productPurchaseCosts: number;
  productionCosts: number;
  allocatedExpenses: number;
  taxes: number;
  netProfit: number;
  profitMarginPct: number;
} {
  let revenue = 0;
  let productPurchaseCosts = 0;
  let productionCosts = 0;
  let allocatedExpenses = 0;
  let taxes = 0;
  let netProfit = 0;
  for (const r of rows) {
    revenue += r.revenue;
    productPurchaseCosts += r.productPurchaseCosts;
    productionCosts += r.productionCosts;
    allocatedExpenses += r.allocatedExpenses;
    taxes += r.taxes;
    netProfit += r.netProfit;
  }
  return {
    revenue: normalizeProfitScalar(revenue),
    productPurchaseCosts: normalizeProfitScalar(productPurchaseCosts),
    productionCosts: normalizeProfitScalar(productionCosts),
    allocatedExpenses: normalizeProfitScalar(allocatedExpenses),
    taxes: normalizeProfitScalar(taxes),
    netProfit: normalizeProfitScalar(netProfit),
    profitMarginPct: safeMarginPct(netProfit, revenue),
  };
}
