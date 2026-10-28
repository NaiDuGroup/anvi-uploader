/** Unified stock constants (docs/UNIFIED-STOCK-PLAN.md). */

/** The single «Основной» location seeded by the `unified_stock_core` migration. */
export const DEFAULT_STOCK_LOCATION_ID = "main";

/** Stored in `StockMovement.kind`. */
export enum StockMovementKind {
  Receipt = "RECEIPT",
  ReceiptReversal = "RECEIPT_REVERSAL",
  ReceiptCostCorrection = "RECEIPT_COST_CORRECTION",
  /** Unit cost set without a receipt (historical import): 0 units, value change in `costMdl`. */
  CostRevaluation = "COST_REVALUATION",
  OrderSale = "ORDER_SALE",
  OrderReturn = "ORDER_RETURN",
  ProcurementBacklog = "PROCUREMENT_BACKLOG",
  InventoryAdjustment = "INVENTORY_ADJUSTMENT",
  WriteOff = "WRITE_OFF",
  Transfer = "TRANSFER",
  /** Wide-format roll: a layout printed on this roll instead of the one the line was charged to (−m). */
  LayoutTransferOut = "LAYOUT_TRANSFER_OUT",
  /** Counterpart of {@link LayoutTransferOut}: metres returned to the roll previously charged (+m). */
  LayoutTransferBack = "LAYOUT_TRANSFER_BACK",
}

/** Kinds that take stock for an order. */
export type OrderTakeKind =
  | StockMovementKind.OrderSale
  | StockMovementKind.ProcurementBacklog
  | StockMovementKind.LayoutTransferOut;

/** Kinds that give an order's stock back. */
export type OrderGiveBackKind = StockMovementKind.OrderReturn | StockMovementKind.LayoutTransferBack;

/** Every movement kind that says how much an order holds (net of returns and transfers). */
export const ORDER_HOLDING_KINDS: readonly StockMovementKind[] = [
  StockMovementKind.OrderSale,
  StockMovementKind.OrderReturn,
  StockMovementKind.ProcurementBacklog,
  StockMovementKind.LayoutTransferOut,
  StockMovementKind.LayoutTransferBack,
];

/** `StockCategory.kind` — groups categories on the Склад hub. */
export enum StockCategoryKind {
  Product = "product",
  Material = "material",
  Consumable = "consumable",
}

export const STOCK_CATEGORY_KINDS: readonly StockCategoryKind[] = [
  StockCategoryKind.Product,
  StockCategoryKind.Material,
  StockCategoryKind.Consumable,
];

/** `StockCategory.unit` — every item in a category is counted in this unit. */
export enum StockUnit {
  Pieces = "pcs",
  Meters = "m",
  Milliliters = "ml",
  Grams = "g",
  Sheets = "sheet",
}

export const STOCK_UNITS: readonly StockUnit[] = [
  StockUnit.Pieces,
  StockUnit.Meters,
  StockUnit.Milliliters,
  StockUnit.Grams,
  StockUnit.Sheets,
];

/** Piece and sheet counts must be whole numbers; length/volume/weight may be fractional. */
export function unitAllowsFractions(unit: StockUnit): boolean {
  return unit !== StockUnit.Pieces && unit !== StockUnit.Sheets;
}

export function isStockUnit(value: unknown): value is StockUnit {
  return typeof value === "string" && (STOCK_UNITS as readonly string[]).includes(value);
}

export function isStockCategoryKind(value: unknown): value is StockCategoryKind {
  return typeof value === "string" && (STOCK_CATEGORY_KINDS as readonly string[]).includes(value);
}
