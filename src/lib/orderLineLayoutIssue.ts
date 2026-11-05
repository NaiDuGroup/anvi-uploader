import type { Prisma, PrismaClient } from "@prisma/client";
import { formatOrderLineItemRef } from "@/app/admin/_lib/orderLines";
import type { OrderLogEntry } from "@/lib/orderLog";
import { isWorkshopPhaseStatus } from "@/lib/orderStatusFromLines";
import { applyDerivedStatus, lockOrders } from "@/lib/orderLineStatusUpdate";
import {
  canFlagLayoutIssue,
  CLEARED_LAYOUT_ISSUE_FIELDS,
  LAYOUT_ISSUE_ARCHIVE_REASON,
  normalizeLayoutIssueNote,
  type LayoutIssueReason,
} from "@/lib/layoutIssue";
import { isOrderUploadKey } from "@/lib/validations";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import { findArtworkLargerThanOrdered } from "@/lib/files/serverArtworkCheck";

/**
 * Server side of «Нужен макет» on an order line (step 3, `src/lib/layoutIssue.ts`):
 *
 * - {@link flagLineLayoutIssue}: staff, workshop phase, line WAITING / PRINTING
 *   → NEEDS_LAYOUT with reason + comment;
 * - {@link clearLineLayoutIssue}: staff «Снять отметку» → WAITING;
 * - {@link ownerReplaceLayoutFile}: the order's owner (cabinet) replaces the
 *   file of a NEEDS_LAYOUT line → WAITING + `layoutFixedAt`. Works while other
 *   lines print; touches no price, quantity or stock;
 * - {@link markLayoutFixedLinesInTx}: the same return for a staff replacement
 *   through the admin edit (`syncAdminOrderStructureInTx`).
 *
 * Every write locks the order row first (`SELECT … FOR UPDATE`), re-reads the
 * line under the lock and re-derives the order status in the same
 * transaction. Log entries carry the line code (`#9751.1/4`).
 */

export type LayoutIssueErrorCode =
  /** No such order (also: trashed, or — for the cabinet — another client's). */
  | "order_not_found"
  /** The line is not in the order (cabinet: answered as `order_not_found`). */
  | "line_not_in_order"
  /** The order is outside the workshop phase (flag only). */
  | "wrong_phase"
  /** Flag: the line is already flagged or already printed. */
  | "line_not_flaggable"
  /** Clear / replace: the line is not (any more) waiting for a layout. */
  | "line_not_flagged"
  /** Replace: a file reference that is not an upload of ours. */
  | "invalid_file"
  /** Replace: large-format artwork prints bigger than the ordered size. */
  | "artwork_larger_than_ordered";

const HTTP_STATUS: Record<LayoutIssueErrorCode, number> = {
  order_not_found: 404,
  line_not_in_order: 404,
  wrong_phase: 409,
  line_not_flaggable: 409,
  line_not_flagged: 409,
  invalid_file: 400,
  artwork_larger_than_ordered: 422,
};

export class LayoutIssueError extends Error {
  readonly httpStatus: number;
  constructor(
    readonly code: LayoutIssueErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "LayoutIssueError";
    this.httpStatus = HTTP_STATUS[code];
  }
}

type Tx = Prisma.TransactionClient;
type Db = Pick<PrismaClient, "$transaction">;

/** Test seams for race tests: run inside the write transaction around the row lock. */
export interface LayoutIssueHooks {
  beforeLock?: () => Promise<void>;
  afterLock?: () => Promise<void>;
}

export interface LayoutIssueResult {
  orderId: string;
  orderNumber: number;
  lineId: string;
  lineCode: string;
  lineStatus: string;
  oldOrderStatus: string;
  newOrderStatus: string;
}

function lineCodeOf(orderNumber: number, lines: readonly { id: string }[], lineId: string): string {
  const idx = lines.findIndex((l) => l.id === lineId);
  return formatOrderLineItemRef(orderNumber, idx + 1, lines.length);
}

