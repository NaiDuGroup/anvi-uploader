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
import { parseDtfLineData } from "@/lib/dtf/parseDtfLineData";
import { parseUvLineData } from "@/lib/uv/parseUvLineData";
import { parseSublimationLineData } from "@/lib/sublimation/parseSublimationLineData";
import {
  giftSetExtraStockSkus,
  isGiftSetBoxLineType,
  parseOrderLineSetData,
} from "@/lib/giftSet/giftSet";
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
  mugProductSnapshot: unknown;
  notebookProductSnapshot: unknown;
  /** Unified «Кружки» / «Ручки» / «Блокноты» variant of a mug / pen / notebook line. */
  stockVariantId?: string | null;
  penProductSnapshot?: unknown;
  largeFormatLineData: unknown;
  /** DTF snapshot; costs are frozen when the line is priced. */
  dtfLineData?: unknown;
  /** UV snapshot (item + ink); costs are frozen when the line is priced. */
  uvLineData?: unknown;
  /** Sublimation snapshot (blank + Epson consumables); costs are frozen when the line is priced. */
  sublimationLineData?: unknown;
  /**
   * «Набор»: the line's set data. The set's stock unit (A/B box, C set item) is
   * written off by SKU (`setData.boxSku`; older orders: the group's first line,
   * C v2 `setItemSku`), N per set — its cost is counted on that line.
   */
  setData?: unknown;
  /** «Набор»: the set group of the line (set profit breakdown). */
  setGroupId?: string | null;
  files: readonly { copies: number }[];
};

/** Current unit COGS per catalog SKU id, used when an order snapshot predates cost capture. */
export type LiveUnitCosts = {
  /** Keyed by mug variant id. */
  mug: ReadonlyMap<string, number | null>;
  /** Keyed by notebook variant id. */
  notebook: ReadonlyMap<string, number | null>;
  /** Keyed by pen variant id. */
  pen: ReadonlyMap<string, number | null>;
  /**
   * UV print cost (ink, varnish, primer) of one pen / notebook, keyed by
   * variant id — from the item's print area and UV norms at current ink
   * prices. Missing = no print cost counted.
   */
  uvPrintPerPiece?: ReadonlyMap<string, number>;
  /**
   * UV print cost of one piece by print size (cm), default UV norms — for
   * pen / notebook lines without a stock item (the China set's notebook and
   * pen), whose snapshot holds only the print size.
   */
  uvPrintCostForArea?: (widthCm: number, heightCm: number) => number;
  /**
   * «Набор»: unit cost of a set's stock unit (box / ready set item) by SKU.
   * Missing key = not a stock item (nothing written off, no cost); null = in
   * stock but no purchase cost yet.
   */
  giftSetUnitBySku?: ReadonlyMap<string, number | null>;
};

export const EMPTY_LIVE_UNIT_COSTS: LiveUnitCosts = {
  mug: new Map(),
  notebook: new Map(),
  pen: new Map(),
  uvPrintPerPiece: new Map(),
  giftSetUnitBySku: new Map(),
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
  const own = lineOwnPurchaseTotal(line, liveCosts, snapshotDivisor);
  const set = giftSetUnitsCost(line, liveCosts);
  return {
    lineTotal: own.lineTotal + set.lineTotal,
    missingUnitCost: own.missingUnitCost || set.missingUnitCost,
  };
}

/**
 * «Набор»: boxes / ready set items this line writes off (by SKU, N per set) at
 * the variant's current unit cost, like a mug line without a cost snapshot.
 */
function giftSetUnitsCost(line: ProfitOrderLineInput, liveCosts: LiveUnitCosts): LineCost {
  const set = line.setData == null ? null : parseOrderLineSetData(line.setData);
  if (!set || !(set.quantity > 0)) return { lineTotal: 0, missingUnitCost: false };
  let lineTotal = 0;
  let missingUnitCost = false;
  for (const sku of giftSetExtraStockSkus(set)) {
    const costs = liveCosts.giftSetUnitBySku;
    if (!costs?.has(sku)) continue;
    const unit = costs.get(sku) ?? null;
    if (unit == null) missingUnitCost = true;
    else lineTotal += unit * set.quantity;
  }
  return { lineTotal, missingUnitCost };
}

