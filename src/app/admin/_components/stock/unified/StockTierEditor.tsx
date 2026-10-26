"use client";

import { Copy, Plus, Sparkles, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { sanitizeMoneyInput } from "@/lib/money";
import type { TierDraft } from "@/lib/stock/unified/garmentTiers";
import { ColorSwatch } from "./StockBits";

const MAX_TIER_ROWS = 10;

/** «Тиражные цены» of one colour: compact rows «от N шт → цена». */
export function StockTierEditor({
  title,
  hex,
  rows,
  disabled,
  strings: s,
  onChange,
  onFillDefaults,
  onApplyToAll,
  applyToAllLabel,
}: {
  title: string;
  hex: string | undefined;
  rows: TierDraft[];
  disabled: boolean;
  strings: TranslationDictionary["stock"];
  onChange: (rows: TierDraft[]) => void;
  /** Studio price-list defaults (DTF garments); omitted where there is no list. */
  onFillDefaults?: () => void;
  /** Omitted when there is only one colour. */
  onApplyToAll?: () => void;
  /** Label of the «apply to all» action (default: «…ко всем цветам»). */
  applyToAllLabel?: string;
}) {
  function patch(index: number, p: Partial<TierDraft>): void {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...p } : r)));
  }

  return (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
      <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-gray-800">
        <ColorSwatch hex={hex} />
        <span className="truncate">{title}</span>
      </p>

      {rows.length === 0 ? (
        <p className="mt-2 text-[11px] text-gray-500">{s.tiersEmpty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-7 shrink-0 text-right">{s.tierFrom}</span>
              <Input
                value={r.minQty}
                onChange={(e) => patch(i, { minQty: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                inputMode="numeric"
                className="h-8 w-14 shrink-0 px-2 tabular-nums"
                aria-label={`${s.tierFrom} (${s.tierPieces})`}
                disabled={disabled}
              />
              <span className="shrink-0">{s.tierPieces} →</span>
              <Input
                value={r.priceMdl}
                onChange={(e) => patch(i, { priceMdl: sanitizeMoneyInput(e.target.value, { maxIntegerDigits: 6 }) })}
                inputMode="decimal"
                placeholder="MDL"
                className="h-8 w-20 min-w-0 px-2 tabular-nums"
                aria-label={s.tierPrice}
                disabled={disabled}
              />
              <button
                type="button"
                className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label={s.tierRemoveRow}
                title={s.tierRemoveRow}
                disabled={disabled}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-medium text-gray-600">
        {rows.length < MAX_TIER_ROWS ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-gray-900"
            disabled={disabled}
            onClick={() => onChange([...rows, { minQty: rows.length === 0 ? "1" : "", priceMdl: "" }])}
          >
            <Plus className="h-3.5 w-3.5" />
            {s.tierAddRow}
          </button>
        ) : null}
        {onFillDefaults ? (
          <button type="button" className="inline-flex items-center gap-1 hover:text-gray-900" disabled={disabled} onClick={onFillDefaults}>
            <Sparkles className="h-3.5 w-3.5" />
            {s.tiersFillDefaults}
          </button>
        ) : null}
        {onApplyToAll ? (
          <button type="button" className="inline-flex items-center gap-1 hover:text-gray-900" disabled={disabled} onClick={onApplyToAll}>
            <Copy className="h-3.5 w-3.5" />
            {applyToAllLabel ?? s.tiersApplyToAllColors}
          </button>
        ) : null}
      </div>
    </div>
  );
}
