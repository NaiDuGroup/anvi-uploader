/**
 * Short string that changes whenever something the admin orders list or the
 * workshop sidebar shows has changed. Silent polling replaces the list only
 * when it differs, so every visible field must be part of it — including the
 * per-line production status (a line can turn «Готово» while the order
 * status stays «Печатается в цеху»).
 */
export interface PollFingerprintOrder {
  id: string;
  status: string;
  isPrio?: boolean | null;
  assignedTo?: string | null;
  isWorkshop?: boolean | null;
  needsProcurement?: boolean | null;
  commentCount?: number | null;
  unreadCommentCount?: number | null;
  notes?: string | null;
  issueReason?: string | null;
  price?: number | string | null;
  isPaid?: boolean | null;
  clientId?: string | null;
  orderLines?: Array<{
    id: string;
    productionStatus?: string | null;
    /** «Нужен макет»: a flag + fix between two polls leaves the status WAITING but moves these. */
    layoutIssueAt?: string | null;
    layoutFixedAt?: string | null;
  }> | null;
}

function linesPart(order: PollFingerprintOrder): string {
  const lines = order.orderLines ?? [];
  return lines
    .map((l) => `${l.id}=${l.productionStatus ?? ""}/${l.layoutIssueAt ?? ""}/${l.layoutFixedAt ?? ""}`)
    .join(",");
}

export function orderPollFingerprint(list: readonly PollFingerprintOrder[]): string {
  return list
    .map(
      (o) =>
        `${o.id}:${o.status}:${o.isPrio}:${o.assignedTo}:${o.isWorkshop}:${o.needsProcurement ? 1 : 0}:${o.commentCount}:${o.unreadCommentCount}:${o.notes}:${o.issueReason}:${o.price}:${o.isPaid}:${o.clientId ?? ""}:${linesPart(o)}`,
    )
    .join("|");
}
