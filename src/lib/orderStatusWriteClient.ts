import type { TranslationDictionary } from "@/lib/i18n/types";

/**
 * Browser side of an order-level status write (`PATCH /api/orders/[id]` with
 * `status`): «Нужен макет» lines are never moved by it.
 *
 * - 200 with `keptNeedsLayoutLines` non-empty: those lines kept waiting and the
 *   stored `status` is the one derived from the lines (may differ from the requested one);
 * - 409 `{ error: "lines_need_layout", lines }`: refused, nothing written.
 *
 * Client-safe.
 */
export type OrderStatusWriteOutcome =
  | { kind: "ok"; status: string | null; keptNeedsLayoutLines: string[] }
  | { kind: "linesNeedLayout"; lines: string[] }
  | { kind: "error"; httpStatus: number };

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export async function readOrderStatusWriteResponse(res: Response): Promise<OrderStatusWriteOutcome> {
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok) {
    return {
      kind: "ok",
      status: typeof body?.status === "string" ? body.status : null,
      keptNeedsLayoutLines: stringList(body?.keptNeedsLayoutLines),
    };
  }
  if (res.status === 409 && body?.error === "lines_need_layout") {
    return { kind: "linesNeedLayout", lines: stringList(body.lines) };
  }
  return { kind: "error", httpStatus: res.status };
}

/** The notice to show after the write, or null when there is nothing to say. */
export function orderStatusWriteNotice(
  t: Pick<TranslationDictionary, "layoutIssue" | "statuses">,
  outcome: OrderStatusWriteOutcome | null | undefined,
): { tone: "info" | "error"; text: string } | null {
  if (!outcome) return null;
  if (outcome.kind === "linesNeedLayout") {
    return { tone: "error", text: t.layoutIssue.orderStatusBlocked(outcome.lines) };
  }
  if (outcome.kind === "ok" && outcome.keptNeedsLayoutLines.length > 0) {
    const label = outcome.status
      ? ((t.statuses as Record<string, string>)[outcome.status] ?? outcome.status)
      : "";
    return { tone: "info", text: t.layoutIssue.orderStatusKept(outcome.keptNeedsLayoutLines, label) };
  }
  return null;
}
