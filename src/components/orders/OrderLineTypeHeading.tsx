"use client";

import { lineTypeKey, lineTypeLabel, PRODUCT_TYPE_ICONS } from "@/lib/productTypeIcons";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";
import { GiftSetLineBadge } from "./GiftSetBadge";

/** «☐ НАКЛЕЙКИ НА ЛИСТЕ» — product type icon + label at the top of an order line card. */
export function OrderLineTypeHeading({
  productType,
  uvLineData,
  setData,
  t,
  className,
}: {
  productType: string;
  uvLineData?: unknown;
  /** «Набор»: `OrderLine.setData` — badge next to the type. */
  setData?: unknown;
  t: TranslationDictionary;
  className?: string;
}) {
  const key = lineTypeKey(productType, uvLineData, setData);
  if (!key) return null;
  const Icon = PRODUCT_TYPE_ICONS[key];
  return (
    <p
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500",
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-gray-600" aria-hidden />
      {lineTypeLabel(key, t)}
      <GiftSetLineBadge setData={setData} t={t} className="normal-case tracking-normal" />
    </p>
  );
}
