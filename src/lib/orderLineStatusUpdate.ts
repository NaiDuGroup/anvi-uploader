import type { Prisma, PrismaClient } from "@prisma/client";
import { formatOrderLineItemRef } from "@/app/admin/_lib/orderLines";
import type { OrderLogEntry } from "@/lib/orderLog";
import { planOrderStatusWrite } from "@/lib/orderLineStatusSync";
import { giftSetBoxLineStatuses } from "@/lib/giftSet/giftSet";
import {
  canSetLineStatus,
  deriveWorkshopOrderStatus,
  isWorkshopPhaseStatus,
  type SettableLineStatus,
} from "@/lib/orderStatusFromLines";

/**
 * Server side of the per-line production status, step 2: set the status of
 * some lines and re-derive the order status from all of its lines in the same
 * transaction (`src/lib/orderStatusFromLines.ts`).
 *
 * A derived status change has the side effects of a status change through
 * `PATCH /api/orders/[id]`: `assignedTo` = the user, `isWorkshop` = true,
 * `issueReason` cleared, and a `status_changed` log entry (metadata
 * `{ derived: true }`). `sentToWorkshopBy` is not touched: going back to
 * SENT_TO_WORKSHOP by un-marking lines is not a new hand-over. Every changed
 * line gets a `line_status_changed` entry with its code (`#9452.1/3`).
 */

export type LineStatusErrorCode =
  | "order_not_found"
  | "line_not_in_order"
  | "wrong_phase"
  | "no_lines"
  /** The line waits for a new layout: lift the flag or replace the file first (`orderLineLayoutIssue.ts`). */
  | "line_needs_layout";

export class LineStatusError extends Error {
  constructor(
    readonly code: LineStatusErrorCode,
    readonly httpStatus: number,
    readonly orderId?: string,
  ) {
    super(code);
    this.name = "LineStatusError";
  }
}

export interface LineStatusChangeRequest {
  orderId: string;
  lineIds: readonly string[];
}

export interface OrderLineStatusResult {
  orderId: string;
  orderNumber: number;
  /** Lines whose status actually changed. */
  changedLineIds: string[];
  oldOrderStatus: string;
  newOrderStatus: string;
  lines: { id: string; productionStatus: string }[];
}

type Tx = Prisma.TransactionClient;

export interface LockedOrder {
  id: string;
  orderNumber: number;
  status: string;
  deletedAt: Date | null;
  orderLines: { id: string; sortOrder: number; productionStatus: string; productType?: string; setGroupId?: string | null }[];
}

/** Lock the orders (row lock, ordered by id against deadlocks) and load their lines. */
export async function lockOrders(tx: Tx, orderIds: readonly string[]): Promise<Map<string, LockedOrder>> {
  const ids = [...new Set(orderIds)].sort();
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
  const orders = await tx.order.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      deletedAt: true,
      orderLines: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true, productionStatus: true, productType: true, setGroupId: true },
      },
    },
  });
  return new Map(orders.map((o) => [o.id, o]));
}

/**
 * «Набор»: the box line of a set follows its set's lines (`giftSetBoxLineStatuses`);
 * writes the box lines that change and returns the lines with their new statuses.
 */
async function followGiftSetBoxLines<L extends { id: string; productType?: string; setGroupId?: string | null; productionStatus: string }>(
  tx: Tx,
  orderId: string,
  lines: readonly L[],
  at: Date,
): Promise<L[]> {
  const next = giftSetBoxLineStatuses(lines);
  if (next.size === 0) return [...lines];
  for (const status of new Set(next.values())) {
    const ids = [...next].filter(([, s]) => s === status).map(([id]) => id);
    await tx.orderLine.updateMany({ where: { orderId, id: { in: ids } }, data: { productionStatus: status, productionStatusAt: at } });
  }
  return lines.map((l) => (next.has(l.id) ? { ...l, productionStatus: next.get(l.id)! } : l));
}

/**
 * Re-derive a workshop-phase order's status from its current lines; writes the
 * order (+ log entries pushed to `logs`) only when it changes. Orders outside
 * the workshop phase or without lines are left alone.
 */
export async function applyDerivedStatus(
  tx: Tx,
  order: { id: string; status: string },
  lines: readonly { productionStatus: string }[],
  userId: string,
  logs: OrderLogEntry[],
): Promise<string> {
  if (!isWorkshopPhaseStatus(order.status)) return order.status;
  const derived = deriveWorkshopOrderStatus(lines);
  if (!derived || derived === order.status) return order.status;
  await tx.order.update({
    where: { id: order.id },
    data: { status: derived, assignedTo: userId, isWorkshop: true, issueReason: null },
  });
  logs.push({
    orderId: order.id,
    userId,
    action: "status_changed",
    field: "status",
    oldValue: order.status,
    newValue: derived,
    metadata: { derived: true },
  });
  return derived;
}

/**
 * Set `status` on the given lines of the given orders, all in one transaction.
 * Every order must exist (not trashed) and be in the workshop phase, and every
 * line must belong to the order it is listed under; otherwise nothing is
 * written and a {@link LineStatusError} is thrown.
 */
