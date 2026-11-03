import type { OrderStatus } from "@/lib/validations";

/**
 * Order statuses behind each admin-footer counter. There is no due-date on
 * orders, so there is no «overdue» group.
 */
export const FOOTER_STATUS_GROUPS = {
  new: ["NEW"],
  inWork: ["IN_PROGRESS", "SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY"],
  ready: ["READY_IN_STUDIO", "RETURNED_TO_STUDIO"],
  issue: ["ISSUE"],
} as const satisfies Record<string, readonly OrderStatus[]>;

export type FooterStatusGroup = keyof typeof FOOTER_STATUS_GROUPS;

export interface FooterStatusCounts {
  new: number;
  inWork: number;
  ready: number;
  issue: number;
  /** `null` when the role cannot open the stock section. */
  lowStock: number | null;
}
