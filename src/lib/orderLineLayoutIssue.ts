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
import { isHttpLink, isOrderUploadKey } from "@/lib/validations";
import { layoutLinkAllowed } from "@/lib/layoutIssue";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import { findArtworkLargerThanOrdered } from "@/lib/files/serverArtworkCheck";
import { OWNER_REPLACE_ARCHIVE_REASON, ownerLineFileBlockReason } from "@/lib/ownerLineFileReplace";

/**
 * Server side of «Нужен макет» on an order line (step 3, `src/lib/layoutIssue.ts`):
 *
 * - {@link flagLineLayoutIssue}: staff, workshop phase, line WAITING / PRINTING
 *   → NEEDS_LAYOUT with reason + comment;
 * - {@link clearLineLayoutIssue}: staff «Снять отметку» → WAITING;
 * - {@link ownerReplaceLayoutFile}: the order's owner (cabinet) replaces ONE
 *   file of a NEEDS_LAYOUT line → WAITING + `layoutFixedAt`. Works while other
 *   lines print; touches no price, quantity or stock;
 * - {@link staffReplaceLayoutFile}: staff «Заменить файл» on a NEEDS_LAYOUT
 *   line (admin list / ЦЕХ): the same replace as the owner's, plus links;
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
  | "artwork_larger_than_ordered"
  /** Owner replace (step 4): the line already prints or is printed. */
  | "line_started"
  /** Owner replace (step 4): the order is past the point where the cabinet may touch it (made, shop order). */
  | "order_locked"
  /**
   * Replace: no `fileId` and the line has several files — the caller must say
   * which one is replaced (a replace swaps exactly one file).
   */
  | "file_id_required"
  /**
   * Replace: `fileId` is not a file of this line (another line / order, or the
   * file was already replaced meanwhile — a replaced file gets a new id).
   */
  | "file_not_in_line";

const HTTP_STATUS: Record<LayoutIssueErrorCode, number> = {
  order_not_found: 404,
  line_not_in_order: 404,
  wrong_phase: 409,
  line_not_flaggable: 409,
  line_not_flagged: 409,
  invalid_file: 400,
  artwork_larger_than_ordered: 422,
  line_started: 409,
  order_locked: 409,
  file_id_required: 400,
  file_not_in_line: 404,
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

/** The one file a replace swapped: the old row (archived, deleted) and the new row in its place. */
export interface ReplacedFileInfo {
  /** Old `File.id` (gone after the replace), null when the line had no file. */
  oldFileId: string | null;
  oldFileName: string | null;
  newFileId: string;
  newFileName: string;
}

export interface LayoutReplaceResult extends LayoutIssueResult {
  /** The archived old file (0 or 1 entry). */
  archivedFiles: { id: string; fileName: string }[];
  /** The new file (1 entry). */
  files: { id: string; fileName: string }[];
  replaced: ReplacedFileInfo;
  layoutFixedAt: string;
}

interface OwnerLockRow {
  id: string;
  client_id: string | null;
  deleted_at: Date | null;
}

/**
 * A replace swaps exactly one file: one new artwork per call (the dialogs
 * upload one). Several new files would change what gets printed while the
 * price and stock stay.
 */
function singleReplacement(files: readonly ReplacementFileInput[]): ReplacementFileInput {
  if (files.length !== 1) throw new LayoutIssueError("invalid_file", files.length === 0 ? undefined : "single_file");
  return files[0]!;
}

/**
 * The order's owner (dealer or retail client, cabinet) replaces ONE file of a
 * NEEDS_LAYOUT line (`fileId`; may be omitted when the line has exactly one
 * file). Only that file changes: it is archived (`OrderFileArchive`, reason
 * `layout_issue`) and a new row with the same copies / colour / paper / pages
 * takes its place; the line's other files stay as they are. The line returns
 * to WAITING with `layoutFixedAt` — on a multi-file line one replaced file is
 * enough (the workshop sees which file changed in the history) — and the order
 * status is re-derived. Other lines may print or be done; no price, quantity
 * or stock is touched, and edit / cancel of the order stay as they were.
 *
 * Another client's order, a trashed or cancelled one and a foreign line all
 * answer `order_not_found` (the same 404 as a missing order); a file that is
 * not on the line → 404 `file_not_in_line`.
 */
export async function ownerReplaceLayoutFile(
  db: Pick<PrismaClient, "$transaction" | "orderLine">,
  params: {
    orderId: string;
    lineId: string;
    actor: OwnerActor;
    /** The `File.id` being replaced (optional only on a one-file line). */
    fileId?: string | null;
    files: readonly ReplacementFileInput[];
    at?: Date;
    hooks?: LayoutIssueHooks;
  },
): Promise<LayoutReplaceResult> {
  const { orderId, lineId, actor } = params;
  const file = singleReplacement(params.files);
  if (!isOrderUploadKey(file.fileUrl)) throw new LayoutIssueError("invalid_file");

  // Large-format size guard (reads file headers from storage): outside the
  // transaction, on the line as it is now; the line itself is re-checked under the lock.
  const pre = await db.orderLine.findFirst({
    where: { id: lineId, orderId, order: { clientId: actor.studioCustomerId, deletedAt: null } },
    select: { productType: true, largeFormatLineData: true },
  });
  if (!pre) throw new LayoutIssueError("order_not_found");
  await assertArtworkFits(pre, [file]);

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

    return replaceFlaggedLineFileInTx(tx, {
      order,
      lineId,
      fileId: params.fileId ?? null,
      file,
      userId: actor.userId,
      by: "client",
      at,
    });
  });
}

