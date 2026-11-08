"use client";

import { Gift } from "lucide-react";
import { parseOrderLineSetData } from "@/lib/giftSet/giftSet";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

/** «🎁 Набор: Ручка + блокнот + кружка ×3 · Ручка» on an order line / board card of a gift set. */
export function GiftSetBadge({
  label,
  role,
  className,
}: {
  label: string;
  role?: string | null;
  className?: string;
}) {
  return (
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
    </span>
  );
}

/** Badge from a stored `OrderLine.setData` (nothing outside a set). */
export function GiftSetLineBadge({ setData, t, className }: { setData: unknown; t: TranslationDictionary; className?: string }) {
  const d = parseOrderLineSetData(setData);
  if (!d) return null;
  return <GiftSetBadge label={t.giftSet.badge(d.name, d.quantity)} role={d.kind === "ready" ? null : d.roleLabel} className={className} />;
}