export async function setOrderLineStatuses(
  db: Pick<PrismaClient, "$transaction">,
  params: {
    requests: readonly LineStatusChangeRequest[];
    status: SettableLineStatus;
    userId: string;
    at?: Date;
  },
): Promise<OrderLineStatusResult[]> {
  const at = params.at ?? new Date();
  const { status, userId } = params;
  return db.$transaction(async (tx) => {
    const byOrder = new Map<string, Set<string>>();
    for (const r of params.requests) {
      const set = byOrder.get(r.orderId) ?? new Set<string>();
      for (const id of r.lineIds) set.add(id);
      byOrder.set(r.orderId, set);
    }
    const locked = await lockOrders(tx, [...byOrder.keys()]);

    // Validate everything before the first write.
    for (const [orderId, lineIds] of byOrder) {
      const order = locked.get(orderId);
      if (!order || order.deletedAt) throw new LineStatusError("order_not_found", 404, orderId);
      if (lineIds.size === 0) throw new LineStatusError("no_lines", 400, orderId);
      const own = new Set(order.orderLines.map((l) => l.id));
      for (const id of lineIds) {
        if (!own.has(id)) throw new LineStatusError("line_not_in_order", 400, orderId);
      }
      if (!canSetLineStatus(order.status)) throw new LineStatusError("wrong_phase", 409, orderId);
      // A flagged line leaves NEEDS_LAYOUT only by «Снять отметку» or a new file,
      // so a batch racing the flag cannot print it.
      for (const l of order.orderLines) {
        if (lineIds.has(l.id) && l.productionStatus === "NEEDS_LAYOUT") {
          throw new LineStatusError("line_needs_layout", 409, orderId);
        }
      }
    }

    const results: OrderLineStatusResult[] = [];
    const logs: OrderLogEntry[] = [];
    for (const [orderId, lineIds] of byOrder) {
      const order = locked.get(orderId)!;
      const total = order.orderLines.length;
      const changed = order.orderLines
        .map((l, idx) => ({ ...l, idx }))
        .filter((l) => lineIds.has(l.id) && l.productionStatus !== status);
      if (changed.length > 0) {
        await tx.orderLine.updateMany({
          where: { orderId, id: { in: changed.map((l) => l.id) } },
          data: { productionStatus: status, productionStatusAt: at },
        });
        for (const l of changed) {
          logs.push({
            orderId,
            userId,
            action: "line_status_changed",
            field: "productionStatus",
            oldValue: l.productionStatus,
            newValue: status,
            metadata: {
              orderLineId: l.id,
              lineCode: formatOrderLineItemRef(order.orderNumber, l.idx + 1, total),
            },
          });
        }
      }
      // A set's box line (never on the board) follows its set.
      const nextLines = (
        await followGiftSetBoxLines(
          tx,
          orderId,
          order.orderLines.map((l) => ({
            id: l.id,
            productType: l.productType,
            setGroupId: l.setGroupId,
            productionStatus: lineIds.has(l.id) ? status : l.productionStatus,
          })),
          at,
        )
      ).map((l) => ({ id: l.id, productionStatus: l.productionStatus }));
      const newOrderStatus = await applyDerivedStatus(tx, order, nextLines, userId, logs);
      results.push({
        orderId,
        orderNumber: order.orderNumber,
        changedLineIds: changed.map((l) => l.id),
        oldOrderStatus: order.status,
        newOrderStatus,
        lines: nextLines,
      });
    }
    if (logs.length > 0) await tx.orderLog.createMany({ data: logs });
    return results;
  });
}

/**
 * After the lines of a workshop-phase order changed in some other way (admin
 * edit added or removed lines), re-derive the order status inside the caller's
 * transaction. Returns the order status after the call.
 */
export async function rederiveOrderStatusInTx(tx: Tx, orderId: string, userId: string): Promise<string> {
  const order = (await lockOrders(tx, [orderId])).get(orderId);
  if (!order) return "";
  const logs: OrderLogEntry[] = [];
  // A set's box line follows its set (an edit may add it to an order already printing).
  const lines = isWorkshopPhaseStatus(order.status)
    ? await followGiftSetBoxLines(tx, orderId, order.orderLines, new Date())
    : order.orderLines;
  const next = await applyDerivedStatus(tx, order, lines, userId, logs);
  if (logs.length > 0) await tx.orderLog.createMany({ data: logs });
  return next;
}

/**
 * An order-level status write refused because these lines wait for a layout
 * (`planOrderStatusWrite`); the API answers 409 `{ error: "lines_need_layout", lines }`.
 */
export class LinesNeedLayoutError extends Error {
  constructor(readonly lineCodes: string[]) {
    super("lines_need_layout");
    this.name = "LinesNeedLayoutError";
  }
}

export interface PreparedOrderStatusWrite {
  order: LockedOrder;
  /** The status to store (derived in the workshop phase; may differ from the requested one). */
  status: string;
  /** Codes (`#9751.1/4`) of the NEEDS_LAYOUT lines the write leaves as they are. */
  keptLineCodes: string[];
}

/**
 * Lock the order and plan an order-level status write against its current
 * lines, inside the caller's transaction (the write itself must follow in the
 * same transaction, with `orderLinesStatusSyncWrite(status)`). Throws
 * {@link LinesNeedLayoutError} when refused. Null when the order is gone.
 */
export async function prepareOrderStatusWriteInTx(
  tx: Tx,
  orderId: string,
  requestedStatus: string,
): Promise<PreparedOrderStatusWrite | null> {
  const order = (await lockOrders(tx, [orderId])).get(orderId);
  if (!order) return null;
  const plan = planOrderStatusWrite(requestedStatus, order.orderLines);
  const total = order.orderLines.length;
  const codeOf = (lineId: string) =>
    formatOrderLineItemRef(order.orderNumber, order.orderLines.findIndex((l) => l.id === lineId) + 1, total);
  if (!plan.ok) throw new LinesNeedLayoutError(plan.needsLayoutLineIds.map(codeOf));
  return { order, status: plan.status, keptLineCodes: plan.keptLineIds.map(codeOf) };
}