/**
 * A flagged line got a new file (owner layout fix or staff replace): the
 * «Файл заменён дилером / клиентом» marker of an earlier step-4 replacement
 * would point at a file that is no longer there.
 */
const CLEARED_OWNER_REPLACED_FIELDS = {
  ownerReplacedAt: null,
  ownerReplacedById: null,
  ownerReplacedRole: null,
} as const;

interface OwnerReplaceLockRow {
  id: string;
  client_id: string | null;
  deleted_at: Date | null;
  cancelled_at: Date | null;
  source: string | null;
  status: string;
}

export interface OwnerLineReplaceResult {
  orderId: string;
  lineId: string;
  lineCode: string;
  /** `layout_fix`: the line was «Нужен макет» and returned to WAITING; `replace`: a WAITING line, still WAITING. */
  kind: "layout_fix" | "replace";
  lineStatus: string;
  oldOrderStatus: string;
  newOrderStatus: string;
  archivedFiles: { id: string; fileName: string }[];
  files: { id: string; fileName: string }[];
  replaced: ReplacedFileInfo;
  /** Set for `replace` (`OrderLine.ownerReplacedAt`). */
  replacedAt: string | null;
  /** Set for `layout_fix` (`OrderLine.layoutFixedAt`). */
  layoutFixedAt: string | null;
}

/**
 * Step 4 (part 1): the order's owner (dealer or retail client, cabinet)
 * replaces ONE file (`fileId`) of a line that has not started yet, while other
 * lines may print or be done ({@link ownerLineFileBlockReason}). Any file of
 * the line, whatever the number of files: the new file takes the old one's
 * copies / colour / paper / pages, so the printed quantity stays.
 *
 * - a WAITING line: the old file archived (`OrderFileArchive`, reason
 *   `owner_replace`), the new one in its place; the line stays WAITING, gets
 *   `ownerReplacedAt` / `ById` / `Role` for the workshop; a dealer's order also
 *   gets `Order.dealerEditedAt` («Изменён дилером»); logged
 *   `line_file_replaced` with `by: "owner"` and the file names. No price,
 *   quantity, stock or status change. Paid orders are allowed: money does not move;
 * - a NEEDS_LAYOUT line: the step-3 fix (`layout_issue` archive, back to
 *   WAITING with `layoutFixedAt`, `line_layout_fixed`);
 * - a PRINTING / DONE line → 409 `line_started`; a made or shop order → 409
 *   `order_locked`; another client's, trashed or cancelled order → 404;
 *   `fileId` not on the line → 404 `file_not_in_line`; no `fileId` on a line
 *   with several files → 400 `file_id_required`.
 *
 * The order row is locked and the line re-read under the lock, so a line the
 * workshop starts while the owner's dialog is open fails with 409 and nothing
 * changes. Only upload keys (no links), like the cabinet dialog.
 */