/** Lock + load one order for a staff action; validates order and line. */
async function lockOrderLine(tx: Tx, orderId: string, lineId: string) {
  const order = (await lockOrders(tx, [orderId])).get(orderId);
  if (!order || order.deletedAt) throw new LayoutIssueError("order_not_found");
  const line = order.orderLines.find((l) => l.id === lineId);
  if (!line) throw new LayoutIssueError("line_not_in_order");
  return { order, line };
}

/**
 * Staff: flag one line «Нужен макет». The order must be in the workshop phase
 * and the line WAITING or PRINTING.
 */
export async function flagLineLayoutIssue(
  db: Db,
  params: {
    orderId: string;
    lineId: string;
    reason: LayoutIssueReason;
    note?: string | null;
    userId: string;
    at?: Date;
    hooks?: LayoutIssueHooks;
  },
): Promise<LayoutIssueResult> {
  const at = params.at ?? new Date();
  const note = normalizeLayoutIssueNote(params.note);
  return db.$transaction(async (tx) => {
    await params.hooks?.beforeLock?.();
    const { order, line } = await lockOrderLine(tx, params.orderId, params.lineId);
    await params.hooks?.afterLock?.();
    if (!isWorkshopPhaseStatus(order.status)) throw new LayoutIssueError("wrong_phase");
    if (!canFlagLayoutIssue(order.status, line.productionStatus)) {
      throw new LayoutIssueError("line_not_flaggable");
    }
    await tx.orderLine.update({
      where: { id: line.id },
      data: {
        productionStatus: "NEEDS_LAYOUT",
        productionStatusAt: at,
        layoutIssueReason: params.reason,
        layoutIssueNote: note,
        layoutIssueAt: at,
        layoutIssueById: params.userId,
        layoutFixedAt: null,
        layoutFixedById: null,
      },
    });
    const lineCode = lineCodeOf(order.orderNumber, order.orderLines, line.id);
    const logs: OrderLogEntry[] = [
      {
        orderId: order.id,
        userId: params.userId,
        action: "line_status_changed",
        field: "productionStatus",
        oldValue: line.productionStatus,
        newValue: "NEEDS_LAYOUT",
        metadata: { orderLineId: line.id, lineCode },
      },
      {
        orderId: order.id,
        userId: params.userId,
        action: "line_layout_flagged",
        field: "layoutIssueReason",
        oldValue: null,
        newValue: params.reason,
        metadata: { orderLineId: line.id, lineCode, reason: params.reason, note },
      },
    ];
    const nextLines = order.orderLines.map((l) =>
      l.id === line.id ? { productionStatus: "NEEDS_LAYOUT" } : { productionStatus: l.productionStatus },
    );
    const newOrderStatus = await applyDerivedStatus(tx, order, nextLines, params.userId, logs);
    await tx.orderLog.createMany({ data: logs });
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      lineId: line.id,
      lineCode,
      lineStatus: "NEEDS_LAYOUT",
      oldOrderStatus: order.status,
      newOrderStatus,
    };
  });
}

