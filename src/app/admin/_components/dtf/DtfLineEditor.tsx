"use client";

import { Plus, X } from "lucide-react";
import { DTF_GARMENT_SOURCES, DTF_MAX_ZONES, DTF_PLACEMENTS, type DtfPlacement } from "@/lib/dtf/dtfConstants";
import type { DtfCatalogJson, GarmentProductJson } from "@/lib/dtf/dtfDto";
import {
  newDtfZoneId,
  withDtfGarment,
  type DtfDraft,
  type DtfQuote,
  type DtfZoneDraft,
} from "@/lib/dtf/dtfDraft";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

const CUSTOM_PRESET = "custom";

const selectClass =
  "h-8 min-w-0 rounded-md border border-gray-300 bg-white px-1.5 text-[13px] text-gray-900";
const numberClass =
  "h-8 w-14 rounded-md border border-gray-300 px-1.5 text-center text-[13px] tabular-nums";

function formatMoney(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

export interface DtfLineEditorProps {
  value: DtfDraft;
  onChange: (next: DtfDraft) => void;
  catalog: DtfCatalogJson;
  quote: DtfQuote;
  t: TranslationDictionary;
  locale: string;
}

export function DtfLineEditor({ value, onChange, catalog, quote, t, locale }: DtfLineEditorProps) {
  const e = t.dtf.editor;
  const garment: GarmentProductJson | undefined =
    value.garmentSource === "stock"
      ? catalog.garments.find((g) => g.id === value.garmentProductId)
      : undefined;
  const stockBySize = new Map<string, number>(
    garment?.variants.map((v) => [v.size.toUpperCase(), v.stockQuantity]) ?? [],
  );

  function setZone(index: number, patch: Partial<DtfZoneDraft>): void {
    onChange({
      ...value,
      zones: value.zones.map((z, i) => (i === index ? { ...z, ...patch } : z)),
    });
  }

  function addZone(): void {
    const used = new Set<DtfPlacement>(value.zones.map((z) => z.placement));
    const placement: DtfPlacement = DTF_PLACEMENTS.find((p) => !used.has(p)) ?? "other";
    onChange({
      ...value,
      zones: [
        ...value.zones,
        { id: newDtfZoneId(), placement, presetId: catalog.presets[0]?.id ?? null, widthStr: "", heightStr: "" },
      ],
    });
  }

  function setQuantity(index: number, quantityStr: string): void {
    onChange({
      ...value,
      sizes: value.sizes.map((s, i) => (i === index ? { ...s, quantityStr: quantityStr.replace(/\D/g, "") } : s)),
    });
  }

  const data = quote.ok ? quote.data : null;

  return (
    <div className="flex min-w-0 flex-col gap-2 py-0.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex overflow-hidden rounded-md border border-gray-300" role="radiogroup" aria-label={e.source}>
          {DTF_GARMENT_SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              role="radio"
              aria-checked={value.garmentSource === source}
              className={cn(
                "px-2 py-1 text-xs font-medium",
                value.garmentSource === source ? "bg-fuchsia-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50",
              )}
              onClick={() => onChange(withDtfGarment(value, catalog, source, value.garmentProductId))}
            >
              {t.dtf.sources[source]}
            </button>
          ))}
        </div>
        {value.garmentSource === "stock" &&
          (catalog.garments.length === 0 ? (
            <span className="text-xs text-amber-700">{e.noGarments}</span>
          ) : (
            <select
              aria-label={e.garment}
              className={cn(selectClass, "max-w-full flex-1")}
              value={value.garmentProductId ?? ""}
              onChange={(ev) => onChange(withDtfGarment(value, catalog, "stock", ev.target.value))}
            >
              {catalog.garments.map((g) => (
                <option key={g.id} value={g.id}>
                  {t.dtf.garmentKinds[g.kind]} · {g.name} · {g.colorName}
                </option>
              ))}
            </select>
          ))}
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label={e.sizes}>
        {value.sizes.map((s, i) => {
          const qty: number = Number.parseInt(s.quantityStr, 10) || 0;
          const stock: number | undefined = stockBySize.get(s.size.toUpperCase());
          const short: number = stock === undefined ? 0 : Math.max(0, qty - Math.max(0, stock));
          return (
            <label key={s.size} className="flex flex-col items-center gap-0.5">
              <span className="text-[11px] font-semibold text-gray-600">
                {value.garmentSource === "client" ? e.quantity : s.size}
              </span>
              <input
                inputMode="numeric"
                className={cn(numberClass, short > 0 && "border-amber-400 bg-amber-50")}
                value={s.quantityStr}
                placeholder="0"
                onChange={(ev) => setQuantity(i, ev.target.value)}
              />
              {stock !== undefined && (
                <span className={cn("text-[10px] leading-none", short > 0 ? "text-amber-700" : "text-gray-400")}>
                  {short > 0 ? e.shortage(short) : e.inStock(stock)}
                </span>
              )}
            </label>
          );
        })}
      </div>

      <div className="flex flex-col gap-1" aria-label={e.zones}>
        {value.zones.map((z, i) => {
          const zoneData = data?.zones.find((dz) => dz.id === z.id);
          return (
            <div key={z.id} className="flex flex-wrap items-center gap-1">
              <select
                aria-label={e.placement}
                className={selectClass}
                value={z.placement}
                onChange={(ev) => setZone(i, { placement: ev.target.value as DtfPlacement })}
              >
                {DTF_PLACEMENTS.map((p) => (
                  <option key={p} value={p}>
                    {t.dtf.placements[p]}
                  </option>
                ))}
              </select>
              <select
                aria-label={e.preset}
                className={selectClass}
                value={z.presetId ?? CUSTOM_PRESET}
                onChange={(ev) =>
                  setZone(i, { presetId: ev.target.value === CUSTOM_PRESET ? null : ev.target.value })
                }
              >
                {catalog.presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {formatMoney(p.retailPrice, locale)}
                  </option>
                ))}
                <option value={CUSTOM_PRESET}>{e.customSize}</option>
              </select>
              {z.presetId == null && (
                <>
                  <input
                    aria-label={e.widthCm}
                    placeholder={e.widthCm}
                    inputMode="decimal"
                    className={numberClass}
                    value={z.widthStr}
                    onChange={(ev) => setZone(i, { widthStr: ev.target.value })}
                  />
                  <span className="text-gray-400">×</span>
                  <input
                    aria-label={e.heightCm}
                    placeholder={e.heightCm}
                    inputMode="decimal"
                    className={numberClass}
                    value={z.heightStr}
                    onChange={(ev) => setZone(i, { heightStr: ev.target.value })}
                  />
                </>
              )}
              {zoneData && (
                <span className="text-[11px] text-gray-500">
                  {zoneData.customSize && `${zoneData.presetLabel} · `}
                  {zoneData.unitIncludedCreditMdl > 0 && zoneData.unitPrintPriceMdl === 0
                    ? e.includedInGarment
                    : `+${formatMoney(zoneData.unitPrintPriceMdl, locale)}`}
                </span>
              )}
              {value.zones.length > 1 && (
                <button
                  type="button"
                  aria-label={e.removeZone}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  onClick={() => onChange({ ...value, zones: value.zones.filter((_, j) => j !== i) })}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
        {value.zones.length < DTF_MAX_ZONES && (
          <button
            type="button"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-fuchsia-700 hover:text-fuchsia-900"
            onClick={addZone}
          >
            <Plus className="h-3.5 w-3.5" />
            {e.addZone}
          </button>
        )}
      </div>

      {data ? (
        <div className="rounded-md bg-gray-50 px-2 py-1.5 text-[12px] leading-snug text-gray-600">
          <p>
            {e.pieces(data.quantity)}
            {data.pricing.tierMinQty != null && ` · ${e.tier(data.pricing.tierMinQty)}`}
            {` · ${e.film(formatMoney(data.consumption.filmLinearMeters, locale))}`}
          </p>
          <p>
            {data.pricing.garmentSellTotalMdl > 0 &&
              `${e.garmentTotal} ${formatMoney(data.pricing.garmentSellTotalMdl, locale)}`}
            {data.pricing.printSellTotalMdl > 0 &&
              ` · ${e.printTotal} ${formatMoney(data.pricing.printSellTotalMdl, locale)}`}
            {data.pricing.pressSellTotalMdl > 0 &&
              ` · ${e.pressTotal} ${formatMoney(data.pricing.pressSellTotalMdl, locale)}`}
            {data.pricing.minimumLineUpliftMdl > 0 &&
              ` · ${e.minimumUplift} ${formatMoney(data.pricing.minimumLineUpliftMdl, locale)}`}
          </p>
          <p className="font-semibold text-gray-900">
            {e.total} {formatMoney(data.pricing.totalSellPriceMdl, locale)} {t.admin.currency}
            <span className="ml-2 font-normal text-gray-500">
              {e.cost} {formatMoney(data.costs.totalCostMdl, locale)} · {e.profit}{" "}
              {formatMoney(data.estimatedProfitMdl, locale)}
            </span>
          </p>
          <p className="text-[11px] text-gray-400">{e.sameLayoutHint}</p>
        </div>
      ) : (
        !quote.ok &&
        quote.code !== "dtf_incomplete" && <p className="text-xs text-red-600">{t.dtf.errors[quote.code]}</p>
      )}
    </div>
  );
}