export async function ownerReplaceLineFile(
  db: Pick<PrismaClient, "$transaction" | "orderLine">,
  params: {
    orderId: string;
    lineId: string;
    actor: OwnerActor;
    /** The `File.id` being replaced (optional only on a one-file line). */
    fileId?: string | null;
    files: readonly ReplacementFileInput[];
    at?: Date;
    hooks?: LayoutIssueHooks;
  },
): Promise<OwnerLineReplaceResult> {
  const { orderId, lineId, actor } = params;
  const file = singleReplacement(params.files);
  if (!isOrderUploadKey(file.fileUrl)) throw new LayoutIssueError("invalid_file");

  // Large-format size guard: outside the transaction (reads storage); the line is re-checked under the lock.
  const pre = await db.orderLine.findFirst({
    where: { id: lineId, orderId, order: { clientId: actor.studioCustomerId, deletedAt: null, cancelledAt: null } },
    select: { productType: true, largeFormatLineData: true },
  });
  if (!pre) throw new LayoutIssueError("order_not_found");
  await assertArtworkFits(pre, [file]);

  const at = params.at ?? new Date();
  return db.$transaction(async (tx) => {
    await params.hooks?.beforeLock?.();
    const rows = await tx.$queryRaw<OwnerReplaceLockRow[]>`
      SELECT id, client_id, deleted_at, cancelled_at, source, status FROM orders WHERE id = ${orderId} FOR UPDATE
    `;
    const row = rows[0];
    if (!row || row.client_id !== actor.studioCustomerId || row.deleted_at || row.cancelled_at) {
      throw new LayoutIssueError("order_not_found");
    }
    await params.hooks?.afterLock?.();
    const order = (await lockOrders(tx, [orderId])).get(orderId)!;
    const line = order.orderLines.find((l) => l.id === lineId);
    if (!line) throw new LayoutIssueError("order_not_found");

    // Re-checked under the lock: the workshop may have started the line meanwhile.
    const block = ownerLineFileBlockReason(
      { status: order.status, deletedAt: row.deleted_at, cancelledAt: row.cancelled_at, source: row.source },
      line,
    );
    if (block === "line_started") throw new LayoutIssueError("line_started", line.productionStatus);
    if (block === "deleted" || block === "cancelled") throw new LayoutIssueError("order_not_found");
    if (block) throw new LayoutIssueError("order_locked", block);

    if (line.productionStatus === "NEEDS_LAYOUT") {
      const fixed = await replaceFlaggedLineFileInTx(tx, {
        order,
        lineId,
        fileId: params.fileId ?? null,
        file,
        userId: actor.userId,
        by: "client",
        at,
      });
      return {
        orderId: fixed.orderId,
        lineId,
        lineCode: fixed.lineCode,
        kind: "layout_fix" as const,
        lineStatus: fixed.lineStatus,
        oldOrderStatus: fixed.oldOrderStatus,
        newOrderStatus: fixed.newOrderStatus,
        archivedFiles: fixed.archivedFiles,
        files: fixed.files,
        replaced: fixed.replaced,
        replacedAt: null,
        layoutFixedAt: fixed.layoutFixedAt,
      };
    }

    const customer = await tx.studioCustomer.findUnique({
      where: { id: actor.studioCustomerId },
      select: { isDealer: true },
    });
    const role = customer?.isDealer ? "dealer" : "client";
    const swap = await swapOneLineFileInTx(tx, {
      orderId: order.id,
      lineId,
      fileId: params.fileId ?? null,
      file,
      userId: actor.userId,
      reason: OWNER_REPLACE_ARCHIVE_REASON,
      addWhenEmpty: false,
    });
    await tx.orderLine.update({
      where: { id: lineId },
      data: { ownerReplacedAt: at, ownerReplacedById: actor.userId, ownerReplacedRole: role },
    });
    // «Изменён дилером» on the staff list / board: dealers only (the badge says «дилером»);
    // a retail client's replacement shows on the line («Файл заменён клиентом»).
    if (role === "dealer") {
      await tx.order.update({ where: { id: order.id }, data: { dealerEditedAt: at } });
    }
    const lineCode = lineCodeOf(order.orderNumber, order.orderLines, lineId);
    await tx.orderLog.create({
      data: {
        orderId: order.id,
        userId: actor.userId,
        action: "line_file_replaced",
        field: "files",
        oldValue: swap.replaced.oldFileName,
        newValue: swap.replaced.newFileName,
        metadata: {
          orderLineId: lineId,
          lineCode,
          by: "owner",
          role,
          lineStatus: line.productionStatus,
          ...replacedFileMetadata(swap.replaced),
          archivedFiles: swap.archivedFiles,
          files: [swap.created],
        },
      },
    });
    return {
      orderId: order.id,
      lineId,
      lineCode,
      kind: "replace" as const,
      lineStatus: line.productionStatus,
      oldOrderStatus: order.status,
      newOrderStatus: order.status,
      archivedFiles: swap.archivedFiles,
      files: [swap.created],
      replaced: swap.replaced,
      replacedAt: at.toISOString(),
      layoutFixedAt: null,
    };
  });
}

