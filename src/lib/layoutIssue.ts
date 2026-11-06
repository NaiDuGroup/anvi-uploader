import { isWorkshopPhaseStatus } from "@/lib/orderStatusFromLines";
import { isSheetProductType } from "@/lib/sheetProduct/sheetProductConfig";

/**
 * Per-line production status, step 3: «Нужен макет» on one order line.
 *
 * The workshop (staff) flags a line whose file cannot be printed: the line
 * goes to `NEEDS_LAYOUT` with a reason and an optional comment, the rest of
 * the order keeps moving (NEEDS_LAYOUT counts as WAITING in the order status
 * derivation, `orderStatusFromLines.ts`). Production pickers skip the line
 * ({@link isLineHeldForLayout}). The owner (dealer or client, cabinet) or the
 * staff replaces the file → the line returns to WAITING with `layoutFixedAt`.
 *
 * A line is flagged iff `productionStatus === "NEEDS_LAYOUT"`; the
 * `layoutIssue*` fields are its details and are cleared when the flag goes
 * (the full history stays in `OrderLog`). `layoutFixedAt` stays until the
 * next flag, so the board can show «✓ Макет исправлен 14:20».
 *
 * Pure and client-safe.
 */

/** Reason codes: the order-level ISSUE reasons plus «Неверный размер». */
export const LAYOUT_ISSUE_REASONS = [
  "fileCorrupt",
  "wrongFormat",
  "lowQuality",
  "missingPages",
  "wrongSize",
  "other",
] as const;

export type LayoutIssueReason = (typeof LAYOUT_ISSUE_REASONS)[number];

/** Max length of the workshop comment. */
export const LAYOUT_ISSUE_NOTE_MAX = 500;

/** How long «✓ Макет исправлен» stays highlighted / sorted first on the board. */
export const LAYOUT_FIXED_HIGHLIGHT_MS = 24 * 60 * 60 * 1000;

/** Archive reason of files replaced on a flagged line (`OrderFileArchive.reason`). */
export const LAYOUT_ISSUE_ARCHIVE_REASON = "layout_issue";

export function isLayoutIssueReason(value: unknown): value is LayoutIssueReason {
  return typeof value === "string" && (LAYOUT_ISSUE_REASONS as readonly string[]).includes(value);
}

/** The line waits for a new layout. */
export function isLineNeedsLayout(lineStatus: string | null | undefined): boolean {
  return lineStatus === "NEEDS_LAYOUT";
}

/**
 * The line must not be picked by any production step (mug / notebook batch,
 * DTF film, LF roll planner, business-card sheet): it waits for a new file.
 */
export function isLineHeldForLayout(line: { lineStatus?: string | null; productionStatus?: string | null }): boolean {
  return isLineNeedsLayout(line.lineStatus ?? line.productionStatus);
}

/**
 * Staff may flag a line: order in the workshop phase, line waiting or
 * printing (a printed line is past fixing; a flagged one is already flagged).
 */
export function canFlagLayoutIssue(orderStatus: string, lineStatus: string): boolean {
  return isWorkshopPhaseStatus(orderStatus) && (lineStatus === "WAITING" || lineStatus === "PRINTING");
}

/** Normalise the optional comment: trimmed, null when empty. Throws nothing; length is checked by the schema. */
export function normalizeLayoutIssueNote(note: string | null | undefined): string | null {
  const t = (note ?? "").trim();
  return t.length > 0 ? t : null;
}

/** Whole hours the line has been waiting (≥ 0), for «ждёт 3 ч». */
export function layoutIssueWaitHours(since: Date | string | null | undefined, now: Date = new Date()): number {
  if (!since) return 0;
  const t = typeof since === "string" ? new Date(since).getTime() : since.getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 3_600_000));
}

/**
 * Compact waiting time: minutes under an hour, hours under two days, then days.
 * Returns the parts; the UI words them (`t.layoutIssue.waitFor`).
 */
