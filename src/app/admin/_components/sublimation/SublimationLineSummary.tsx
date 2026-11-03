"use client";

import type { TranslationDictionary } from "@/lib/i18n/types";
import { sublimationItemDisplayName } from "@/lib/sublimation/stockItems";
import {
  toSublimationPublicSummary,
  type SublimationPublicSummary,
} from "@/lib/sublimation/sublimationPublicSummary";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";

/** Order-list view of a sublimation line: blank (or the client's item with its print size) and quantity. */
export function SublimationLineSummary({
  dataRaw,
  t,
  className,
}: {
  dataRaw: unknown;
  t: TranslationDictionary;
  className?: string;
}) {
  const data: SublimationPublicSummary | null = toSublimationPublicSummary(dataRaw, { production: true });
  if (!data) return null;
  return <SublimationLineSummaryView data={data} t={t} className={className} />;
}

/** Renders whatever the summary carries (SKU and notes only on staff views). */
export function SublimationLineSummaryView({
  data,
  t,
  className,
}: {
  data: SublimationPublicSummary;
  t: TranslationDictionary;
  className?: string;
}) {
  const locale: string = useLanguageStore((s) => s.locale);
  const item = data.item;
  return (
    <div className={cn("text-xs leading-snug text-gray-700", className)}>
      <p className="flex items-center gap-1.5 font-medium text-gray-900">
        {item?.colorHex && (
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full border border-gray-300"
            style={{ backgroundColor: item.colorHex }}
            aria-hidden
          />
        )}
        {item
          ? sublimationItemDisplayName(item, locale)
          : `${t.sublimation.workshop.clientItem}: ${data.clientItemDescription ?? "—"}`}
      </p>
      <p className="tabular-nums">
        {t.sublimation.editor.pieces(data.quantity)}
        {item && data.sku && <span className="ml-1 font-mono text-gray-400">{data.sku}</span>}
        {!item && data.sizeLabel && (
          <span className="ml-1 text-gray-500">· {data.sizeLabel}</span>
        )}
      </p>
      {!item && data.clientItemNotes && <p className="text-gray-500">{data.clientItemNotes}</p>}
    </div>
  );
}
