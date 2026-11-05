import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Hourglass,
  PackageCheck,
  Printer,
  Store,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ClientVisibleStatus } from "@/lib/validations";

/**
 * Visual treatment per client-visible status, shared by the cabinet orders
 * list and the order page: grey while accepted / queued, blue while printing,
 * green when it can be picked up, pale once handed over, red when the
 * client's attention is needed, greyed for a dealer-cancelled order.
 */
export const CABINET_STATUS_STYLES: Record<
  ClientVisibleStatus,
  { Icon: LucideIcon; pill: string; dot: string; stripe: string }
> = {
  accepted: {
    Icon: Clock,
    pill: "bg-gray-100 text-gray-800 ring-gray-200",
    dot: "bg-gray-400",
    stripe: "bg-gray-300",
  },
  queued: {
    Icon: Hourglass,
    pill: "bg-gray-100 text-gray-800 ring-gray-200",
    dot: "bg-gray-400",
    stripe: "bg-gray-300",
  },
  printing: {
    Icon: Printer,
    pill: "bg-blue-100 text-blue-900 ring-blue-200",
    dot: "bg-blue-500",
    stripe: "bg-blue-400",
  },
  readyInWorkshop: {
    Icon: PackageCheck,
    pill: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    dot: "bg-emerald-500",
    stripe: "bg-emerald-400",
  },
  readyInStudio: {
    Icon: Store,
    pill: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    dot: "bg-emerald-500",
    stripe: "bg-emerald-400",
  },
  delivered: {
    Icon: CheckCircle2,
    pill: "bg-slate-50 text-slate-500 ring-slate-200",
    dot: "bg-slate-300",
    stripe: "bg-slate-200",
  },
  issue: {
    Icon: AlertCircle,
    pill: "bg-red-100 text-red-900 ring-red-200",
    dot: "bg-red-500",
    stripe: "bg-red-400",
  },
  cancelled: {
    Icon: XCircle,
    pill: "bg-gray-100 text-gray-600 ring-gray-200",
    dot: "bg-gray-400",
    stripe: "bg-gray-300",
  },
};

/** Style of the «Можно забрать» quick filter chip. */
export const CABINET_PICKUP_FILTER_STYLE = {
  Icon: PackageCheck,
  pill: "bg-emerald-100 text-emerald-900 ring-emerald-200",
};
