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
import type { UvLineData } from "@/lib/uv/types";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import { marginPercentOnCostBasis, sellOnCostBasis } from "@/lib/accounting/vatBasis";
import { cn } from "@/lib/utils";

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
  /** Purchase costs are stored with VAT (accounting setting); margin is compared on the same basis. */
  costsIncludeVat?: boolean;
}

/** Label / value row of the profit breakdown (same layout as the large-format panel). */
function Row({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <>
      <span className={className}>{label}</span>
      <span className={cn("text-right tabular-nums", className)}>{value}</span>
    </>
  );
}

export function UvLineEditor({ value, onChange, catalog, quote, t, locale, costsIncludeVat = true }: UvLineEditorProps) {
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
    onChange({ ...value, zones: [...value.zones, newUvZoneDraft(placement)] });
  }

  const data = quote.ok ? quote.data : null;

  const placementOptions: MenuSelectOption<UvPlacement>[] = UV_PLACEMENTS.map((p) => ({
    value: p,
    label: t.uv.placements[p],
  }));
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

      <div className="flex flex-col gap-1" aria-label={e.zones}>
        {value.zones.map((z, i) => {
          const zoneData = data?.zones.find((dz) => dz.id === z.id);
          const sizeFromItem: boolean = value.source === "stock" && i === 0 && item?.printArea != null;
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
              {sizeFromItem && item?.printArea ? (
                <span className="rounded-lg bg-gray-100 px-2 py-1 text-xs tabular-nums text-gray-700">
                  {formatMoney(item.printArea.widthCm, locale)}×{formatMoney(item.printArea.heightCm, locale)} см
                  <span className="ml-1 text-gray-500">· {e.sizeFromItem}</span>
                </span>
              ) : (
                <>
                  <input
                    aria-label={e.widthCm}
                    placeholder={e.widthCm}
                    inputMode="decimal"
                    className={cn(numberClass, !z.widthStr.trim() && "border-amber-300")}
                    value={z.widthStr}
                    onChange={(ev) => setZone(i, { widthStr: ev.target.value })}
                  />
                  <span className="text-gray-400">×</span>
                  <input
                    aria-label={e.heightCm}
                    placeholder={e.heightCm}
                    inputMode="decimal"
                    className={cn(numberClass, !z.heightStr.trim() && "border-amber-300")}
                    value={z.heightStr}
                    onChange={(ev) => setZone(i, { heightStr: ev.target.value })}
                  />
                  <span className="text-xs text-gray-400">см</span>
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
              <label className="inline-flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-gray-300"
                  checked={z.primer}
                  onChange={(ev) => setZone(i, { primer: ev.target.checked })}
                />
                {e.primer}
              </label>
              {zoneData && (
                <span className="text-[11px] text-gray-500">
                  {zoneData.includedInItem
                    ? e.includedInItem
                    : e.zonePrice(formatMoney(zoneData.unitPrintPriceMdl, locale))}
                  {zoneData.unitWhiteSurchargeMdl > 0 &&
                    ` · ${e.whiteTotal} +${formatMoney(zoneData.unitWhiteSurchargeMdl, locale)}`}
                  {zoneData.unitVarnishSurchargeMdl > 0 &&
                    ` · ${e.varnishTotal} +${formatMoney(zoneData.unitVarnishSurchargeMdl, locale)}`}
                  {(zoneData.unitPrimerSurchargeMdl ?? 0) > 0 &&
                    ` · ${e.primerTotal} +${formatMoney(zoneData.unitPrimerSurchargeMdl ?? 0, locale)}`}
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

      {data ? (
        <UvProfitPanel data={data} t={t} locale={locale} costsIncludeVat={costsIncludeVat} />
      ) : !quote.ok && quote.code === "uv_price_not_set" ? (
        <p className="text-xs text-amber-700">
          {e.priceNotSet}{" "}
          <Link href={printMethodPagePath(PrintMethodCode.Uv)} className="font-medium underline hover:text-amber-900">
            {e.priceNotSetLink}
          </Link>
        </p>
      ) : (
        !quote.ok && quote.code !== "uv_incomplete" && <p className="text-xs text-red-600">{t.uv.errors[quote.code]}</p>
      )}
    </div>
  );
}

/**
 * Price and profit of a UV line, laid out like the large-format panel: what the
 * client pays, then purchase + ink, margin and gross. `sell` overrides the item
 * price when the operator typed the line price by hand (designer rows).
 */
export function UvProfitPanel({
  data,
  t,
  locale,
  costsIncludeVat = true,
  sell,
}: {
  data: UvLineData;
  t: TranslationDictionary;
  locale: string;
  costsIncludeVat?: boolean;
  sell?: { unitPriceMdl: number; manual: boolean } | null;
}) {
  const e = t.uv.editor;
  const cur: string = t.admin.currency;
  const money = (n: number): string => `${formatMoney(n, locale)} ${cur}`;
  const p = data.pricing;
  const c = data.costs;
  const unitItemPriceMdl: number = sell ? sell.unitPriceMdl : p.unitItemPriceMdl;
  const itemSellTotalMdl: number = sell ? Math.round(sell.unitPriceMdl * data.quantity * 100) / 100 : p.itemSellTotalMdl;
  const totalSellPriceMdl: number = sell ? itemSellTotalMdl : p.totalSellPriceMdl;
  const inkMl: number = data.consumption.cmykMl + data.consumption.whiteMl + data.consumption.varnishMl;
  const inkCost: number = c.cmykInkCostMdl + c.whiteInkCostMdl + c.varnishCostMdl;
  const primerMl: number = data.consumption.primerMl ?? 0;
  const profit: number = sellOnCostBasis(totalSellPriceMdl, costsIncludeVat) - c.totalCostMdl;
  const margin: number = marginPercentOnCostBasis(totalSellPriceMdl, c.totalCostMdl, costsIncludeVat);
  const costMissing: boolean = data.source === "stock" && !(c.unitItemCostMdl > 0);
  const itemNote: string | null = sell?.manual
    ? null
    : p.itemPriceSource === "dealer"
      ? e.dealerPrice
      : p.tierMinQty != null
        ? e.tier(p.tierMinQty)
        : null;
  return (
    <div className="grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 rounded-md bg-gray-50 px-3 py-2 text-[12px] leading-snug text-gray-700">
      {itemSellTotalMdl > 0 && (
        <Row
          label={
            <>
              {e.itemTotal} · {data.quantity} × {formatMoney(unitItemPriceMdl, locale)}
              {itemNote && <span className="text-gray-500"> ({itemNote})</span>}
            </>
          }
          value={money(itemSellTotalMdl)}
        />
      )}
      {!sell && (
        <>
          {p.printSellTotalMdl > 0 && <Row label={e.printTotal} value={money(p.printSellTotalMdl)} />}
          {p.whiteSurchargeTotalMdl > 0 && <Row label={e.whiteTotal} value={money(p.whiteSurchargeTotalMdl)} />}
          {p.varnishSurchargeTotalMdl > 0 && <Row label={e.varnishTotal} value={money(p.varnishSurchargeTotalMdl)} />}
          {(p.primerSurchargeTotalMdl ?? 0) > 0 && <Row label={e.primerTotal} value={money(p.primerSurchargeTotalMdl ?? 0)} />}
          {p.setupFeeMdl > 0 && <Row label={e.setupFee} value={money(p.setupFeeMdl)} />}
          {p.minimumLineUpliftMdl > 0 && <Row label={e.minimumUplift} value={money(p.minimumLineUpliftMdl)} />}
        </>
      )}
      <Row
        className="font-semibold text-gray-900"
        label={`${e.total} · ${e.pieces(data.quantity)}`}
        value={money(totalSellPriceMdl)}
      />
      {data.source === "stock" && (
        <Row
          className="mt-1"
          label={
            <>
              {e.itemCost}
              {costMissing && <span className="ml-1 text-amber-700">· {e.itemCostMissing}</span>}
            </>
          }
          value={money(c.itemCostMdl)}
        />
      )}
      <Row className={data.source === "stock" ? undefined : "mt-1"} label={e.inkMl} value={formatMoney(inkMl, locale)} />
      <Row label={e.inkCost} value={money(inkCost)} />
      {primerMl > 0 && (
        <>
          <Row label={e.primerMl} value={formatMoney(primerMl, locale)} />
          <Row label={e.primerCost} value={money(c.primerCostMdl ?? 0)} />
        </>
      )}
      <Row className="font-medium" label={e.directCost} value={money(c.totalCostMdl)} />
      <Row label={e.margin} value={<span className="text-emerald-800">{margin}%</span>} />
      <Row label={e.grossProfit} value={<span className="text-emerald-800">{money(Math.round(profit))}</span>} />
    </div>
  );
}
