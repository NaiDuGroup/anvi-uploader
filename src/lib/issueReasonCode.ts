/**
 * Keys of the order-level ISSUE reason picker (`IssueReasonModal`). The modal
 * still saves the localized label / free text in `Order.issueReason`; the key
 * goes along silently into `Order.issueReasonCode` and the log metadata, so
 * «Аналитика цеха» can group reasons without parsing texts. Pure, client-safe.
 */
export const ISSUE_REASON_CODES = [
  "fileCorrupt",
  "wrongFormat",
  "lowQuality",
  "missingPages",
  "other",
] as const;

export type IssueReasonCode = (typeof ISSUE_REASON_CODES)[number];

export function isIssueReasonCode(value: unknown): value is IssueReasonCode {
  return typeof value === "string" && (ISSUE_REASON_CODES as readonly string[]).includes(value);
}
