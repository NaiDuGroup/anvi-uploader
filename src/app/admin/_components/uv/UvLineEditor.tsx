"use client";

import Link from "next/link";
import { Plus, X } from "lucide-react";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { PrintMethodCode, printMethodPagePath } from "@/lib/printMethods/methods";
import {
  UV_MAX_DESCRIPTION,
  UV_MAX_NOTES,
  UV_MAX_PLACEMENT_LABEL,
  UV_MAX_WHITE_LAYERS,
  UV_MAX_ZONES,
  UV_PLACEMENTS,
  type UvPlacement,
} from "@/lib/uv/uvConstants";
import type { UvCatalogJson, UvStockItemJson } from "@/lib/uv/dto";
import type { UvSettings } from "@/lib/printMethods/uvSettings";
import { UvItemPicker } from "./UvItemPicker";
import { newUvZoneDraft, uvDraftQuantity, withUvItem, type UvDraft, type UvQuote, type UvZoneDraft } from "@/lib/uv/uvDraft";
import type { UvLineData, UvLineZone } from "@/lib/uv/types";
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

function formatMoney(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 2 });
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
  /** Opens the page's stock picker (every category and print method) instead of the UV-only one. */
  onOpenItemPicker?: () => void;
  /** Order price type: the item picker shows the dealer price to dealers. */
  customerType?: "retail" | "dealer";
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

