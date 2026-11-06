import { isLayoutIssueReason, layoutIssueWaitParts, type LayoutIssueReason } from "@/lib/layoutIssue";
import type { LayoutIssueDictionary } from "@/lib/i18n/layoutIssue/types";

/**
 * Browser helpers for «Нужен макет» on one order line (staff): flag / clear
 * calls and the small wording helpers shared by the workshop board and the
 * studio orders page. The server re-derives the order status.
 */

/** Error code from the API answer (`{ error }`), or `HTTP <status>`. */
async function failure(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error || `HTTP ${res.status}`);
}

/** `POST /api/orders/[id]/lines/[lineId]/layout-issue`; throws on a non-2xx answer. */
export async function flagLineLayoutIssue(
  orderId: string,
  lineId: string,
  reason: LayoutIssueReason,
  note: string | null,
): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}/lines/${lineId}/layout-issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(note ? { reason, note } : { reason }),
  });
  if (!res.ok) throw await failure(res);
}

/** `DELETE …/layout-issue` («Снять отметку»); throws on a non-2xx answer. */
export async function clearLineLayoutIssue(orderId: string, lineId: string): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}/lines/${lineId}/layout-issue`, { method: "DELETE" });
  if (!res.ok) throw await failure(res);
}

/** Reason label; unknown / missing codes fall back to «Другое». */
export function layoutIssueReasonLabel(t: LayoutIssueDictionary, reason: string | null | undefined): string {
  return isLayoutIssueReason(reason) ? t.reasons[reason] : t.reasons.other;
}

/** «ждёт 3 ч» for a flag set at `since`. */
export function layoutIssueWaitLabel(
  t: LayoutIssueDictionary,
  since: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const { unit, value } = layoutIssueWaitParts(since, now);
  return t.waitingFor(t.waitFor(unit, value));
}

/** «14:20» today, «05.11 14:20» on another day (local time). */
export function formatLayoutFixedTime(at: string | Date, now: Date = new Date()): string {
  const d = typeof at === "string" ? new Date(at) : at;
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? time : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${time}`;
}

/**
 * `POST /api/orders/[id]/lines/[lineId]/replace-file` (staff «Заменить файл»):
 * replaces ONE file of the line — `fileId` is the `File.id` being replaced
 * (null only on a one-file line). Throws `Error(code)` on a non-2xx answer.
 */
export async function staffReplaceLineFile(
  orderId: string,
  lineId: string,
  fileId: string | null,
  file: { fileName: string; fileUrl: string },
): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}/lines/${lineId}/replace-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(staffReplaceBody(fileId, file)),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new Error(body.detail === "link_not_allowed" ? "link_not_allowed" : body.error || `HTTP ${res.status}`);
  }
}

/** Body of a per-file replace request (`fileId` left out when unknown: a one-file line). */
export function staffReplaceBody(
  fileId: string | null,
  file: { fileName: string; fileUrl: string },
): { fileId?: string; files: { fileName: string; fileUrl: string }[] } {
  return fileId ? { fileId, files: [file] } : { files: [file] };
}

/** The cabinet sentence about the other lines of an order with a flagged line (null: no sentence). */
export function otherLinesSentence(
  t: LayoutIssueDictionary,
  progress: "inWork" | "queued" | null,
): string | null {
  if (progress === "inWork") return t.cabinetOtherLinesInWork;
  if (progress === "queued") return t.cabinetOtherLinesQueued;
  return null;
}
