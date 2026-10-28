import { PURCHASE_COST_KINDS, type ImportCostKind } from "./constants";

/**
 * Landed cost of an import: every cost that is not excluded is spread over the
 * lines in proportion to the line amount (in the shipment currency), like the
 * owner's costing spreadsheet. Skipped lines («не на склад») still take their
 * share — the money was spent on them.
 */

export interface CostingLineInput {
  id: string;
  quantity: number;
  /** Line amount in the shipment currency (as on the document). */
  amount: number;
}

export interface CostingCostInput {
  kind: string;
  amountMdl: number;
  excluded?: boolean;
  isProvisional?: boolean;
}

export interface CostingLine {
  id: string;
  /** Purchase price per piece (supplier payment + bank fee share), MDL. */
  purchaseUnitMdl: number;
  purchaseTotalMdl: number;
  /** Full landed cost per piece, MDL. */
  landedUnitMdl: number;
  landedTotalMdl: number;
}

export interface ImportCosting {
  goodsAmount: number;
  purchaseCostsMdl: number;
  totalCostsMdl: number;
  /** MDL per 1 unit of the shipment currency. */
  purchasePerCurrencyUnit: number;
  landedPerCurrencyUnit: number;
  /** Some included cost is not final yet (e.g. customs advance). */
  provisional: boolean;
  lines: CostingLine[];
}

function round(n: number, digits: number): number {
  const f: number = 10 ** digits;
  return Math.round(n * f) / f;
}

export function computeImportCosting(
  lines: readonly CostingLineInput[],
  costs: readonly CostingCostInput[],
): ImportCosting {
  const included = costs.filter((c) => !c.excluded && Number.isFinite(c.amountMdl));
  const purchaseKinds = new Set<string>(PURCHASE_COST_KINDS as readonly ImportCostKind[]);
  const totalCostsMdl: number = included.reduce((s, c) => s + c.amountMdl, 0);
  const purchaseCostsMdl: number = included.filter((c) => purchaseKinds.has(c.kind)).reduce((s, c) => s + c.amountMdl, 0);
  const goodsAmount: number = lines.reduce((s, l) => s + Math.max(0, l.amount), 0);
  const purchasePer: number = goodsAmount > 0 ? purchaseCostsMdl / goodsAmount : 0;
  const landedPer: number = goodsAmount > 0 ? totalCostsMdl / goodsAmount : 0;
  return {
    goodsAmount: round(goodsAmount, 2),
    purchaseCostsMdl: round(purchaseCostsMdl, 2),
    totalCostsMdl: round(totalCostsMdl, 2),
    purchasePerCurrencyUnit: round(purchasePer, 6),
    landedPerCurrencyUnit: round(landedPer, 6),
    provisional: included.some((c) => c.isProvisional),
    lines: lines.map((l) => {
      const amount: number = Math.max(0, l.amount);
      const qty: number = l.quantity > 0 ? l.quantity : 0;
      const purchaseTotal: number = amount * purchasePer;
      const landedTotal: number = amount * landedPer;
      return {
        id: l.id,
        purchaseUnitMdl: qty > 0 ? round(purchaseTotal / qty, 4) : 0,
        purchaseTotalMdl: round(purchaseTotal, 2),
        landedUnitMdl: qty > 0 ? round(landedTotal / qty, 4) : 0,
        landedTotalMdl: round(landedTotal, 2),
      };
    }),
  };
}

/**
 * Unit cost to set on a variant from its lines across historical imports:
 * weighted by quantity (Σ landed total ÷ Σ quantity).
 */
export function weightedUnitCost(entries: readonly { quantity: number; unitCostMdl: number }[]): number | null {
  const qty: number = entries.reduce((s, e) => s + (e.quantity > 0 ? e.quantity : 0), 0);
  if (!(qty > 0)) return null;
  const total: number = entries.reduce((s, e) => s + (e.quantity > 0 ? e.quantity * e.unitCostMdl : 0), 0);
  return round(total / qty, 4);
}
