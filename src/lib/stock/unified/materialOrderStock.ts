import { Prisma } from "@prisma/client";
import { FINISHED_ORDER_STATUSES } from "@/lib/validations";
import {
  procurementMetaToJson,
  procurementMetaToList,
  type OrderProcurementMetaItem,
} from "@/lib/orderProcurement";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import { parseBusinessCardLineData } from "@/lib/businessCard/parseBusinessCardLineData";
import { SHEET_PRODUCT_TYPES } from "@/lib/sheetProduct/sheetProductConfig";
import { ORDER_HOLDING_KINDS, StockMovementKind } from "./kinds";
import { consume, returnToStock } from "./ledger";
import { roundQty } from "./ledgerMath";
import {
  MATERIAL_CATEGORY_CODES,
  requireLfMaterialVariantId,
  requireSheetPaperVariantId,
  ROLL_MEDIA_CATEGORY_CODE,
  SHEET_PAPER_CATEGORY_CODE,
} from "./materials";

/**
 * Order stock of wide-format rolls (metres) and sheet paper (sheets) on the
 * unified ledger. Lines keep their pricing row (`largeFormatMaterialId` /
 * `sheetPaperId`) and carry the variant in `OrderLine.stockVariantId`.
 *
 * Shortage behaviour is the same as before the switch: nothing is taken, the
 * order gets an `lf_roll` / `sheet_paper` procurement entry (keyed by the
 * pricing row id) and a receipt of the variant fills it later with a
 * `PROCUREMENT_BACKLOG` movement.
 */

type Tx = Prisma.TransactionClient;

export type MaterialKind = "roll" | "sheet";

const EPS = 1e-6;
const LF_PRODUCT_TYPE = "large_format_print";

type OrderRefParams = {
  orderId: string;
  orderNumber: number | null;
  createdById: string | null;
};

async function requireVariantId(tx: Tx, kind: MaterialKind, materialId: string): Promise<string> {
  return kind === "roll" ? requireLfMaterialVariantId(tx, materialId) : requireSheetPaperVariantId(tx, materialId);
}

function shortageEntry(
  kind: MaterialKind,
  materialId: string,
  requested: number,
  available: number,
): OrderProcurementMetaItem {
  return kind === "roll"
    ? { kind: "lf_roll", materialId, requestedLinearMeters: requested, stockAtOrder: available }
    : { kind: "sheet_paper", sheetPaperId: materialId, requestedSheets: requested, stockAtOrder: available };
}

/**
 * Take one line's roll metres / paper sheets (never below zero) and link the
 * line to the variant. Returns the `lf_roll` / `sheet_paper` procurement entry
 * when stock is short — nothing is taken then.
 */
export async function takeMaterialLineStock(
  tx: Tx,
  params: OrderRefParams & {
    kind: MaterialKind;
    /** Pricing row id (`LargeFormatMaterial.id` / `SheetPaper.id`). */
    materialId: string;
    quantity: number;
    orderLineId: string;
  },
): Promise<OrderProcurementMetaItem | null> {
  const variantId: string = await requireVariantId(tx, params.kind, params.materialId);
  await tx.orderLine.update({ where: { id: params.orderLineId }, data: { stockVariantId: variantId } });
  if (!(params.quantity > 0) || !Number.isFinite(params.quantity)) return null;
  const res = await consume(tx, {
    variantId,
    quantity: params.quantity,
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    orderLineId: params.orderLineId,
    createdById: params.createdById,
  });
  return res.consumed ? null : shortageEntry(params.kind, params.materialId, res.requested, res.available);
}

// ─── What an order holds ─────────────────────────────────────────────────────

export type MaterialHolding = {
  /** Net units the order holds on the variant (sales − returns ± transfers). */
  total: number;
  /** Net units per order line; `null` collects movements without a line (legacy copies). */
  byLine: Map<string | null, number>;
};

/**
 * Roll metres / sheets an order still holds per variant: −Σ delta of its sale,
 * return, backlog and layout-transfer movements. Netted by order (old
 * movements may lack the line), with the per-line split where it is known.
 */
export async function materialStockHeldByOrder(
  tx: Tx,
  orderId: string,
  categoryCodes: readonly string[] = MATERIAL_CATEGORY_CODES,
): Promise<Map<string, MaterialHolding>> {
  const rows = await tx.stockMovement.groupBy({
    by: ["variantId", "orderLineId"],
    where: {
      orderId,
      kind: { in: [...ORDER_HOLDING_KINDS] },
      variant: { item: { category: { code: { in: [...categoryCodes] } } } },
    },
    _sum: { delta: true },
  });
  const out = new Map<string, MaterialHolding>();
  for (const r of rows) {
    const held: number = -Number(r._sum.delta?.toString() ?? "0");
    const h: MaterialHolding = out.get(r.variantId) ?? { total: 0, byLine: new Map() };
    h.total = roundQty(h.total + held);
    h.byLine.set(r.orderLineId, roundQty((h.byLine.get(r.orderLineId) ?? 0) + held));
    out.set(r.variantId, h);
  }
  for (const [variantId, h] of out) {
    if (!(h.total > EPS)) out.delete(variantId);
  }
  return out;
}