export function UvLineEditor({
  value,
  onChange,
  catalog,
  quote,
  t,
  locale,
  costsIncludeVat = true,
  onOpenItemPicker,
  customerType,
}: UvLineEditorProps) {
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

  return (
    <div className="flex min-w-0 flex-col gap-2 py-0.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.source === "stock" &&
          (catalog.items.length === 0 ? (
            <span className="text-xs text-amber-700">{e.noItems}</span>
          ) : (
            <UvItemPicker
              customerType={customerType}
              className="w-full max-w-md"
              items={catalog.items}
              value={value.variantId}
              onChange={(next) => onChange(withUvItem(value, catalog, "stock", next))}
              onOpen={onOpenItemPicker}
              t={t}
              locale={locale}
            />
          ))}
      </div>

      {value.source === "client" && (
        <div className="flex flex-col gap-1">
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
        {!value.description.trim() && <p className="text-[11px] text-amber-700">{e.descriptionNeeded}</p>}
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
        <UvProfitPanel
          data={data}
          t={t}
          locale={locale}
          costsIncludeVat={costsIncludeVat}
          settings={catalog.settings}
        />
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

/** Section heading inside the price panel. */
function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-2 mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{children}</div>
  );
}

/** A grey explanation line under a row («0,25 м² × 400/м²»). */
function Hint({ children }: { children: React.ReactNode }) {
  return <div className="col-span-2 -mt-0.5 pl-3 text-[11px] leading-snug text-gray-500">{children}</div>;
}

function Divider() {
  return <div className="col-span-2 my-1 border-t border-gray-200" />;
}

/**
 * Price and profit of a UV line. First how the client price is built — the item,
 * each zone (area × rate per m² or the zone minimum, then underbase / varnish /
 * primer surcharges), per piece × quantity, the set-up fee and line minimum —
 * then the cost: items (stock only) and ink per head, margin and gross.
 * `settings` (the current UV rates) adds the formulas; without it only amounts
 * are shown. `sell` overrides the item price when the operator typed the line
 * price by hand (designer rows).
 */
export function UvProfitPanel({
  data,
  t,
  locale,
  costsIncludeVat = true,
  sell,
  settings,
}: {
  data: UvLineData;
  t: TranslationDictionary;
  locale: string;
  costsIncludeVat?: boolean;
  sell?: { unitPriceMdl: number; manual: boolean } | null;
  settings?: UvSettings;
}) {
  const e = t.uv.editor;
  const b = e.breakdown;
  const cur: string = t.admin.currency;
  const fmt = (n: number): string => formatMoney(n, locale);
  const money = (n: number): string => `${fmt(n)} ${cur}`;
  const plus = (n: number): string => `+${money(n)}`;
  const p = data.pricing;
  const c = data.costs;
  const qty: number = data.quantity;
  const isClient: boolean = data.source === "client";
  const unitItemPriceMdl: number = sell ? sell.unitPriceMdl : p.unitItemPriceMdl;
  const itemSellTotalMdl: number = sell ? Math.round(sell.unitPriceMdl * qty * 100) / 100 : p.itemSellTotalMdl;
  const totalSellPriceMdl: number = sell ? itemSellTotalMdl : p.totalSellPriceMdl;
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

  const dealer: boolean = data.customerType === "dealer";
  const rate: number | null = settings ? (dealer ? settings.dealerPricePerSqmMdl : settings.retailPricePerSqmMdl) : null;
  const pct = (n: number): string => fmt(n);

  const zoneUnitTotal = (z: UvLineZone): number =>
    z.unitPrintPriceMdl + z.unitWhiteSurchargeMdl + z.unitVarnishSurchargeMdl + (z.unitPrimerSurchargeMdl ?? 0);
  const perPieceMdl: number =
    Math.round((unitItemPriceMdl + data.zones.reduce((s, z) => s + zoneUnitTotal(z), 0)) * 100) / 100;
  const piecesTotalMdl: number =
    Math.round(
      (itemSellTotalMdl +
        p.printSellTotalMdl +
        p.whiteSurchargeTotalMdl +
        p.varnishSurchargeTotalMdl +
        (p.primerSurchargeTotalMdl ?? 0)) *
        100,
    ) / 100;

  const ink = data.consumption;
  const inkRows: { label: string; ml: number; cost: number }[] = [
    { label: b.inkCmyk, ml: ink.cmykMl, cost: c.cmykInkCostMdl },
    { label: b.inkWhite, ml: ink.whiteMl, cost: c.whiteInkCostMdl },
    { label: b.inkVarnish, ml: ink.varnishMl, cost: c.varnishCostMdl },
    { label: e.primer, ml: ink.primerMl ?? 0, cost: c.primerCostMdl ?? 0 },
  ].filter((r) => r.ml > 0);

  return (
    <div className="grid w-full max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-[12px] leading-snug text-gray-700">
      <PanelHeading>{b.title}</PanelHeading>

      {itemSellTotalMdl > 0 && (
        <Row
          label={
            <>
              {b.itemPrice}
              {itemNote && <span className="text-gray-500"> · {itemNote}</span>}
            </>
          }
          value={money(unitItemPriceMdl)}
        />
      )}

      {!sell &&
        data.zones.map((z) => {
          const place: string = z.placementLabel ?? t.uv.placements[z.placement];
          const size = `${fmt(z.widthCm)}×${fmt(z.heightCm)} см`;
          const sqm: number = (z.widthCm * z.heightCm) / 10_000;
          const byArea: number | null = rate != null ? Math.round(sqm * rate * 100) / 100 : null;
          const minimumApplied: boolean = byArea != null && byArea + 0.005 < z.unitListPriceMdl;
          const extraWhite: number = Math.max(0, z.whiteLayers - 1);
          return (
            <div key={z.id} className="contents">
              <Row
                label={
                  <>
                    <span className="font-medium text-gray-800">{place}</span>
                    <span className="text-gray-500"> · {size}</span>
                  </>
                }
                value={z.includedInItem ? <span className="text-gray-500">{e.includedInItem}</span> : money(z.unitPrintPriceMdl)}
              />
              {!z.includedInItem && (
                <Hint>
                  {minimumApplied && byArea != null
                    ? b.zoneMinimum(money(byArea))
                    : rate != null
                      ? b.byArea(fmt(Math.round(sqm * 10_000) / 10_000), money(rate))
                      : `${fmt(Math.round(sqm * 10_000) / 10_000)} м²`}
                </Hint>
              )}
              {z.unitWhiteSurchargeMdl > 0 && (
                <>
                  <Row className="pl-3" label={`${e.whiteLayerOption(z.whiteLayers)}`} value={plus(z.unitWhiteSurchargeMdl)} />
                  {settings && <Hint>{b.extraWhite(extraWhite, pct(settings.whiteLayerSurchargePct))}</Hint>}
                </>
              )}
              {z.unitVarnishSurchargeMdl > 0 && (
                <>
                  <Row className="pl-3" label={e.varnish} value={plus(z.unitVarnishSurchargeMdl)} />
                  {settings && <Hint>{b.pctOfPrint(pct(settings.varnishSurchargePct))}</Hint>}
                </>
              )}
              {(z.unitPrimerSurchargeMdl ?? 0) > 0 && (
                <>
                  <Row className="pl-3" label={e.primer} value={plus(z.unitPrimerSurchargeMdl ?? 0)} />
                  {settings && <Hint>{b.pctOfPrint(pct(settings.primerSurchargePct))}</Hint>}
                </>
              )}
            </div>
          );
        })}

      <Divider />
      <Row className="font-medium text-gray-900" label={b.perPiece} value={money(sell ? unitItemPriceMdl : perPieceMdl)} />
      {qty > 1 && <Row label={b.timesQty(qty)} value={money(sell ? itemSellTotalMdl : piecesTotalMdl)} />}
      {!sell && p.setupFeeMdl > 0 && (
        <>
          <Row label={e.setupFee} value={plus(p.setupFeeMdl)} />
          <Hint>{b.setupFeeHint}</Hint>
        </>
      )}
      {!sell && p.minimumLineUpliftMdl > 0 && (
        <>
          <Row label={e.minimumUplift} value={plus(p.minimumLineUpliftMdl)} />
          {settings && <Hint>{b.minimumHint(money(settings.minimumLineTotalMdl))}</Hint>}
        </>
      )}
      <Row
        className="mt-0.5 text-[13px] font-semibold text-gray-900"
        label={`${e.total} · ${e.pieces(qty)}`}
        value={money(totalSellPriceMdl)}
      />

      <div className="col-span-2 mt-2" />
      <PanelHeading>{b.costsTitle}</PanelHeading>
      {isClient ? (
        <Row label={<span className="text-gray-500">{b.clientItemCost}</span>} value={money(0)} />
      ) : (
        <Row
          label={
            <>
              {e.itemCost} · {qty} × {fmt(c.unitItemCostMdl)}
              {costMissing && <span className="ml-1 text-amber-700">· {e.itemCostMissing}</span>}
            </>
          }
          value={money(c.itemCostMdl)}
        />
      )}
      {inkRows.map((r) => (
        <Row
          key={r.label}
          label={
            <>
              {r.label}
              <span className="text-gray-500"> · {b.ml(r.ml < 1 ? r.ml.toLocaleString(locale, { maximumFractionDigits: 3 }) : fmt(r.ml))}</span>
            </>
          }
          value={money(r.cost)}
        />
      ))}
      <Divider />
      <Row className="font-medium text-gray-900" label={isClient ? b.directCostClient : e.directCost} value={money(c.totalCostMdl)} />
      {isClient && <Hint>{b.directCostClientHint}</Hint>}
      <Row label={e.margin} value={<span className="font-medium text-emerald-700">{margin}%</span>} />
      <Row label={e.grossProfit} value={<span className="font-medium text-emerald-700">{money(Math.round(profit))}</span>} />
    </div>
  );
}
