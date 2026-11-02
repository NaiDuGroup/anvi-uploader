"use client";

import { Plus, X } from "lucide-react";
import { DTF_GARMENT_SOURCES, DTF_MAX_ZONES, DTF_PLACEMENTS, type DtfPlacement } from "@/lib/dtf/dtfConstants";
import type { DtfCatalogJson, DtfGarmentJson } from "@/lib/dtf/dtfDto";
import {
  dtfPresetsForGarment,
  newDtfZoneId,
  withDtfGarment,
  type DtfDraft,
  type DtfQuote,
  type DtfZoneDraft,
} from "@/lib/dtf/dtfDraft";
import { localizedDtfName } from "@/lib/dtf/stockGarments";
import type { DtfCustomerType } from "@/lib/dtf/types";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import { UvItemPicker } from "@/app/admin/_components/uv/UvItemPicker";
import type { StockPickerItem } from "@/app/admin/_components/uv/StockItemPickerModal";
import { cn } from "@/lib/utils";

const CUSTOM_PRESET = "custom";

/** Compact trigger so MenuSelect fits the dense DTF row. */
const selectButtonClass = "min-h-8 px-2.5 text-[13px]";
const numberClass =
  "h-8 w-14 rounded-lg border border-gray-200 bg-white px-1.5 text-center text-[13px] tabular-nums shadow-sm focus:border-gray-300 focus:outline-none";

interface GarmentGroup {
  code: string;
  label: string;
  garments: DtfGarmentJson[];
}

/** Picker groups by stock category, keeping catalog order. */
function groupGarmentsByCategory(garments: readonly DtfGarmentJson[], locale: string): GarmentGroup[] {
  const groups = new Map<string, GarmentGroup>();
  for (const g of garments) {
    let group: GarmentGroup | undefined = groups.get(g.categoryCode);
    if (!group) {
      group = { code: g.categoryCode, label: localizedDtfName(g.categoryNames, locale), garments: [] };
      groups.set(g.categoryCode, group);
    }
    group.garments.push(g);
  }
  return [...groups.values()];
}

function garmentOptionLabel(g: DtfGarmentJson, locale: string): string {
  return [localizedDtfName(g.itemNames, locale), g.colorName].filter((p) => p).join(" · ");
}

