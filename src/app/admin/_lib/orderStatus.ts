import type { OrderStatus } from "@/lib/validations";

export const ADMIN_STATUSES: OrderStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "READY_IN_STUDIO",
  "SENT_TO_WORKSHOP",
  "WORKSHOP_PRINTING",
  "WORKSHOP_READY",
  "RETURNED_TO_STUDIO",
  "DELIVERED",
  "ISSUE",
];

export const WORKSHOP_STATUSES: OrderStatus[] = [
  "SENT_TO_WORKSHOP",
  "WORKSHOP_PRINTING",
  "WORKSHOP_READY",
  "RETURNED_TO_STUDIO",
  "DELIVERED",
  "ISSUE",
];

export const STATUS_VARIANT_MAP: Record<OrderStatus, string> = {
  NEW: "info",
  IN_PROGRESS: "default",
  READY_IN_STUDIO: "cyan",
  SENT_TO_WORKSHOP: "yellow",
  WORKSHOP_PRINTING: "orange",
  WORKSHOP_READY: "purple",
  RETURNED_TO_STUDIO: "indigo",
  DELIVERED: "success",
  ISSUE: "destructive",
};

export const STATUS_DOT_COLORS: Record<string, string> = {
  NEW: "bg-blue-500",
  IN_PROGRESS: "bg-slate-500",
  READY_IN_STUDIO: "bg-teal-500",
  SENT_TO_WORKSHOP: "bg-yellow-500",
  WORKSHOP_PRINTING: "bg-orange-500",
  WORKSHOP_READY: "bg-purple-500",
  RETURNED_TO_STUDIO: "bg-indigo-500",
  DELIVERED: "bg-emerald-500",
  ISSUE: "bg-red-500",
};

export const TRIGGER_COLORS: Record<string, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  default: "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100",
  pink: "border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
  orange: "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100",
  purple: "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  destructive: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  outline: "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
};