/**
 * Split what an order holds on a variant back over its lines: lines that hold
 * stock first (largest first), whatever is left without a line. The parts sum
 * up to `holding.total` exactly.
 */
export function splitHoldingByLine(holding: MaterialHolding): { orderLineId: string | null; quantity: number }[] {
  let left: number = holding.total;
  const parts: { orderLineId: string | null; quantity: number }[] = [];
  const lines = [...holding.byLine.entries()]
    .filter((e): e is [string, number] => e[0] !== null && e[1] > EPS)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [orderLineId, held] of lines) {
    if (!(left > EPS)) break;
    const q: number = roundQty(Math.min(held, left));
    parts.push({ orderLineId, quantity: q });
    left = roundQty(left - q);
  }
  if (left > EPS) parts.push({ orderLineId: null, quantity: left });
  return parts;
}

/**
 * Put back every roll metre / sheet the order still holds (delete, structure
 * edit, restore pre-settle). Only what the ledger says was taken comes back —
 * on the roll it currently sits on after layout transfers — so nothing is
 * returned twice and lines that waited for procurement return nothing.
 */
export async function returnMaterialStockForOrder(
  tx: Tx,
  params: OrderRefParams,
): Promise<void> {
  const held: Map<string, MaterialHolding> = await materialStockHeldByOrder(tx, params.orderId);
  for (const [variantId, holding] of held) {
    for (const part of splitHoldingByLine(holding)) {
      await returnToStock(tx, {
        variantId,
        quantity: part.quantity,
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        orderLineId: part.orderLineId,
        createdById: params.createdById,
      });
    }
  }
}

/**
 * Roll metres each line holds per roll variant (net of sales, returns, backlog
 * and layout transfers), for the workshop «printed on another roll» flow.
 */
export async function rollHoldingsByLine(
  tx: Tx,
  orderLineIds: readonly string[],
): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (orderLineIds.length === 0) return out;
  const rows = await tx.stockMovement.groupBy({
    by: ["orderLineId", "variantId"],
    where: {
      orderLineId: { in: [...orderLineIds] },
      kind: { in: [...ORDER_HOLDING_KINDS] },
      variant: { item: { category: { code: ROLL_MEDIA_CATEGORY_CODE } } },
    },
    _sum: { delta: true },
  });
  for (const r of rows) {
    if (!r.orderLineId) continue;
    const held: number = roundQty(-Number(r._sum.delta?.toString() ?? "0"));
    if (!(held > EPS)) continue;
    const m: Map<string, number> = out.get(r.orderLineId) ?? new Map();
    m.set(r.variantId, held);
    out.set(r.orderLineId, m);
  }
  return out;
}

// ─── Procurement backlog ─────────────────────────────────────────────────────

type BacklogLine = {
  id: string;
  largeFormatLineData: Prisma.JsonValue;
  businessCardLineData: Prisma.JsonValue;
};

function lineQuantity(kind: MaterialKind, line: BacklogLine): number {
  if (kind === "roll") {
    const lm: number | undefined = parseLargeFormatLineData(line.largeFormatLineData)?.calculatedLinearMeters;
    return typeof lm === "number" && lm > 0 ? lm : 0;
  }
  const sheets: number | undefined = parseBusinessCardLineData(line.businessCardLineData)?.sheetsUsed;
  return typeof sheets === "number" && sheets > 0 ? sheets : 0;
}

/** Procurement entry of an order that waits for this roll / paper (legacy keys or the variant). */
export function isWaitingForMaterial(
  m: OrderProcurementMetaItem,
  kind: MaterialKind,
  materialId: string | null,
  variantId: string,
): boolean {
  if (m.kind === "stock_variant") return m.variantId === variantId;
  if (materialId == null) return false;
  return kind === "roll"
    ? m.kind === "lf_roll" && m.materialId === materialId
    : m.kind === "sheet_paper" && m.sheetPaperId === materialId;
}

/**
 * Per-line quantities still to take: what each line needs minus what it
 * already holds; holdings without a known line (legacy copies, deleted lines)
 * cover the remaining need in line order.
 */
export function planBacklogTake(
  lines: readonly { id: string; quantity: number }[],
  heldByLine: ReadonlyMap<string, number>,
  unattributedHeld: number,
): { orderLineId: string; quantity: number }[] {
  let unattributed: number = Math.max(0, unattributedHeld);
  const out: { orderLineId: string; quantity: number }[] = [];
  for (const l of lines) {
    let need: number = roundQty(l.quantity - Math.max(0, heldByLine.get(l.id) ?? 0));
    if (unattributed > EPS && need > EPS) {
      const covered: number = Math.min(unattributed, need);
      need = roundQty(need - covered);
      unattributed = roundQty(unattributed - covered);
    }
    if (need > EPS) out.push({ orderLineId: l.id, quantity: need });
  }
  return out;
}

