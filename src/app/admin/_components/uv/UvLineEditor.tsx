"use client";

import Link from "next/link";
import { Plus, X } from "lucide-react";
import { localizedDtfName } from "@/lib/dtf/stockGarments";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { PrintMethodCode, printMethodPagePath } from "@/lib/printMethods/methods";
import {
  UV_ITEM_SOURCES,
  UV_MAX_DESCRIPTION,
  UV_MAX_NOTES,
  UV_MAX_PLACEMENT_LABEL,
  UV_MAX_WHITE_LAYERS,
  UV_MAX_ZONES,
  UV_PLACEMENTS,
  type UvPlacement,
} from "@/lib/uv/uvConstants";
import type { UvCatalogJson, UvStockItemJson } from "@/lib/uv/dto";
import { newUvZoneDraft, uvDraftQuantity, withUvItem, type UvDraft, type UvQuote, type UvZoneDraft } from "@/lib/uv/uvDraft";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import { cn } from "@/lib/utils";

const CUSTOM_PRESET = "custom";

/** Compact trigger so MenuSelect fits the dense UV row (same as the DTF editor). */
const selectButtonClass = "min-h-8 px-2.5 text-[13px]";
const numberClass =
  "h-8 w-14 rounded-lg border border-gray-200 bg-white px-1.5 text-center text-[13px] tabular-nums shadow-sm focus:border-gray-300 focus:outline-none";
const textClass =
  "h-8 min-w-0 rounded-lg border border-gray-200 bg-white px-2 text-[13px] shadow-sm focus:border-gray-300 focus:outline-none";

const WHITE_LAYER_VALUES: number[] = Array.from({ length: UV_MAX_WHITE_LAYERS + 1 }, (_, i) => i);

function itemOptionLabel(item: UvStockItemJson, locale: string): string {
  return [localizedDtfName(item.itemNames, locale), item.variantLabel].filter((p) => p).join(" · ");
}