/** Staff «Снять отметку»: the flagged line goes back to WAITING without a new file. */
export async function clearLineLayoutIssue(
  db: Db,
  params: { orderId: string; lineId: string; userId: string; at?: Date; hooks?: LayoutIssueHooks },
): Promise<LayoutIssueResult> {
  const at = params.at ?? new Date();
  return db.$transaction(async (tx) => {
    await params.hooks?.beforeLock?.();
    const { order, line } = await lockOrderLine(tx, params.orderId, params.lineId);
    await params.hooks?.afterLock?.();
    if (line.productionStatus !== "NEEDS_LAYOUT") throw new LayoutIssueError("line_not_flagged");
    const before = await tx.orderLine.findUniqueOrThrow({
      where: { id: line.id },
      select: { layoutIssueReason: true, layoutIssueNote: true, layoutIssueAt: true },
    });
    await tx.orderLine.update({
      where: { id: line.id },
      data: { productionStatus: "WAITING", productionStatusAt: at, ...CLEARED_LAYOUT_ISSUE_FIELDS },
    });
    const lineCode = lineCodeOf(order.orderNumber, order.orderLines, line.id);
    const logs: OrderLogEntry[] = [
      {
        orderId: order.id,
        userId: params.userId,
        action: "line_status_changed",
        field: "productionStatus",
        oldValue: "NEEDS_LAYOUT",
        newValue: "WAITING",
        metadata: { orderLineId: line.id, lineCode },
      },
      {
        orderId: order.id,
        userId: params.userId,
        action: "line_layout_cleared",
        field: "layoutIssueReason",
        oldValue: before.layoutIssueReason,
        newValue: null,
        metadata: {
          orderLineId: line.id,
          lineCode,
          reason: before.layoutIssueReason,
          note: before.layoutIssueNote,
          flaggedAt: before.layoutIssueAt?.toISOString() ?? null,
        },
      },
    ];
    const nextLines = order.orderLines.map((l) =>
      l.id === line.id ? { productionStatus: "WAITING" } : { productionStatus: l.productionStatus },
    );
    const newOrderStatus = await applyDerivedStatus(tx, order, nextLines, params.userId, logs);
    await tx.orderLog.createMany({ data: logs });
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      lineId: line.id,
      lineCode,
      lineStatus: "WAITING",
      oldOrderStatus: order.status,
      newOrderStatus,
    };
  });
}

export interface ReplacementFileInput {
  fileName: string;
  fileUrl: string;
}

export interface OwnerActor {
  /** `User.id` of the portal account. */
  userId: string;
  /** The owner's `StudioCustomer.id`: only orders with this `clientId` are theirs. */
  studioCustomerId: string;
}

export interface LayoutReplaceResult extends LayoutIssueResult {
  archivedFiles: { id: string; fileName: string }[];
  files: { id: string; fileName: string }[];
  layoutFixedAt: string;
}

interface OwnerLockRow {
  id: string;
  client_id: string | null;
  deleted_at: Date | null;
}

/**
 * The order's owner (dealer or retail client, cabinet) replaces the file(s) of
 * one NEEDS_LAYOUT line. Only that line changes: its files are archived
 * (`OrderFileArchive`, reason `layout_issue`) and replaced, it returns to
 * WAITING with `layoutFixedAt`, and the order status is re-derived. Other
 * lines may print or be done; no price, quantity or stock is touched, and
 * edit / cancel of the order stay as they were.
 *
 * Another client's order, a trashed or cancelled one and a foreign line all
 * answer `order_not_found` (the same 404 as a missing order).
 */
export async function ownerReplaceLayoutFile(
  db: Pick<PrismaClient, "$transaction" | "orderLine">,
  params: {
    orderId: string;
    lineId: string;
    actor: OwnerActor;
    files: readonly ReplacementFileInput[];
    at?: Date;
    hooks?: LayoutIssueHooks;
  },
): Promise<LayoutReplaceResult> {
  const { orderId, lineId, actor } = params;
  if (params.files.length === 0) throw new LayoutIssueError("invalid_file");
  for (const f of params.files) {
    if (!isOrderUploadKey(f.fileUrl)) throw new LayoutIssueError("invalid_file");
  }

  // Large-format size guard (reads file headers from storage): outside the
  // transaction, on the line as it is now; the line itself is re-checked under the lock.
  const pre = await db.orderLine.findFirst({
    where: { id: lineId, orderId, order: { clientId: actor.studioCustomerId, deletedAt: null } },
    select: { productType: true, largeFormatLineData: true },
  });
  if (!pre) throw new LayoutIssueError("order_not_found");
  if (pre.productType === "large_format_print") {
    const lf = parseLargeFormatLineData(pre.largeFormatLineData);
    if (lf) {
      const tooLarge = await findArtworkLargerThanOrdered([
        {
          productType: pre.productType,
          printWidthCm: lf.printWidthCm,
          printHeightCm: lf.printHeightCm,
          files: params.files,
        },
      ]);
      if (tooLarge) throw new LayoutIssueError("artwork_larger_than_ordered", tooLarge);
    }
  }

  const at = params.at ?? new Date();
  return db.$transaction(async (tx) => {
    await params.hooks?.beforeLock?.();
    const rows = await tx.$queryRaw<OwnerLockRow[]>`
      SELECT id, client_id, deleted_at FROM orders WHERE id = ${orderId} FOR UPDATE
    `;
    const row = rows[0];
    if (!row || row.client_id !== actor.studioCustomerId || row.deleted_at) {
      throw new LayoutIssueError("order_not_found");
    }
    await params.hooks?.afterLock?.();
    const order = (await lockOrders(tx, [orderId])).get(orderId)!;
    const line = order.orderLines.find((l) => l.id === lineId);
    if (!line) throw new LayoutIssueError("order_not_found");
    if (line.productionStatus !== "NEEDS_LAYOUT") throw new LayoutIssueError("line_not_flagged");

    const result = await replaceFlaggedLineFilesInTx(tx, {
      order,
      lineId,
      files: params.files,
      userId: actor.userId,
      by: "client",
      at,
    });
    return result;
  });
}

