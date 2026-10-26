"use client";

import Link from "next/link";
import { localizedDtfName } from "@/lib/dtf/stockGarments";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { PrintMethodCode, printMethodPagePath } from "@/lib/printMethods/methods";
import { sublimationNormFor } from "@/lib/printMethods/sublimationSettings";
import type { SublimationCatalogJson, SublimationStockItemJson } from "@/lib/sublimation/dto";
import { sublimationDraftQuantity, type SublimationDraft, type SublimationQuote } from "@/lib/sublimation/sublimationDraft";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import { cn } from "@/lib/utils";

/** Compact trigger so MenuSelect fits the dense order row (same as the UV / DTF editors). */
const selectButtonClass = "min-h-8 px-2.5 text-[13px]";
const numberClass =
  "h-8 w-14 rounded-lg border border-gray-200 bg-white px-1.5 text-center text-[13px] tabular-nums shadow-sm focus:border-gray-300 focus:outline-none";

function formatMoney(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

function itemOptionLabel(item: SublimationStockItemJson, locale: string): string {
  return [localizedDtfName(item.itemNames, locale), item.variantLabel].filter((p) => p).join(" · ");
}

export interface SublimationLineEditorProps {
  value: SublimationDraft;
  onChange: (next: SublimationDraft) => void;
  catalog: SublimationCatalogJson;
  quote: SublimationQuote;
  t: TranslationDictionary;
  locale: string;
}

/**
 * «Сублимация» order row: blank from stock (category, then item / variant),
 * quantity; price per piece from the blank's run-size tiers (print included).
 */
export function SublimationLineEditor({ value, onChange, catalog, quote, t, locale }: SublimationLineEditorProps) {
  const e = t.sublimation.editor;
  const item: SublimationStockItemJson | undefined = catalog.items.find((i) => i.id === value.variantId);
  const qty: number = sublimationDraftQuantity(value);
  const stock: number | undefined = item?.stockQuantity;
  const short: number = stock === undefined ? 0 : Math.max(0, qty - Math.max(0, stock));

  if (catalog.items.length === 0) {
    return <p className="py-1 text-xs text-amber-700">{e.noItems}</p>;
  }

  const categoryCode: string = item?.categoryCode ?? catalog.items[0]!.categoryCode;
  const categoryOptions: MenuSelectOption<string>[] = [];
  for (const i of catalog.items) {
    if (!categoryOptions.some((o) => o.value === i.categoryCode)) {
      categoryOptions.push({ value: i.categoryCode, label: localizedDtfName(i.categoryNames, locale) });
    }
  }
  const itemOptions: MenuSelectOption<string>[] = catalog.items
    .filter((i) => i.categoryCode === categoryCode)
    .map((i) => ({
      value: i.id,
      label: itemOptionLabel(i, locale),
      description: [i.sku, i.priceTiers[0] ? `${formatMoney(i.priceTiers[0].priceMdl, locale)} ${t.admin.currency}` : null]
        .filter(Boolean)
        .join(" · "),
    }));
  const norm = sublimationNormFor(catalog.settings, categoryCode);
  const noNorms: boolean = norm.paperSheets === 0 && norm.tapeCm === 0 && norm.inkMl === 0;
  const data = quote.ok ? quote.data : null;

  return (
    <div className="flex min-w-0 flex-col gap-2 py-0.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <MenuSelect<string>
          ariaLabel={e.item}
          className="w-40"
          buttonClassName={selectButtonClass}
          value={categoryCode}
          options={categoryOptions}
          onChange={(code) => {
            const first = catalog.items.find((i) => i.categoryCode === code);
            onChange({ ...value, variantId: first?.id ?? null });
          }}
          popoverMinWidthPx={200}
        />
        <MenuSelect<string>
          ariaLabel={e.item}
          className="w-auto min-w-[12rem] max-w-full flex-1"
          buttonClassName={selectButtonClass}
          value={value.variantId ?? ""}
          options={itemOptions}
          onChange={(next) => onChange({ ...value, variantId: next })}
          popoverMinWidthPx={300}
          searchable={itemOptions.length > 8}
        />
      </div>

      <label className="flex w-fit flex-col items-center gap-0.5">
        <span className="text-[11px] font-semibold text-gray-600">{e.quantity}</span>
        <input
          inputMode="numeric"
          className={cn(numberClass, short > 0 && "border-amber-400 bg-amber-50")}
          value={value.quantityStr}
          placeholder="0"
          onChange={(ev) => onChange({ ...value, quantityStr: ev.target.value.replace(/\D/g, "") })}
        />
        {stock !== undefined && (
          <span className={cn("text-[10px] leading-none", short > 0 ? "text-amber-700" : "text-gray-400")}>
            {short > 0 ? e.shortage(short) : e.inStock(stock)}
          </span>
        )}
      </label>

      {data ? (
        <div className="rounded-md bg-gray-50 px-2 py-1.5 text-[12px] leading-snug text-gray-600">
          <p>
            {e.pieces(data.quantity)} · {e.unitPrice} {formatMoney(data.pricing.unitPriceMdl, locale)} (
            {data.pricing.priceSource === "dealer" ? e.dealerPrice : e.tier(data.pricing.tierMinQty)})
            {!noNorms &&
              ` · ${e.usage(
                formatMoney(data.consumption.paperSheets, locale),
                formatMoney(data.consumption.tapeM, locale),
                formatMoney(data.consumption.inkMl, locale),
              )}`}
          </p>
          <p className="font-semibold text-gray-900">
            {e.total} {formatMoney(data.pricing.totalSellPriceMdl, locale)} {t.admin.currency}
            <span className="ml-2 font-normal text-gray-500">
              {e.cost} {formatMoney(data.costs.totalCostMdl, locale)} · {e.profit}{" "}
              {formatMoney(data.estimatedProfitMdl, locale)}
            </span>
          </p>
          {noNorms && (
            <p className="text-[11px] text-amber-700">
              {e.noNorms}{" "}
              <Link
                href={printMethodPagePath(PrintMethodCode.Sublimation)}
                className="font-medium underline hover:text-amber-900"
              >
                {e.normsLink}
              </Link>
            </p>
          )}
        </div>
      ) : (
        !quote.ok &&
        quote.code !== "subl_incomplete" && <p className="text-xs text-red-600">{t.sublimation.errors[quote.code]}</p>
      )}
    </div>
  );
}
