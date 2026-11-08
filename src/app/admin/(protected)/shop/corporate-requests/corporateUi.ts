import type { CorporateStatus } from "@/lib/corporate/requestRules";
import { CORPORATE_QUANTITY_LABEL, type CorporateQuantity } from "@/lib/corporate/requestRules";

/** Badge colours per request status (admin list + detail). */
export const CORPORATE_STATUS_CLASS: Record<CorporateStatus, string> = {
  new: "border-amber-300 bg-amber-50 text-amber-800",
  in_work: "border-sky-200 bg-sky-50 text-sky-800",
  offer_sent: "border-violet-200 bg-violet-50 text-violet-800",
  won: "border-emerald-200 bg-emerald-50 text-emerald-800",
  lost: "border-gray-200 bg-gray-100 text-gray-600",
};

export function statusClass(s: string): string {
  return CORPORATE_STATUS_CLASS[s as CorporateStatus] ?? CORPORATE_STATUS_CLASS.lost;
}

export function quantityLabel(q: string): string {
  return CORPORATE_QUANTITY_LABEL[q as CorporateQuantity] ?? q;
}

/** «05.11.2026» (YYYY-MM-DD or ISO in). */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** «05.11.2026, 14:30» in Chișinău time. */
export function dateTime(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Chisinau",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Window event: a request status changed, the nav «Заявки компаний» badge re-reads its count. */
export const CORPORATE_COUNT_CHANGED_EVENT = "admin:corporate-count-changed";

export function notifyCorporateCountChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CORPORATE_COUNT_CHANGED_EVENT));
}