function formatMoney(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

/** Stock picker options grouped by category (catalog order is already by category). */
function itemOptions(items: readonly UvStockItemJson[], locale: string): MenuSelectOption<string>[] {
  return items.map((item) => ({
    value: item.id,
    label: itemOptionLabel(item, locale),
    description: [localizedDtfName(item.categoryNames, locale), item.sku].filter((p) => p).join(" · "),
  }));
}

export interface UvLineEditorProps {
  value: UvDraft;
  onChange: (next: UvDraft) => void;
  catalog: UvCatalogJson;
  quote: UvQuote;
  t: TranslationDictionary;
  locale: string;
}

export function UvLineEditor({ value, onChange, catalog, quote, t, locale }: UvLineEditorProps) {
  const e = t.uv.editor;
  const item: UvStockItemJson | undefined =
    value.source === "stock" ? catalog.items.find((i) => i.id === value.variantId) : undefined;
  const qty: number = uvDraftQuantity(value);
  const stock: number | undefined = item ? item.stockQuantity : undefined;
  const short: number = stock === undefined ? 0 : Math.max(0, qty - Math.max(0, stock));

  function setZone(index: number, patch: Partial<UvZoneDraft>): void {
    onChange({ ...value, zones: value.zones.map((z, i) => (i === index ? { ...z, ...patch } : z)) });
  }

  function addZone(): void {
    const used = new Set<UvPlacement>(value.zones.map((z) => z.placement));
    const placement: UvPlacement = UV_PLACEMENTS.find((p) => !used.has(p)) ?? "other";
    onChange({ ...value, zones: [...value.zones, newUvZoneDraft(catalog, placement)] });
  }

  const data = quote.ok ? quote.data : null;
  const noPresets: boolean = catalog.presets.length === 0;

  const placementOptions: MenuSelectOption<UvPlacement>[] = UV_PLACEMENTS.map((p) => ({
    value: p,
    label: t.uv.placements[p],
  }));
  const presetOptions: MenuSelectOption<string>[] = [
    ...catalog.presets.map((p) => ({
      value: p.id,
      label: `${p.label} · ${formatMoney(p.retailPrice, locale)}`,
      description: `${formatMoney(p.widthCm, locale)}×${formatMoney(p.heightCm, locale)} см`,
    })),
    { value: CUSTOM_PRESET, label: e.customSize },
  ];
  const whiteOptions: MenuSelectOption<number>[] = WHITE_LAYER_VALUES.map((n) => ({
    value: n,
    label: e.whiteLayerOption(n),
  }));
  const stockOptions: MenuSelectOption<string>[] = itemOptions(catalog.items, locale);

  return (
    <div className="flex min-w-0 flex-col gap-2 py-0.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="radiogroup" aria-label={e.source}>
          {UV_ITEM_SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              role="radio"
              aria-checked={value.source === source}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                value.source === source
                  ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200"
                  : "text-gray-500 hover:text-gray-800",
              )}
              onClick={() => onChange(withUvItem(value, catalog, source, value.variantId))}
            >
              {t.uv.sources[source]}
            </button>
          ))}
        </div>
        {value.source === "stock" &&
          (catalog.items.length === 0 ? (
            <span className="text-xs text-amber-700">{e.noItems}</span>
          ) : (
            <MenuSelect<string>
              ariaLabel={e.item}
              className="w-auto min-w-[12rem] max-w-full flex-1"
              buttonClassName={selectButtonClass}
              value={value.variantId ?? ""}
              options={stockOptions}
              onChange={(next) => onChange(withUvItem(value, catalog, "stock", next))}
              popoverMinWidthPx={300}
              searchable={stockOptions.length > 8}
            />
          ))}
      </div>

      {value.source === "client" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            aria-label={e.description}
            placeholder={`${e.description}: ${e.descriptionPlaceholder}`}
            maxLength={UV_MAX_DESCRIPTION}
            className={cn(textClass, "w-64 max-w-full flex-1", !value.description.trim() && "border-amber-300")}
            value={value.description}
            onChange={(ev) => onChange({ ...value, description: ev.target.value })}
          />
          <input
            aria-label={e.notes}
            placeholder={`${e.notes}: ${e.notesPlaceholder}`}
            maxLength={UV_MAX_NOTES}
            className={cn(textClass, "w-56 max-w-full flex-1")}
            value={value.notes}
            onChange={(ev) => onChange({ ...value, notes: ev.target.value })}
          />
        </div>
      )}

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

      {noPresets ? (
        <p className="text-xs text-amber-700">
          {e.noPresets}{" "}
          <Link href={printMethodPagePath(PrintMethodCode.Uv)} className="font-medium underline hover:text-amber-900">
            {e.noPresetsLink}
          </Link>
        </p>
      ) : (
        <div className="flex flex-col gap-1" aria-label={e.zones}>
          {value.zones.map((z, i) => {
            const zoneData = data?.zones.find((dz) => dz.id === z.id);
            return (
              <div key={z.id} className="flex flex-wrap items-center gap-1">
                <MenuSelect<UvPlacement>
                  ariaLabel={e.placement}
                  className="w-36"
                  buttonClassName={selectButtonClass}
                  value={z.placement}
                  options={placementOptions}
                  onChange={(next) => setZone(i, { placement: next })}
                  popoverMinWidthPx={180}
                />
                {z.placement === "other" && (
                  <input
                    aria-label={e.placementLabel}
                    placeholder={e.placementLabel}
                    maxLength={UV_MAX_PLACEMENT_LABEL}
                    className={cn(textClass, "w-32", !z.placementLabel.trim() && "border-amber-300")}
                    value={z.placementLabel}
                    onChange={(ev) => setZone(i, { placementLabel: ev.target.value })}
                  />
                )}
                <MenuSelect<string>
                  ariaLabel={e.preset}
                  className="w-40"
                  buttonClassName={selectButtonClass}
                  value={z.presetId ?? CUSTOM_PRESET}
                  options={presetOptions}
                  onChange={(next) => setZone(i, { presetId: next === CUSTOM_PRESET ? null : next })}
                  popoverMinWidthPx={220}
                />
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
                <MenuSelect<number>
                  ariaLabel={e.whiteLayers}
                  className="w-32"
                  buttonClassName={selectButtonClass}
                  value={z.whiteLayers}
                  options={whiteOptions}
                  onChange={(next) => setZone(i, { whiteLayers: next })}
                  popoverMinWidthPx={140}
                />
                <label className="inline-flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-gray-300"
                    checked={z.varnish}
                    onChange={(ev) => setZone(i, { varnish: ev.target.checked })}
                  />
                  {e.varnish}
                </label>
                {zoneData && (
                  <span className="text-[11px] text-gray-500">
                    {zoneData.customSize && `${zoneData.presetLabel} · `}
                    {zoneData.unitIncludedCreditMdl > 0 && zoneData.unitPrintPriceMdl === 0
                      ? e.includedInItem
                      : `${e.printTotal} +${formatMoney(zoneData.unitPrintPriceMdl, locale)}`}
                    {zoneData.unitWhiteSurchargeMdl > 0 &&
                      ` · ${e.whiteTotal} +${formatMoney(zoneData.unitWhiteSurchargeMdl, locale)}`}
                    {zoneData.unitVarnishSurchargeMdl > 0 &&
                      ` · ${e.varnishTotal} +${formatMoney(zoneData.unitVarnishSurchargeMdl, locale)}`}
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
          {value.zones.length < UV_MAX_ZONES && (
            <button
              type="button"
              className="inline-flex w-fit items-center gap-1 text-xs font-medium text-gold-text hover:text-gold-dark"
              onClick={addZone}
            >
              <Plus className="h-3.5 w-3.5" />
              {e.addZone}
            </button>
          )}
        </div>
      )}

      {data ? (
        <div className="rounded-md bg-gray-50 px-2 py-1.5 text-[12px] leading-snug text-gray-600">
          <p>
            {e.pieces(data.quantity)}
            {data.pricing.tierMinQty != null && ` · ${e.tier(data.pricing.tierMinQty)}`}
            {` · ${e.ink(
              formatMoney(data.consumption.cmykMl, locale),
              formatMoney(data.consumption.whiteMl, locale),
              formatMoney(data.consumption.varnishMl, locale),
            )}`}
          </p>
          <p>
            {[
              data.pricing.itemSellTotalMdl > 0 && `${e.itemTotal} ${formatMoney(data.pricing.itemSellTotalMdl, locale)}`,
              data.pricing.printSellTotalMdl > 0 && `${e.printTotal} ${formatMoney(data.pricing.printSellTotalMdl, locale)}`,
              data.pricing.whiteSurchargeTotalMdl > 0 &&
                `${e.whiteTotal} ${formatMoney(data.pricing.whiteSurchargeTotalMdl, locale)}`,
              data.pricing.varnishSurchargeTotalMdl > 0 &&
                `${e.varnishTotal} ${formatMoney(data.pricing.varnishSurchargeTotalMdl, locale)}`,
              data.pricing.setupFeeMdl > 0 && `${e.setupFee} ${formatMoney(data.pricing.setupFeeMdl, locale)}`,
              data.pricing.minimumLineUpliftMdl > 0 &&
                `${e.minimumUplift} ${formatMoney(data.pricing.minimumLineUpliftMdl, locale)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="font-semibold text-gray-900">
            {e.total} {formatMoney(data.pricing.totalSellPriceMdl, locale)} {t.admin.currency}
            <span className="ml-2 font-normal text-gray-500">
              {e.cost} {formatMoney(data.costs.totalCostMdl, locale)} · {e.profit}{" "}
              {formatMoney(data.estimatedProfitMdl, locale)}
            </span>
          </p>
        </div>
      ) : (
        !quote.ok &&
        quote.code !== "uv_incomplete" &&
        !(noPresets && quote.code === "uv_price_list_empty") && (
          <p className="text-xs text-red-600">{t.uv.errors[quote.code]}</p>
        )
      )}
    </div>
  );
}