export function layoutIssueWaitParts(
  since: Date | string | null | undefined,
  now: Date = new Date(),
): { unit: "m" | "h" | "d"; value: number } {
  if (!since) return { unit: "m", value: 0 };
  const t = typeof since === "string" ? new Date(since).getTime() : since.getTime();
  const ms = Number.isFinite(t) ? Math.max(0, now.getTime() - t) : 0;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return { unit: "m", value: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return { unit: "h", value: hours };
  return { unit: "d", value: Math.floor(hours / 24) };
}

/** «✓ Макет исправлен» is still fresh (shown and sorted first on the board). */
export function isLayoutRecentlyFixed(
  line: { lineStatus?: string | null; layoutFixedAt?: string | Date | null },
  now: Date = new Date(),
): boolean {
  if (!line.layoutFixedAt || isLineNeedsLayout(line.lineStatus)) return false;
  const t = typeof line.layoutFixedAt === "string" ? new Date(line.layoutFixedAt).getTime() : line.layoutFixedAt.getTime();
  return Number.isFinite(t) && now.getTime() - t < LAYOUT_FIXED_HIGHLIGHT_MS;
}

/**
 * Sort bucket on the board, before everything else: flagged lines first
 * (0, oldest flag first is the caller's tie-break), freshly fixed second (1),
 * the rest (2).
 */
export function layoutAttentionRank(
  line: { lineStatus?: string | null; layoutFixedAt?: string | Date | null },
  now: Date = new Date(),
): 0 | 1 | 2 {
  if (isLineNeedsLayout(line.lineStatus)) return 0;
  if (isLayoutRecentlyFixed(line, now)) return 1;
  return 2;
}

/** Fields written on the line when the flag is lifted (manual clear or replacement). */
export const CLEARED_LAYOUT_ISSUE_FIELDS = {
  layoutIssueReason: null,
  layoutIssueNote: null,
  layoutIssueAt: null,
  layoutIssueById: null,
} as const;

/** What the cabinet / admin show about a flagged line (no staff ids). Null when the line is not flagged. */
export interface LayoutIssueView {
  reason: string | null;
  note: string | null;
  /** When the line was flagged (ISO). */
  since: string | null;
}

export function toLayoutIssueView(line: {
  productionStatus?: string | null;
  layoutIssueReason?: string | null;
  layoutIssueNote?: string | null;
  layoutIssueAt?: Date | string | null;
}): LayoutIssueView | null {
  if (!isLineNeedsLayout(line.productionStatus)) return null;
  const at = line.layoutIssueAt;
  return {
    reason: line.layoutIssueReason ?? null,
    note: line.layoutIssueNote ?? null,
    since: at == null ? null : typeof at === "string" ? at : at.toISOString(),
  };
}

/** Prisma `select` of the layout-issue fields shown in lists and on the board. */
export const LAYOUT_ISSUE_LINE_SELECT = {
  layoutIssueReason: true,
  layoutIssueNote: true,
  layoutIssueAt: true,
  layoutFixedAt: true,
} as const;

/**
 * A flagged line's new artwork may be a link (Google Drive, …) instead of an
 * upload — except where production reads the file itself (sheet imposition,
 * DTF film nesting), like the new-order wizard's «или вставьте ссылку».
 */
export function layoutLinkAllowed(productType: string): boolean {
  return !isSheetProductType(productType) && productType !== "dtf_apparel";
}

/**
 * Where the other lines of an order with a flagged line stand, for the
 * cabinet sentence under «Нужен новый макет»:
 * - `inWork`: at least one other line is printing or printed;
 * - `queued`: the others are all still waiting (or waiting for a layout too);
 * - `null`: the flagged line is the only one — no sentence.
 */
export type OtherLinesProgress = "inWork" | "queued" | null;

export function otherLinesProgress(
  lines: readonly { id: string; productionStatus?: string | null }[],
  lineId: string,
): OtherLinesProgress {
  const others = lines.filter((l) => l.id !== lineId);
  if (others.length === 0) return null;
  return others.some((l) => l.productionStatus === "PRINTING" || l.productionStatus === "DONE") ? "inWork" : "queued";
}
