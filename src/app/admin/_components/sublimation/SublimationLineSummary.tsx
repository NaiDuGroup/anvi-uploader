"use client";

import type { TranslationDictionary } from "@/lib/i18n/types";
import { parseSublimationLineData } from "@/lib/sublimation/parseSublimationLineData";
import { sublimationItemDisplayName } from "@/lib/sublimation/stockItems";
import type { SublimationLineData } from "@/lib/sublimation/types";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";

/** Order-list view of a sublimation line: blank and quantity. */
export function SublimationLineSummary({
  dataRaw,
  t,
  className,
}: {
  dataRaw: unknown;
  t: TranslationDictionary;
  className?: string;
}) {
  const locale: string = useLanguageStore((s) => s.locale);
  const data: SublimationLineData | null = parseSublimationLineData(dataRaw);
  if (!data) return null;
  return (
    <div className={cn("text-xs leading-snug text-gray-700", className)}>
      <p className="flex items-center gap-1.5 font-medium text-gray-900">
        {data.item.colorHex && (
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full border border-gray-300"
            style={{ backgroundColor: data.item.colorHex }}
            aria-hidden
          />
        )}
        {sublimationItemDisplayName(data.item, locale)}
      </p>
      <p className="tabular-nums">
        {t.sublimation.editor.pieces(data.quantity)}
        <span className="ml-1 font-mono text-gray-400">{data.item.sku}</span>
      </p>
    </div>
  );
}
