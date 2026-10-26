"use client";

import { Gift } from "lucide-react";
import type { SublimationLineFacts } from "@/lib/workshopBoard/types";
import { useLanguageStore } from "@/stores/useLanguageStore";

/** Board line summary of a sublimation line: blank, SKU and quantity (artwork shows as the line's files). */
export function SublimationBoardLineSummary({ facts }: { facts: SublimationLineFacts }) {
  const { t } = useLanguageStore();
  return (
    <div className="space-y-1 text-[11px] text-gray-600">
      <div className="flex flex-wrap items-center gap-1.5">
        <Gift className="h-3 w-3 shrink-0 text-amber-600" aria-hidden />
        {facts.colorHex && (
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full border border-gray-300"
            style={{ backgroundColor: facts.colorHex }}
            aria-hidden
          />
        )}
        <span className="max-w-[16rem] truncate font-medium text-gray-800" title={facts.itemName}>
          {facts.itemName}
        </span>
        <span className="text-gray-300" aria-hidden>·</span>
        <span className="font-mono text-gray-500">{facts.sku}</span>
        <span className="text-gray-300" aria-hidden>·</span>
        <span className="inline-flex shrink-0 items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-semibold leading-none text-amber-800">
          {t.admin.orderSkuPiecesBadge(facts.quantity)}
        </span>
      </div>
      {facts.fileCount === 0 && <p className="text-amber-700">{t.sublimation.workshop.noFiles}</p>}
    </div>
  );
}