/** Log metadata naming the swapped file (`HistoryPanel` shows «файл A заменён на B»). */
function replacedFileMetadata(r: ReplacedFileInfo) {
  return {
    replacedFileId: r.oldFileId,
    replacedFileName: r.oldFileName,
    newFileId: r.newFileId,
    newFileName: r.newFileName,
  };
}

/** Large-format size guard (reads file headers from storage, outside any transaction). */
async function assertArtworkFits(
  line: { productType: string; largeFormatLineData: unknown },
  files: readonly ReplacementFileInput[],
): Promise<void> {
  if (line.productType !== "large_format_print") return;
  const lf = parseLargeFormatLineData(line.largeFormatLineData);
  if (!lf) return;
  const tooLarge = await findArtworkLargerThanOrdered([
    { productType: line.productType, printWidthCm: lf.printWidthCm, printHeightCm: lf.printHeightCm, files },
  ]);
  if (tooLarge) throw new LayoutIssueError("artwork_larger_than_ordered", tooLarge);
}

/**
 * Staff «Заменить файл» on one NEEDS_LAYOUT line (studio orders list, ЦЕХ
 * sidebar, workshop board): replaces ONE file (`fileId`, optional only on a
 * one-file line). Same effect as the owner's replace: the old file archived
 * (`layout_issue`), the new one in its place with the same copies / colour /
 * paper / pages, the other files untouched, the line back to WAITING with
 * `layoutFixedAt` / `layoutFixedById`, order status re-derived, logged
 * `line_layout_fixed` with `by: "staff"`. A file may be an upload key or —
 * like the new-order wizard's «или вставьте ссылку» — an http(s) link, except
 * on products whose production reads the artwork ({@link layoutLinkAllowed}).
 */
export async function staffReplaceLayoutFile(
  db: Pick<PrismaClient, "$transaction" | "orderLine">,
  params: {
    orderId: string;
    lineId: string;
    userId: string;
    /** The `File.id` being replaced (optional only on a one-file line). */
    fileId?: string | null;
    files: readonly ReplacementFileInput[];
    at?: Date;
    hooks?: LayoutIssueHooks;
  },
): Promise<LayoutReplaceResult> {
  const { orderId, lineId } = params;
  const file = singleReplacement(params.files);
  const pre = await db.orderLine.findFirst({
    where: { id: lineId, orderId, order: { deletedAt: null } },
    select: { productType: true, largeFormatLineData: true },
  });
  if (!pre) {
    const exists = await db.orderLine.findFirst({ where: { orderId }, select: { id: true } });
    throw new LayoutIssueError(exists ? "line_not_in_order" : "order_not_found");
  }
  const link = isHttpLink(file.fileUrl);
  if (!isOrderUploadKey(file.fileUrl) && !link) throw new LayoutIssueError("invalid_file");
  if (link && !layoutLinkAllowed(pre.productType)) throw new LayoutIssueError("invalid_file", "link_not_allowed");
  await assertArtworkFits(pre, [file]);

  const at = params.at ?? new Date();
  return db.$transaction(async (tx) => {
    await params.hooks?.beforeLock?.();
    const { order, line } = await lockOrderLine(tx, orderId, lineId);
    await params.hooks?.afterLock?.();
    if (line.productionStatus !== "NEEDS_LAYOUT") throw new LayoutIssueError("line_not_flagged");
    return replaceFlaggedLineFileInTx(tx, {
      order,
      lineId,
      fileId: params.fileId ?? null,
      file,
      userId: params.userId,
      by: "staff",
      at,
    });
  });
}

/**
 * Archive + replace one file of a flagged line and return the line to WAITING
 * (shared by the owner's and the staff replace; the order row is already locked).
 */
