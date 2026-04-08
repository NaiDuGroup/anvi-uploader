import type { OrderStatus } from "@/lib/validations";

export type AdminOrderSaving = { orderId: string; kind: "status" | "prio" | "paid" } | null;

export type PaperType = "A0" | "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "other";
export const PAPER_OPTIONS: PaperType[] = ["A6", "A5", "A4", "A3", "A2", "A1", "A0", "other"];

export interface CurrentUser {
  id: string;
  name: string;
  role: string;
}

export const STATUS_VARIANT_MAP: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"
> = {
  NEW: "info",
  IN_PROGRESS: "default",
  PENDING_APPROVAL: "secondary",
  CHANGES_REQUESTED: "warning",
  SENT_TO_WORKSHOP: "warning",
  WORKSHOP_PRINTING: "warning",
  WORKSHOP_READY: "secondary",
  RETURNED_TO_STUDIO: "info",
  DELIVERED: "success",
  ISSUE: "destructive",
};

export const STATUS_DOT_COLORS: Record<string, string> = {
  NEW: "bg-blue-400",
  IN_PROGRESS: "bg-gray-500",
  PENDING_APPROVAL: "bg-violet-400",
  CHANGES_REQUESTED: "bg-amber-500",
  SENT_TO_WORKSHOP: "bg-amber-400",
  WORKSHOP_PRINTING: "bg-amber-500",
  WORKSHOP_READY: "bg-purple-400",
  RETURNED_TO_STUDIO: "bg-blue-400",
  DELIVERED: "bg-green-500",
  ISSUE: "bg-red-500",
};

export const TRIGGER_COLORS: Record<string, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  default: "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100",
  warning: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  secondary: "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100",
  success: "border-green-200 bg-green-50 text-green-700 hover:bg-green-100",
  destructive: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  outline: "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
};

export const ADMIN_STATUSES: OrderStatus[] = [
  "NEW", "IN_PROGRESS", "PENDING_APPROVAL", "CHANGES_REQUESTED",
  "SENT_TO_WORKSHOP", "WORKSHOP_PRINTING",
  "WORKSHOP_READY", "RETURNED_TO_STUDIO", "DELIVERED", "ISSUE",
];

export const WORKSHOP_STATUSES: OrderStatus[] = [
  "SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY", "RETURNED_TO_STUDIO", "DELIVERED", "ISSUE",
];

export const FILES_ACCORDION_MIN = 4;

export type IssueReasonKey = keyof typeof import("@/lib/i18n/en").en.admin.issueReasons;
export const ISSUE_REASON_KEYS: IssueReasonKey[] = [
  "fileCorrupt",
  "wrongFormat",
  "lowQuality",
  "missingPages",
  "other",
];