function lineOwnPurchaseTotal(
  line: ProfitOrderLineInput,
  liveCosts: LiveUnitCosts,
  snapshotDivisor: number,
): LineCost {
  if (line.productType === "mug") {
    return catalogUnitLineCost(
      mugOrderStockQuantityFromFiles(line.files),
      parseMugProductSnapshot(line.mugProductSnapshot),
      line.stockVariantId,
      liveCosts.mug,
      snapshotDivisor,
    );
  }

  if (line.productType === "notebook") {
    return catalogUnitLineCost(
      notebookOrderStockQuantityFromFiles(line.files),
      parseNotebookProductSnapshot(line.notebookProductSnapshot),
      line.stockVariantId,
      liveCosts.notebook,
      snapshotDivisor,
    );
  }

  if (line.productType === "pen") {
    const snap: PenProductSnapshot | null = parsePenProductSnapshot(line.penProductSnapshot);
    return catalogUnitLineCost(
      penOrderStockQuantityFromFiles(line.files),
      snap ? { isOther: isOtherPenSnapshot(snap), purchaseCost: snap.purchaseCost } : null,
      line.stockVariantId,
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

  if (line.productType === "uv_print") {
    const uv = parseUvLineData(line.uvLineData);
    if (!uv) return { lineTotal: 0, missingUnitCost: true };
    return {
      lineTotal: normalizeProfitScalar(uv.costs.totalCostMdl / snapshotDivisor),
      missingUnitCost: false,
    };
  }

  if (line.productType === "sublimation_print") {
    const subl = parseSublimationLineData(line.sublimationLineData);
    if (!subl) return { lineTotal: 0, missingUnitCost: true };
    return {
      lineTotal: normalizeProfitScalar(subl.costs.totalCostMdl / snapshotDivisor),
      missingUnitCost: false,
    };
  }

  if (line.productType === "dtf_apparel") {
    const dtf = parseDtfLineData(line.dtfLineData);
    if (!dtf) return { lineTotal: 0, missingUnitCost: true };
    return {
      lineTotal: normalizeProfitScalar(dtf.costs.totalCostMdl / snapshotDivisor),
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

/**
 * Production costs of an order on top of the items: mugs at the flat
 * «print per mug» norm; notebooks and pens at their UV print cost per piece
 * (`liveCosts.uvPrintPerPiece`, from the item's print area and UV norms);
 * plus the per-order packaging and consumables.
 */
export function computeOrderProductionCost(
  lines: readonly ProfitOrderLineInput[],
  cfg: ProductionCostsConfig,
  liveCosts: Pick<LiveUnitCosts, "uvPrintPerPiece" | "uvPrintCostForArea"> = EMPTY_LIVE_UNIT_COSTS,
): number {
  const variable = lines.reduce((acc, line) => acc + linePrintCost(line, cfg, liveCosts), 0);
  const total =
    cfg.packagingPerOrder +
    cfg.otherConsumablesPerOrder +
    variable;
  return normalizeProfitScalar(total);
}

/** Print cost of one mug / notebook / pen line (mug: the flat norm; notebook / pen: UV print per piece). Other lines: 0. */
function linePrintCost(
  line: ProfitOrderLineInput,
  cfg: ProductionCostsConfig,
  liveCosts: Pick<LiveUnitCosts, "uvPrintPerPiece" | "uvPrintCostForArea">,
): number {
  const uvPerPiece = (snap: { printWidthCm?: number | null; printHeightCm?: number | null } | null): number => {
    const byItem = line.stockVariantId ? liveCosts.uvPrintPerPiece?.get(line.stockVariantId) : undefined;
    if (byItem != null) return byItem;
    // No stock item (China set notebook / pen): price the print by its size.
    const w = snap?.printWidthCm;
    const h = snap?.printHeightCm;
    if (!line.stockVariantId && liveCosts.uvPrintCostForArea && typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
      return liveCosts.uvPrintCostForArea(w, h);
    }
    return 0;
  };
  if (line.productType === "mug") return cfg.mugPrintPerUnit * mugOrderStockQuantityFromFiles(line.files);
  if (line.productType === "notebook") {
    return uvPerPiece(parseNotebookProductSnapshot(line.notebookProductSnapshot)) * notebookOrderStockQuantityFromFiles(line.files);
  }
  if (line.productType === "pen") {
    return uvPerPiece(parsePenProductSnapshot(line.penProductSnapshot)) * penOrderStockQuantityFromFiles(line.files);
  }
  return 0;
}

// ─── «Набор» profit ─────────────────────────────────────────────────────────────

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** One item line of a set in the set profit breakdown. */
export interface GiftSetProfitItem {
  /** «Кружка» (the set's item label), else the line type. */
  label: string;
  productType: string;
  /** The item from stock (avg cost; snapshot cost when the order froze one). */
  itemCost: number;
  /** Print of the line (mug norm, UV print per piece; a UV / sublimation line's own cost). */
  printCost: number;
  missingCost: boolean;
}

/** Profit of one set of an order: set price − items − print − box. */
export interface GiftSetProfit {
  groupId: string;
  templateId: string;
  name: string;
  /** Number of sets. */
  quantity: number;
  /** The set price billed (sum of the item lines' shares), on the report's VAT basis. */
  revenue: number;
  items: GiftSetProfitItem[];
  /** Box (A / B) or the bought-in set item (C), N per set. */
  boxCost: number;
  totalCost: number;
  profit: number;
  /** Some item / box has no purchase cost yet (counted as 0). */
  missingCost: boolean;
}

/**
 * Profit of every set of an order's lines (grouped by `setGroupId`): the set
 * price the order billed minus the cost of each item (the same item cost the
 * order profit uses), the print cost of each line (the same production cost)
 * and the box. Lines outside a set are left out. Staff only (costs).
 */
export function computeGiftSetProfits(
  lines: readonly ProfitOrderLineInput[],
  production: ProductionCostsConfig,
  liveCosts: LiveUnitCosts,
  opts: { snapshotDivisor?: number; vatBasis?: ProfitVatBasis } = {},
): GiftSetProfit[] {
  const divisor = opts.snapshotDivisor ?? 1;
  const basis = opts.vatBasis ?? LEGACY_VAT_BASIS;
  const groups = new Map<string, { lines: ProfitOrderLineInput[]; set: NonNullable<ReturnType<typeof parseOrderLineSetData>> }>();
  for (const line of lines) {
    if (!line.setGroupId) continue;
    const set = parseOrderLineSetData(line.setData);
    if (!set) continue;
    const g = groups.get(line.setGroupId);
    if (g) g.lines.push(line);
    else groups.set(line.setGroupId, { lines: [line], set });
  }
  const out: GiftSetProfit[] = [];
  for (const [groupId, { lines: groupLines, set }] of groups) {
    let billed = 0;
    let boxCost = 0;
    let missingCost = false;
    const items: GiftSetProfitItem[] = [];
    for (const line of groupLines) {
      const d = parseOrderLineSetData(line.setData);
      // The set's stock unit (box / set item), and older orders' hidden box on the first line.
      const unit = giftSetUnitsCost(line, liveCosts);
      boxCost += unit.lineTotal;
      if (unit.missingUnitCost) missingCost = true;
      if (isGiftSetBoxLineType(line.productType) || d?.role === "box") continue;
      billed += d?.lineTotalMdl ?? 0;
      const own = lineOwnPurchaseTotal(line, liveCosts, divisor);
      const catalogItem = line.productType === "mug" || line.productType === "notebook" || line.productType === "pen";
      const item: GiftSetProfitItem = {
        label: d?.roleLabel || line.productType,
        productType: line.productType,
        itemCost: catalogItem ? round2(own.lineTotal) : 0,
        printCost: round2(catalogItem ? linePrintCost(line, production, liveCosts) : own.lineTotal),
        missingCost: own.missingUnitCost,
      };
      if (item.missingCost) missingCost = true;
      items.push(item);
    }
    const revenue = round2(revenueOnBasis(billed, basis));
    const totalCost = round2(items.reduce((s, i) => s + i.itemCost + i.printCost, 0) + boxCost);
    out.push({
      groupId,
      templateId: set.templateId,
      name: set.name,
      quantity: set.quantity,
      revenue,
      items,
      boxCost: round2(boxCost),
      totalCost,
      profit: round2(revenue - totalCost),
      missingCost,
    });
  }
  return out;
}

/** «Наборы» of a period: per template the number of sets, revenue, cost and profit. */
export interface GiftSetProfitSummaryRow {
  templateId: string;
  name: string;
  sets: number;
  revenue: number;
  cost: number;
  profit: number;
  missingCost: boolean;
}

export function summarizeGiftSetProfits(sets: readonly GiftSetProfit[]): GiftSetProfitSummaryRow[] {
  const by = new Map<string, GiftSetProfitSummaryRow>();
  for (const s of sets) {
    const row = by.get(s.templateId) ?? {
      templateId: s.templateId,
      name: s.name,
      sets: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      missingCost: false,
    };
    row.sets += s.quantity;
    row.revenue = round2(row.revenue + s.revenue);
    row.cost = round2(row.cost + s.totalCost);
    row.profit = round2(row.profit + s.profit);
    row.missingCost = row.missingCost || s.missingCost;
    by.set(s.templateId, row);
  }
  return [...by.values()].sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
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
  const productionCosts = computeOrderProductionCost(lines, production, liveCosts);
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
    const productionCosts = computeOrderProductionCost(o.orderLines, production, liveCosts);
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