async function replaceFlaggedLineFileInTx(
  tx: Tx,
  params: {
    order: { id: string; orderNumber: number; status: string; orderLines: { id: string; productionStatus: string }[] };
    lineId: string;
    fileId: string | null;
    file: ReplacementFileInput;
    userId: string;
    by: "client" | "staff";
    at: Date;
  },
): Promise<LayoutReplaceResult> {
  const { order, lineId, userId, at } = params;
  const line = await tx.orderLine.findUniqueOrThrow({
    where: { id: lineId },
    select: {
      layoutIssueReason: true,
      layoutIssueNote: true,
      layoutIssueAt: true,
    },
  });
  const swap = await swapOneLineFileInTx(tx, {
    orderId: order.id,
    lineId,
    fileId: params.fileId,
    file: params.file,
    userId,
    reason: LAYOUT_ISSUE_ARCHIVE_REASON,
    addWhenEmpty: true,
  });

  await tx.orderLine.update({
    where: { id: lineId },
    data: {
      productionStatus: "WAITING",
      productionStatusAt: at,
      ...CLEARED_LAYOUT_ISSUE_FIELDS,
      layoutFixedAt: at,
      layoutFixedById: userId,
      // The current file is no longer the owner's step-4 replacement: drop that marker.
      ...CLEARED_OWNER_REPLACED_FIELDS,
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
      oldValue: swap.replaced.oldFileName,
      newValue: swap.replaced.newFileName,
      metadata: {
        orderLineId: lineId,
        lineCode,
        by: params.by,
        reason: line.layoutIssueReason,
        note: line.layoutIssueNote,
        flaggedAt: line.layoutIssueAt?.toISOString() ?? null,
        ...replacedFileMetadata(swap.replaced),
        archivedFiles: swap.archivedFiles,
        files: [swap.created],
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
    archivedFiles: swap.archivedFiles,
    files: [swap.created],
    replaced: swap.replaced,
    layoutFixedAt: at.toISOString(),
  };
}

/**
 * Replace ONE file of a line (the order row must already be locked):
 *
 * - the target is `fileId`, which must be a file of this line and order
 *   (else 404 `file_not_in_line`); without `fileId` the line's only file
 *   (several files → 400 `file_id_required`; no file at all → the new file is
 *   added with default print settings on a «Нужен макет» fix, as before, and
 *   refused with `file_not_in_line` on a waiting line's replace);
 * - the old row is archived (`OrderFileArchive` with `reason`) and deleted, and
 *   a new row takes its place with the SAME copies / colour / paper / pages,
 *   so the printed quantity, price and stock stay. A new row (new id) rather
 *   than an in-place update: previews / size lines are cached per file id, and
 *   a second replace of the same file that raced this one finds its id gone
 *   (404) instead of silently overwriting;
 * - every other file of the line is not touched.
 */
async function swapOneLineFileInTx(
  tx: Tx,
  params: {
    orderId: string;
    lineId: string;
    fileId: string | null;
    file: ReplacementFileInput;
    userId: string;
    reason: string;
    /**
     * A line without any file: add the new one (the «Нужен макет» fix — the
     * workshop asked for the artwork) instead of refusing (`file_not_in_line`,
     * the owner's replace of a waiting line: nothing to replace).
     */
    addWhenEmpty: boolean;
  },
): Promise<{
  archivedFiles: { id: string; fileName: string }[];
  created: { id: string; fileName: string };
  replaced: ReplacedFileInfo;
}> {
  const { lineId, orderId } = params;
  const line = await tx.orderLine.findUniqueOrThrow({
    where: { id: lineId },
    select: { productType: true, files: { select: { id: true, orderId: true, fileName: true, fileUrl: true, copies: true, color: true, paperType: true, pageCount: true } } },
  });
  let target: (typeof line.files)[number] | null;
  if (params.fileId) {
    target = line.files.find((f) => f.id === params.fileId && f.orderId === orderId) ?? null;
    if (!target) throw new LayoutIssueError("file_not_in_line");
  } else if (line.files.length > 1) {
    throw new LayoutIssueError("file_id_required", String(line.files.length));
  } else {
    target = line.files[0] ?? null;
    if (!target && !params.addWhenEmpty) throw new LayoutIssueError("file_not_in_line", "0");
  }

  const archivedFiles: { id: string; fileName: string }[] = [];
  if (target) {
    archivedFiles.push(
      await tx.orderFileArchive.create({
        data: {
          orderId,
          orderLineId: lineId,
          lineProductType: line.productType,
          fileName: target.fileName,
          fileUrl: target.fileUrl,
          copies: target.copies,
          color: target.color,
          paperType: target.paperType,
          pageCount: target.pageCount,
          reason: params.reason,
          archivedById: params.userId,
        },
        select: { id: true, fileName: true },
      }),
    );
    await tx.file.delete({ where: { id: target.id } });
  }

  const created = await tx.file.create({
    data: {
      orderId,
      orderLineId: lineId,
      fileName: params.file.fileName,
      fileUrl: params.file.fileUrl,
      copies: target?.copies ?? 1,
      color: target?.color ?? "color",
      paperType: target?.paperType ?? null,
      pageCount: target?.pageCount ?? null,
    },
    select: { id: true, fileName: true },
  });

  return {
    archivedFiles,
    created,
    replaced: {
      oldFileId: target?.id ?? null,
      oldFileName: target?.fileName ?? null,
      newFileId: created.id,
      newFileName: created.fileName,
    },
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
        ...CLEARED_OWNER_REPLACED_FIELDS,
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