function formatMoney(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

export interface DtfLineEditorProps {
  value: DtfDraft;
  onChange: (next: DtfDraft) => void;
  catalog: DtfCatalogJson;
  quote: DtfQuote;
  /** Retail or dealer: dealers see their format prices and may take a transfer unpressed. */
  customerType?: DtfCustomerType;
  t: TranslationDictionary;
  locale: string;
  /** Garment source switch; off when the product menu already chose stock or the client's garment. */
  showSourceToggle?: boolean;
  /**
   * Garment as a photo button that opens the page's stock picker (every
   * category and print method) instead of the garment list; `pickerItems`
   * must contain the garments by their ids.
   */
  onOpenGarmentPicker?: () => void;
  pickerItems?: readonly StockPickerItem[];
  /** Other DTF rows of the order this one may share its layout with (run prices count them together). */
  layoutChoices?: readonly DtfLayoutChoice[];
  /** Row whose layout this one carries; null = its own. */
  sameLayoutAs?: string | null;
  onSameLayoutChange?: (otherId: string | null) => void;
}

export interface DtfLayoutChoice {
  id: string;
  /** 1-based row number in the order. */
  position: number;
  label: string | null;
}

const OWN_LAYOUT = "__own";

export function DtfLineEditor({
  value,
  onChange,
  catalog,
  quote,
  customerType = "retail",
  t,
  locale,
  showSourceToggle = true,
  onOpenGarmentPicker,
  pickerItems,
  layoutChoices = [],
  sameLayoutAs = null,
  onSameLayoutChange,
}: DtfLineEditorProps) {
  const e = t.dtf.editor;
  const garment: DtfGarmentJson | undefined =
    value.garmentSource === "stock"
      ? catalog.garments.find((g) => g.id === value.garmentProductId)
      : undefined;
  const fittingPresets = dtfPresetsForGarment(catalog.presets, garment);
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
        {
          id: newDtfZoneId(),
          placement,
          presetId: fittingPresets[0]?.id ?? null,
          // No format small enough (a cap): start from the item's largest print.
          widthStr: fittingPresets.length === 0 && garment?.maxPrint ? String(garment.maxPrint.widthCm) : "",
          heightStr: fittingPresets.length === 0 && garment?.maxPrint ? String(garment.maxPrint.heightCm) : "",
        },
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

  const garmentOptions: MenuSelectOption<string>[] = groupGarmentsByCategory(catalog.garments, locale).flatMap(
    (group) => group.garments.map((g) => ({ value: g.id, label: garmentOptionLabel(g, locale), description: group.label })),
  );
  const placementOptions: MenuSelectOption<DtfPlacement>[] = DTF_PLACEMENTS.map((p) => ({
    value: p,
    label: t.dtf.placements[p],
  }));
  const isDealer: boolean = customerType === "dealer";
  const presetOptions: MenuSelectOption<string>[] = [
    ...fittingPresets.map((p) => ({
      value: p.id,
      label: `${p.label} · ${formatMoney(isDealer && p.dealerPrice != null ? p.dealerPrice : p.retailPrice, locale)}`,
    })),
    { value: CUSTOM_PRESET, label: e.customSize },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-2 py-0.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5">
        {showSourceToggle && (
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="radiogroup" aria-label={e.source}>
            {DTF_GARMENT_SOURCES.map((source) => (
              <button
                key={source}
                type="button"
                role="radio"
                aria-checked={value.garmentSource === source}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  value.garmentSource === source
                    ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200"
                    : "text-gray-500 hover:text-gray-800",
                )}
                onClick={() => onChange(withDtfGarment(value, catalog, source, value.garmentProductId))}
              >
                {t.dtf.sources[source]}
              </button>
            ))}
          </div>
        )}
        {value.garmentSource === "stock" &&
          (catalog.garments.length === 0 ? (
            <span className="text-xs text-amber-700">{e.noGarments}</span>
          ) : onOpenGarmentPicker && pickerItems ? (
            <UvItemPicker
              className="w-full max-w-md"
              items={pickerItems}
              value={value.garmentProductId}
              onChange={(next) => onChange(withDtfGarment(value, catalog, "stock", next))}
              onOpen={onOpenGarmentPicker}
              t={t}
              locale={locale}
            />
          ) : (
            <MenuSelect<string>
              ariaLabel={e.garment}
              className="w-auto min-w-[12rem] max-w-full flex-1"
              buttonClassName={selectButtonClass}
              value={value.garmentProductId ?? ""}
              options={garmentOptions}
              onChange={(next) => onChange(withDtfGarment(value, catalog, "stock", next))}
              popoverMinWidthPx={280}
              searchable={garmentOptions.length > 8}
            />
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
          const zonePreset = catalog.presets.find((p) => p.id === (zoneData?.presetId ?? z.presetId));
          const canNoPress: boolean =
            isDealer && value.garmentSource === "client" && zonePreset?.dealerNoPressPrice != null;
          return (
            <div key={z.id} className="flex flex-wrap items-center gap-1">
              <MenuSelect<DtfPlacement>
                ariaLabel={e.placement}
                className="w-36"
                buttonClassName={selectButtonClass}
                value={z.placement}
                options={placementOptions}
                onChange={(next) => setZone(i, { placement: next })}
                popoverMinWidthPx={180}
              />
              <MenuSelect<string>
                ariaLabel={e.preset}
                className="w-40"
                buttonClassName={selectButtonClass}
                value={z.presetId ?? CUSTOM_PRESET}
                options={presetOptions}
                onChange={(next) => setZone(i, { presetId: next === CUSTOM_PRESET ? null : next })}
                popoverMinWidthPx={200}
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
              {(canNoPress || z.noPress) && (
                <label className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-gray-300"
                    checked={z.noPress === true}
                    onChange={(ev) => setZone(i, { noPress: ev.target.checked || undefined })}
                  />
                  {e.noPress}
                </label>
              )}
              {zoneData && (
                <span className="text-[11px] text-gray-500">
                  {zoneData.customSize && `${zoneData.presetLabel} · `}
                  {zoneData.unitIncludedCreditMdl > 0
                    ? zoneData.unitPrintPriceMdl === 0
                      ? e.includedInGarment
                      : `${zoneData.unitPrintPriceMdl > 0 ? "+" : "−"}${formatMoney(Math.abs(zoneData.unitPrintPriceMdl), locale)} ${e.toItemPrice}`
                    : `+${formatMoney(zoneData.unitPrintPriceMdl, locale)}`}
                  {(zoneData.runDiscountPct ?? 0) > 0 && ` · ${e.runDiscount(zoneData.runDiscountPct ?? 0)}`}
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
        {garment?.maxPrint && (
          <p className="text-[11px] text-gray-500">
            {e.maxPrint(garment.maxPrint.widthCm, garment.maxPrint.heightCm)}
          </p>
        )}
        {value.zones.length < DTF_MAX_ZONES && (
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

      {onSameLayoutChange && layoutChoices.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-500">{e.layout}</span>
          <MenuSelect<string>
            ariaLabel={e.layout}
            className="w-auto min-w-[12rem] max-w-full"
            buttonClassName={selectButtonClass}
            value={sameLayoutAs ?? OWN_LAYOUT}
            options={[
              { value: OWN_LAYOUT, label: e.layoutOwn },
              ...layoutChoices.map((c) => ({
                value: c.id,
                label: e.layoutSameAs(c.position),
                description: c.label ?? undefined,
              })),
            ]}
            onChange={(next) => onSameLayoutChange(next === OWN_LAYOUT ? null : next)}
            popoverMinWidthPx={240}
          />
        </div>
      )}

      {data ? (
        <div className="rounded-md bg-gray-50 px-2 py-1.5 text-[12px] leading-snug text-gray-600">
          <p>
            {e.pieces(data.quantity)}
            {data.runQuantity != null && ` · ${e.layoutRun(data.runQuantity)}`}
            {data.pricing.tierMinQty != null && ` · ${e.tier(data.pricing.tierMinQty)}`}
            {` · ${e.film(formatMoney(data.consumption.filmLinearMeters, locale))}`}
          </p>
          <p>
            {data.pricing.garmentSellTotalMdl > 0 &&
              `${e.garmentTotal} ${formatMoney(data.pricing.garmentSellTotalMdl, locale)}`}
            {data.pricing.printSellTotalMdl > 0 &&
              ` · ${e.printTotal} ${formatMoney(data.pricing.printSellTotalMdl, locale)}`}
            {data.pricing.printSellTotalMdl < 0 &&
              ` · ${e.smallerPrint} −${formatMoney(-data.pricing.printSellTotalMdl, locale)}`}
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
          <p className="text-[11px] text-gray-500">
            {e.cost}:{" "}
            {[
              data.costs.garmentCostMdl > 0 && `${e.costGarment} ${formatMoney(data.costs.garmentCostMdl, locale)}`,
              `${e.costFilm} ${formatMoney(data.costs.filmCostMdl, locale)}`,
              `${e.costInk} ${formatMoney(data.costs.inkCostMdl, locale)}`,
              `${e.costPowder} ${formatMoney(data.costs.powderCostMdl, locale)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
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
