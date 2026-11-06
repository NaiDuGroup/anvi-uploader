import type { OrderStatus } from "@/lib/validations";

/**
 * Per-line production status, step 4 (part 1): the order's owner in the
 * cabinet (dealer or retail client) replaces the file of a line that has not
 * started yet, while other lines of the same order may already print or be
 * done. Only the file changes — no quantity, product, price, stock or status —
 * so it is allowed on paid orders too. Edit / cancel of the whole order keep
 * their own, stricter rule (`dealerOrderModify.ts`).
 *
 * A NEEDS_LAYOUT line keeps its «Нужен макет» flow (the workshop asked for the
 * file; it returns to WAITING with `layoutFixedAt`), which only needs a live
 * order. A WAITING line needs the full rule below.
 *
 * Pure and client-safe: no Prisma, no server imports.
 */

/**
 * Order statuses in which a WAITING line's file may be replaced: the dealer
 * editable ones (NEW, IN_PROGRESS, SENT_TO_WORKSHOP, ISSUE) plus the rest of
 * the workshop phase (WORKSHOP_PRINTING; WORKSHOP_READY cannot have a waiting
 * line when derived, but the line check decides). Made / handed over orders
 * (READY_IN_STUDIO, RETURNED_TO_STUDIO, DELIVERED) are past it.
 */
export const OWNER_REPLACE_ORDER_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "ISSUE",
  "SENT_TO_WORKSHOP",
  "WORKSHOP_PRINTING",
  "WORKSHOP_READY",
] as const satisfies readonly OrderStatus[];

/** Archive reason of files the owner replaced on a not-started line (`OrderFileArchive.reason`). */
export const OWNER_REPLACE_ARCHIVE_REASON = "owner_replace";

export interface OwnerReplaceOrder {
  status: string;
  deletedAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  /** Storefront orders ("shop") are prepaid online and never changed from the cabinet. */
  source?: string | null;
}

export interface OwnerReplaceLine {
  productionStatus: string;
}

/** Why the owner cannot replace the line's file; null when they can. */
export type OwnerLineFileBlock = "deleted" | "cancelled" | "shop" | "order_status" | "line_started";

export function ownerLineFileBlockReason(order: OwnerReplaceOrder, line: OwnerReplaceLine): OwnerLineFileBlock | null {
  if (order.cancelledAt) return "cancelled";
  if (order.deletedAt) return "deleted";
  // «Нужен макет»: the workshop waits for exactly this file (step 3 flow).
  if (line.productionStatus === "NEEDS_LAYOUT") return null;
  // PRINTING, DONE and anything unknown: already in work (unknown counts as started, to be safe).
  if (line.productionStatus !== "WAITING") return "line_started";
  if (order.source === "shop") return "shop";
  if (!(OWNER_REPLACE_ORDER_STATUSES as readonly string[]).includes(order.status)) return "order_status";
  return null;
}

/** True when the cabinet owner may replace this line's file (ownership is checked separately). */
export function canOwnerReplaceLineFile(order: OwnerReplaceOrder, line: OwnerReplaceLine): boolean {
  return ownerLineFileBlockReason(order, line) === null;
}

/** The status pill of one position in the cabinet. */
export type CabinetLinePill = "waiting" | "printing" | "done" | "needsLayout";

/** Line status → cabinet pill (unknown values read as «Ждёт», like the order status derivation). */
export function cabinetLinePill(productionStatus: string | null | undefined): CabinetLinePill {
  switch (productionStatus) {
    case "PRINTING":
      return "printing";
    case "DONE":
      return "done";
    case "NEEDS_LAYOUT":
      return "needsLayout";
    default:
      return "waiting";
  }
}

/**
 * «Готово N из M» next to the order status: only while the lines are mixed —
 * more than one line, at least one done and at least one not. Null otherwise
 * (nothing done yet, or everything done: the order status says it).
 */
export function cabinetLinesDoneSummary(
  lines: readonly { productionStatus?: string | null }[] | null | undefined,
): { done: number; total: number } | null {
  if (!lines || lines.length < 2) return null;
  const done = lines.filter((l) => l.productionStatus === "DONE").length;
  if (done === 0 || done === lines.length) return null;
  return { done, total: lines.length };
}

/**
 * The staff marker «Файл заменён дилером / клиентом 14:20» is shown while the
 * line is not finished: waiting (the file to take is the new one) or printing.
 * A DONE line no longer needs it; a flagged line shows its «Нужен макет» card.
 */
export function isOwnerReplaceMarkerVisible(line: {
  productionStatus?: string | null;
  ownerReplacedAt?: string | Date | null;
}): boolean {
  if (!line.ownerReplacedAt) return false;
  return line.productionStatus === "WAITING" || line.productionStatus === "PRINTING";
}

/**
 * Where the cabinet shows «Заменить» on a position. A replace swaps ONE file
 * (and keeps its copies), so:
 * - `line`: one button on the position (a single file — or none, on a
 *   «Нужен макет» position, where the fix adds the file);
 * - `perFile`: a «Заменить» next to each file (several files);
 * - `none`: the position is neither flagged nor replaceable.
 */
export function cabinetReplaceButtons(p: {
  flagged: boolean;
  canReplaceFile: boolean;
  fileCount: number;
}): "none" | "line" | "perFile" {
  if (!p.flagged && !p.canReplaceFile) return "none";
  return p.fileCount > 1 ? "perFile" : "line";
}