/**
 * Archive + replace the files of one flagged line and return it to WAITING
 * (shared by the cabinet replace; the order row is already locked).
 */
async function replaceFlaggedLineFilesInTx(
  tx: Tx,
  params: {
    order: { id: string; orderNumber: number; status: string; orderLines: { id: string; productionStatus: string }[] };
    lineId: string;
    files: readonly ReplacementFileInput[];
    userId: string;
    by: "client" | "staff";
    at: Date;
  },
): Promise<LayoutReplaceResult> {
  const { order, lineId, userId, at } = params;
  const line = await tx.orderLine.findUniqueOrThrow({
    where: { id: lineId },
    select: {
      productType: true,
      layoutIssueReason: true,
      layoutIssueNote: true,
      layoutIssueAt: true,
      files: { orderBy: { fileName: "asc" } },
    },
  });

  const archivedFiles: { id: string; fileName: string }[] = [];
  for (const f of line.files) {
    archivedFiles.push(
      await tx.orderFileArchive.create({
        data: {
          orderId: order.id,
          orderLineId: lineId,
          lineProductType: line.productType,
          fileName: f.fileName,
          fileUrl: f.fileUrl,
          copies: f.copies,
          color: f.color,
          paperType: f.paperType,
          pageCount: f.pageCount,
          reason: LAYOUT_ISSUE_ARCHIVE_REASON,
          archivedById: userId,
        },
        select: { id: true, fileName: true },
      }),
    );
  }
  await tx.file.deleteMany({ where: { orderLineId: lineId } });

  // Copies / colour / paper / pages come from the replaced file at the same
  // position (else the first one): the order, its price and stock stay as they are.
  const template = line.files[0];
  const created: { id: string; fileName: string }[] = [];
  for (let i = 0; i < params.files.length; i++) {
    const src = line.files[i] ?? template;
    const nf = params.files[i]!;
    created.push(
      await tx.file.create({
        data: {
          orderId: order.id,
          orderLineId: lineId,
          fileName: nf.fileName,
          fileUrl: nf.fileUrl,
          copies: src?.copies ?? 1,
          color: src?.color ?? "color",
          paperType: src?.paperType ?? null,
          pageCount: src?.pageCount ?? null,
        },
        select: { id: true, fileName: true },
      }),
    );
  }

  await tx.orderLine.update({
    where: { id: lineId },
    data: {
      productionStatus: "WAITING",
      productionStatusAt: at,
      ...CLEARED_LAYOUT_ISSUE_FIELDS,
      layoutFixedAt: at,
      layoutFixedById: userId,
    },
  });

  const lineCode = lineCodeOf(order.orderNumber, order.orderLines, lineId);
  const logs: OrderLogEntry[] = [
    {
      orderId: order.id,
      userId,
      action: "line_status_changed",
      field: "productionStatus",
      oldValue: "NEEDS_LAYOUT",
      newValue: "WAITING",
      metadata: { orderLineId: lineId, lineCode },
    },
    {
      orderId: order.id,
      userId,
      action: "line_layout_fixed",
      field: "files",
      oldValue: archivedFiles.map((f) => f.fileName).join(", ") || null,
      newValue: created.map((f) => f.fileName).join(", "),
      metadata: {
        orderLineId: lineId,
        lineCode,
        by: params.by,
        reason: line.layoutIssueReason,
        note: line.layoutIssueNote,
        flaggedAt: line.layoutIssueAt?.toISOString() ?? null,
        archivedFiles,
        files: created,
      },
    },
  ];
  const nextLines = order.orderLines.map((l) =>
    l.id === lineId ? { productionStatus: "WAITING" } : { productionStatus: l.productionStatus },
  );
  // NEEDS_LAYOUT and WAITING derive the same order status, so this never
  // changes it today; kept so the rule lives in one place.
  const newOrderStatus = await applyDerivedStatus(tx, order, nextLines, userId, logs);
  await tx.orderLog.createMany({ data: logs });
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    lineId,
    lineCode,
    lineStatus: "WAITING",
    oldOrderStatus: order.status,
    newOrderStatus,
    archivedFiles,
    files: created,
    layoutFixedAt: at.toISOString(),
  };
}