/**
 * What the given lines already hold for this backlog: per line on any variant
 * of the category (a roll line may sit on another roll after a layout
 * transfer), plus this variant's holdings that are not tied to one of the lines.
 */
function backlogHoldings(
  held: Map<string, MaterialHolding>,
  variantId: string,
  lineIds: readonly string[],
): { heldByLine: Map<string, number>; unattributed: number } {
  const ids = new Set(lineIds);
  const heldByLine = new Map<string, number>();
  for (const h of held.values()) {
    for (const [lineId, q] of h.byLine) {
      if (lineId !== null && ids.has(lineId)) heldByLine.set(lineId, roundQty((heldByLine.get(lineId) ?? 0) + q));
    }
  }
  let unattributed = 0;
  for (const [lineId, q] of held.get(variantId)?.byLine ?? []) {
    if (lineId === null || !ids.has(lineId)) unattributed = roundQty(unattributed + q);
  }
  return { heldByLine, unattributed };
}

/**
 * After a receipt of a roll / paper variant, take stock for orders that waited
 * for it (FIFO by creation; stops at the first order that still cannot be
 * covered). Finished orders are never filled. Old `lf_roll` / `sheet_paper`
 * entries (keyed by the pricing row id) are matched through the row's variant.
 */
export async function allocateMaterialProcurementBacklog(
  tx: Tx,
  params: { variantId: string; createdById: string | null },
): Promise<void> {
  const v = await tx.stockVariant.findUnique({
    where: { id: params.variantId },
    select: {
      lfMaterial: { select: { id: true } },
      sheetPaper: { select: { id: true } },
      item: { select: { category: { select: { code: true } } } },
    },
  });
  if (!v) return;
  const kind: MaterialKind | null =
    v.lfMaterial || v.item.category.code === ROLL_MEDIA_CATEGORY_CODE
      ? "roll"
      : v.sheetPaper || v.item.category.code === SHEET_PAPER_CATEGORY_CODE
        ? "sheet"
        : null;
  if (!kind) return;
  const materialId: string | null = (kind === "roll" ? v.lfMaterial?.id : v.sheetPaper?.id) ?? null;

  const lineWhere: Prisma.OrderLineWhereInput = {
    productType: kind === "roll" ? LF_PRODUCT_TYPE : { in: [...SHEET_PRODUCT_TYPES] },
    OR: [
      { stockVariantId: params.variantId },
      ...(materialId
        ? [kind === "roll" ? { largeFormatMaterialId: materialId } : { sheetPaperId: materialId }]
        : []),
    ],
  };

  const orders = await tx.order.findMany({
    where: {
      needsProcurement: true,
      deletedAt: null,
      status: { notIn: [...FINISHED_ORDER_STATUSES] },
      orderLines: { some: lineWhere },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderNumber: true,
      procurementMeta: true,
      orderLines: {
        where: lineWhere,
        orderBy: { sortOrder: "asc" },
        select: { id: true, largeFormatLineData: true, businessCardLineData: true },
      },
    },
  });

  for (const order of orders) {
    const list: OrderProcurementMetaItem[] = procurementMetaToList(order.procurementMeta);
    const waiting = (m: OrderProcurementMetaItem): boolean =>
      isWaitingForMaterial(m, kind, materialId, params.variantId);
    if (!list.some(waiting)) continue;

    const { heldByLine, unattributed } = backlogHoldings(
      await materialStockHeldByOrder(tx, order.id, [
        kind === "roll" ? ROLL_MEDIA_CATEGORY_CODE : SHEET_PAPER_CATEGORY_CODE,
      ]),
      params.variantId,
      order.orderLines.map((l) => l.id),
    );
    const takes = planBacklogTake(
      order.orderLines.map((l) => ({ id: l.id, quantity: lineQuantity(kind, l) })),
      heldByLine,
      unattributed,
    );
    const total: number = takes.reduce((acc, t) => acc + t.quantity, 0);
    if (total > EPS) {
      const balance = await tx.stockVariant.findUniqueOrThrow({
        where: { id: params.variantId },
        select: { stockQuantity: true },
      });
      if (Number(balance.stockQuantity.toString()) + EPS < roundQty(total)) break;
      for (const take of takes) {
        const res = await consume(tx, {
          variantId: params.variantId,
          quantity: take.quantity,
          kind: StockMovementKind.ProcurementBacklog,
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderLineId: take.orderLineId,
          createdById: params.createdById,
        });
        if (!res.consumed) throw new Error("material backlog: stock changed while filling an order");
      }
    }
    await tx.orderLine.updateMany({
      where: { id: { in: order.orderLines.map((l) => l.id) }, stockVariantId: null },
      data: { stockVariantId: params.variantId },
    });

    const rest: OrderProcurementMetaItem[] = list.filter((m) => !waiting(m));
    await tx.order.update({
      where: { id: order.id },
      data:
        rest.length === 0
          ? { needsProcurement: false, procurementMeta: Prisma.JsonNull }
          : {
              needsProcurement: true,
              procurementMeta: procurementMetaToJson(rest.length === 1 ? rest[0]! : rest),
            },
    });
  }
}
