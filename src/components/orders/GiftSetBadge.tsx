"use client";

import { Gift, Package } from "lucide-react";
import { giftSetBoxName, isLegacyReadySetLine, parseOrderLineSetData } from "@/lib/giftSet/giftSet";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

/** «🎁 Набор: Ручка + блокнот + кружка ×3 · Ручка» on an order line / board card of a gift set. */
export function GiftSetBadge({
  label,
  role,
  note,
  procurement,
  className,
}: {
  label: string;
  role?: string | null;
  /** Packing note («+ коробка 30×23×8,5» / «в коробке набора»). */
  note?: string | null;
  /** Shown as a red «Закупка» chip: the set item / box was short when the order was saved. */
  procurement?: string | null;
  className?: string;
}) {
  const badge = (
    <span
      data-testid="gift-set-badge"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-fuchsia-200 bg-fuchsia-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-fuchsia-800",
        className,
      )}
    >
      <Gift className="h-3 w-3 shrink-0" aria-hidden />
      {label}
      {role ? <span className="font-normal text-fuchsia-700/80">· {role}</span> : null}
      {note ? <span className="font-normal text-fuchsia-700/80" data-testid="gift-set-pack-note">· {note}</span> : null}
    </span>
  );
  if (!procurement) return badge;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {badge}
      <span
        data-testid="gift-set-procurement"
        className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-red-700"
      >
        {procurement}
      </span>
    </span>
  );
}

/** Badge from a stored `OrderLine.setData` (nothing outside a set). */
export function GiftSetLineBadge({ setData, t, className }: { setData: unknown; t: TranslationDictionary; className?: string }) {
  const d = parseOrderLineSetData(setData);
  if (!d) return null;
  return <GiftSetBadge label={t.giftSet.badge(d.name, d.quantity)} role={isLegacyReadySetLine(d) ? null : d.roleLabel} className={className} />;
}

/** Frame classes of an order line in a set: the set's lines share a tinted left bracket (nothing outside a set). */
export function giftSetLineFrameClass(setData: unknown): string | null {
  return parseOrderLineSetData(setData) ? "border-l-4 border-l-fuchsia-300 bg-fuchsia-50/20" : null;
}

/** The box line of a set: «Коробка 30×23×8,5 × 2 · входит в набор · списывается со склада, 1 на набор». */
export function GiftSetBoxLineSummary({ setData, t, className }: { setData: unknown; t: TranslationDictionary; className?: string }) {
  const d = parseOrderLineSetData(setData);
  if (!d || d.role !== "box" || !d.boxSku) return null;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 text-xs text-gray-700", className)} data-testid="gift-set-box-line">
      <Package className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
      <span className="font-medium text-gray-900">
        {giftSetBoxName(d.boxSku)} × {d.quantity}
      </span>
      <span className="text-gray-400">{d.boxSku}</span>
      <span className="text-fuchsia-800">· {t.giftSet.boxIncluded}</span>
      <span className="text-gray-500">· {t.giftSet.boxStockNote}</span>
    </p>
  );
}