/**
 * Staff replacement through the admin edit (`syncAdminOrderStructureInTx`):
 * the given flagged lines got a different file set, so they return to WAITING
 * with `layoutFixedAt` (by the staff user). Their dropped files must already
 * be archived by the caller (`archivedFiles`). Runs before the caller's
 * re-derive of the order status.
 */
export async function markLayoutFixedLinesInTx(
  tx: Tx,
  params: {
    order: { id: string; orderNumber: number; orderLines: { id: string; productionStatus: string }[] };
    lineIds: readonly string[];
    userId: string;
    archivedFiles: readonly { id: string; fileName: string; orderLineId: string }[];
    at?: Date;
    /** Who replaced the file: staff (admin edit, default) or the client (dealer cabinet edit). */
    by?: "client" | "staff";
  },
): Promise<void> {
  if (params.lineIds.length === 0) return;
  const at = params.at ?? new Date();
  const { order, userId } = params;
  const logs: OrderLogEntry[] = [];
  for (const lineId of params.lineIds) {
    const line = await tx.orderLine.findUnique({
      where: { id: lineId },
      select: {
        productionStatus: true,
        layoutIssueReason: true,
        layoutIssueNote: true,
        layoutIssueAt: true,
        files: { select: { id: true, fileName: true } },
      },
    });
    if (!line || line.productionStatus !== "NEEDS_LAYOUT") continue;
    await tx.orderLine.update({
      where: { id: lineId },
      data: {
        productionStatus: "WAITING",
        productionStatusAt: at,
        ...CLEARED_LAYOUT_ISSUE_FIELDS,
        layoutFixedAt: at,
        layoutFixedById: userId,
      },
    });
    const lineCode = lineCodeOf(order.orderNumber, order.orderLines, lineId);
    const archived = params.archivedFiles.filter((f) => f.orderLineId === lineId).map(({ id, fileName }) => ({ id, fileName }));
    logs.push(
      {
        orderId: order.id,
        userId,
        action: "line_status_changed",
        field: "productionStatus",
        oldValue: "NEEDS_LAYOUT",
        newValue: "WAITING",
        metadata: { orderLineId: lineId, lineCode },
      },
      {
        orderId: order.id,
        userId,
        action: "line_layout_fixed",
        field: "files",
        oldValue: archived.map((f) => f.fileName).join(", ") || null,
        newValue: line.files.map((f) => f.fileName).join(", "),
        metadata: {
          orderLineId: lineId,
          lineCode,
          by: params.by ?? "staff",
          reason: line.layoutIssueReason,
          note: line.layoutIssueNote,
          flaggedAt: line.layoutIssueAt?.toISOString() ?? null,
          archivedFiles: archived,
          files: line.files,
        },
      },
    );
  }
  if (logs.length > 0) await tx.orderLog.createMany({ data: logs });
}
