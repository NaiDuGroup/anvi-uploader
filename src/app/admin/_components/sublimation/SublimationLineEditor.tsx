"use client";

import Link from "next/link";
import { UvItemPicker } from "@/app/admin/_components/uv/UvItemPicker";
import { marginPercentOnCostBasis, sellOnCostBasis } from "@/lib/accounting/vatBasis";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { PrintMethodCode, printMethodPagePath } from "@/lib/printMethods/methods";
import { sublimationNormFor, type SublimationSettings } from "@/lib/printMethods/sublimationSettings";
import type { SublimationCatalogJson, SublimationStockItemJson } from "@/lib/sublimation/dto";
import { sublimationLineSource } from "@/lib/sublimation/parseSublimationLineData";
import { SUBLIMATION_MAX_DESCRIPTION, SUBLIMATION_MAX_NOTES } from "@/lib/sublimation/sublimationConstants";
import { sublimationDraftQuantity, type SublimationDraft, type SublimationQuote } from "@/lib/sublimation/sublimationDraft";
import type { SublimationLineData } from "@/lib/sublimation/types";
import { cn } from "@/lib/utils";

const numberClass =
  "h-8 w-14 rounded-lg border border-gray-200 bg-white px-1.5 text-center text-[13px] tabular-nums shadow-sm focus:border-gray-300 focus:outline-none";
const textClass =
  "h-8 min-w-0 rounded-lg border border-gray-200 bg-white px-2 text-[13px] shadow-sm focus:border-gray-300 focus:outline-none";

function formatMoney(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

export interface SublimationLineEditorProps {
  value: SublimationDraft;
  onChange: (next: SublimationDraft) => void;
  catalog: SublimationCatalogJson;
  quote: SublimationQuote;
  t: TranslationDictionary;
  locale: string;
  /** Purchase costs are stored with VAT (accounting setting); margin is compared on the same basis. */
  costsIncludeVat?: boolean;
  /** Opens the page's stock picker (every category and print method) instead of the sublimation-only one. */
  onOpenItemPicker?: () => void;
}

/**
 * «Сублимация» order row. Stock blank (picked in the stock picker): price per
 * piece from its run-size tiers, print included. Client's item (`value.source
 * === "client"`, switched from the product menu): description, note, print size
 * and quantity; priced from the size. Below: how the price and cost are built.
 */
export function SublimationLineEditor({
  value,
  onChange,
  catalog,
  quote,
  t,
  locale,
  costsIncludeVat = true,
  onOpenItemPicker,
}: SublimationLineEditorProps) {
  const e = t.sublimation.editor;
  const isClient: boolean = value.source === "client";
  const item: SublimationStockItemJson | undefined = isClient
    ? undefined
    : catalog.items.find((i) => i.id === value.variantId);
  const qty: number = sublimationDraftQuantity(value);
  const stock: number | undefined = item?.stockQuantity;
  const short: number = stock === undefined ? 0 : Math.max(0, qty - Math.max(0, stock));
  const data: SublimationLineData | null = quote.ok ? quote.data : null;

  if (!isClient && catalog.items.length === 0) {
    return <p className="py-1 text-xs text-amber-700">{e.noItems}</p>;
  }

  const norm = item ? sublimationNormFor(catalog.settings, item.categoryCode) : null;
  const noNorms: boolean = norm != null && norm.paperSheets === 0 && norm.tapeCm === 0 && norm.inkMl === 0;

  return (
    <div className="flex min-w-0 flex-col gap-2 py-0.5 text-[13px]">
      {isClient ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              aria-label={e.description}
              placeholder={`${e.description}: ${e.descriptionPlaceholder}`}
              maxLength={SUBLIMATION_MAX_DESCRIPTION}
              className={cn(textClass, "w-64 max-w-full flex-1", !value.description.trim() && "border-amber-300")}
              value={value.description}
              onChange={(ev) => onChange({ ...value, description: ev.target.value })}
            />
            <input
              aria-label={e.notes}
              placeholder={`${e.notes}: ${e.notesPlaceholder}`}
              maxLength={SUBLIMATION_MAX_NOTES}
              className={cn(textClass, "w-56 max-w-full flex-1")}
              value={value.notes}
              onChange={(ev) => onChange({ ...value, notes: ev.target.value })}
            />
          </div>
          {!value.description.trim() && <p className="text-[11px] text-amber-700">{e.descriptionNeeded}</p>}
        </div>
      ) : (
        <UvItemPicker
          className="w-full max-w-md"
          items={catalog.items}
          value={value.variantId}
          onChange={(next) => onChange({ ...value, variantId: next })}
          onOpen={onOpenItemPicker}
          t={t}
          locale={locale}
        />
      )}

      <div className="flex flex-wrap items-start gap-3">
        {isClient && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold text-gray-600">
              {e.widthCm} × {e.heightCm}
            </span>
            <div className="flex items-center gap-1">
              <input
                aria-label={e.widthCm}
                placeholder={e.widthCm}
                inputMode="decimal"
                className={cn(numberClass, !value.widthStr.trim() && "border-amber-300")}
                value={value.widthStr}
                onChange={(ev) => onChange({ ...value, widthStr: ev.target.value })}
              />
              <span className="text-gray-400">×</span>
              <input
                aria-label={e.heightCm}
                placeholder={e.heightCm}
                inputMode="decimal"
                className={cn(numberClass, !value.heightStr.trim() && "border-amber-300")}
                value={value.heightStr}
                onChange={(ev) => onChange({ ...value, heightStr: ev.target.value })}
              />
            </div>
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
      </div>

      {data ? (
        <>
          <SublimationProfitPanel
            data={data}
            t={t}
            locale={locale}
            costsIncludeVat={costsIncludeVat}
            settings={catalog.settings}
          />
          {!isClient && noNorms && (
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
        </>
      ) : !quote.ok && quote.code === "subl_price_not_set" ? (
        <p className="text-xs text-amber-700">
          {e.priceNotSet}{" "}
          <Link
            href={printMethodPagePath(PrintMethodCode.Sublimation)}
            className="font-medium underline hover:text-amber-900"
          >
            {e.priceNotSetLink}
          </Link>
        </p>
      ) : (
        !quote.ok &&
        quote.code !== "subl_incomplete" && <p className="text-xs text-red-600">{t.sublimation.errors[quote.code]}</p>
      )}
    </div>
  );
}

/** Label / value row of the breakdown (same layout as the UV panel). */
function Row({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <>
      <span className={className}>{label}</span>
      <span className={cn("text-right tabular-nums", className)}>{value}</span>
    </>
  );
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-2 mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{children}</div>
  );
}

/** A grey explanation line under a row («0,06 м² × 2000/м²»). */
function Hint({ children }: { children: React.ReactNode }) {
  return <div className="col-span-2 -mt-0.5 pl-3 text-[11px] leading-snug text-gray-500">{children}</div>;
}

function Divider() {
  return <div className="col-span-2 my-1 border-t border-gray-200" />;
}

/**
 * Price and profit of a sublimation line, in the layout of the UV panel. Stock
 * blank: the tier (or dealer) price per piece × quantity; costs = blank + Epson
 * consumables. Client's item: print size × rate per m² (or the per-piece
 * minimum) × quantity, set-up fee, up to the line minimum; costs = paper, tape
 * and ink only. `settings` adds the line-minimum formula when known.
 */
export function SublimationProfitPanel({
  data,
  t,
  locale,
  costsIncludeVat = true,
  settings,
}: {
  data: SublimationLineData;
  t: TranslationDictionary;
  locale: string;
  costsIncludeVat?: boolean;
  settings?: SublimationSettings;
}) {
  const e = t.sublimation.editor;
  const b = e.breakdown;
  const cur: string = t.admin.currency;
  const fmt = (n: number): string => formatMoney(n, locale);
  const money = (n: number): string => `${fmt(n)} ${cur}`;
  const plus = (n: number): string => `+${money(n)}`;
  const p = data.pricing;
  const c = data.costs;
  const qty: number = data.quantity;
  const client = sublimationLineSource(data) === "client" ? (data.clientItem ?? null) : null;
  const isClient: boolean = client != null;
  const profit: number = sellOnCostBasis(p.totalSellPriceMdl, costsIncludeVat) - c.totalCostMdl;
  const margin: number = marginPercentOnCostBasis(p.totalSellPriceMdl, c.totalCostMdl, costsIncludeVat);
  const piecesTotalMdl: number = Math.round(qty * p.unitPriceMdl * 100) / 100;
  const sqm: number = p.areaSqmPerPiece ?? 0;
  const small = (n: number): string =>
    n < 1 ? n.toLocaleString(locale, { maximumFractionDigits: 3 }) : fmt(n);

  const consumableRows: { label: string; cost: number; amount: number }[] = [
    { label: b.paper(fmt(data.consumption.paperSheets)), cost: c.paperCostMdl, amount: data.consumption.paperSheets },
    { label: b.tape(small(data.consumption.tapeM)), cost: c.tapeCostMdl, amount: data.consumption.tapeM },
    { label: b.ink(small(data.consumption.inkMl)), cost: c.inkCostMdl, amount: data.consumption.inkMl },
  ].filter((r) => r.amount > 0);

  return (
    <div className="grid w-full max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-[12px] leading-snug text-gray-700">
      <PanelHeading>{b.title}</PanelHeading>

      {client ? (
        <>
          <Row
            label={
              <>
                <span className="font-medium text-gray-800">{client.description || t.sublimation.workshop.clientItem}</span>
                <span className="text-gray-500">
                  {" "}
                  · {fmt(client.widthCm)}×{fmt(client.heightCm)} см
                </span>
              </>
            }
            value={money(p.unitPriceMdl)}
          />
          <Hint>
            {p.minimumApplied
              ? b.minimum(money(p.unitByAreaPriceMdl ?? 0))
              : p.ratePerSqmMdl != null
                ? b.byArea(fmt(Math.round(sqm * 10_000) / 10_000), money(p.ratePerSqmMdl))
                : `${fmt(Math.round(sqm * 10_000) / 10_000)} м²`}
          </Hint>
        </>
      ) : (
        <Row
          label={
            <>
              {e.unitPrice}
              <span className="text-gray-500">
                {" "}
                · {p.priceSource === "dealer" ? e.dealerPrice : e.tier(p.tierMinQty)}
              </span>
            </>
          }
          value={money(p.unitPriceMdl)}
        />
      )}

      <Divider />
      <Row className="font-medium text-gray-900" label={b.perPiece} value={money(p.unitPriceMdl)} />
      {qty > 1 && <Row label={b.timesQty(qty)} value={money(piecesTotalMdl)} />}
      {(p.setupFeeMdl ?? 0) > 0 && (
        <>
          <Row label={b.setupFee} value={plus(p.setupFeeMdl ?? 0)} />
          <Hint>{b.setupFeeHint}</Hint>
        </>
      )}
      {(p.minimumLineUpliftMdl ?? 0) > 0 && (
        <>
          <Row label={b.minimumUplift} value={plus(p.minimumLineUpliftMdl ?? 0)} />
          {settings && <Hint>{b.minimumHint(money(settings.clientItem.minimumLineTotalMdl))}</Hint>}
        </>
      )}
      <Row
        className="mt-0.5 text-[13px] font-semibold text-gray-900"
        label={`${e.total} · ${e.pieces(qty)}`}
        value={money(p.totalSellPriceMdl)}
      />

      <div className="col-span-2 mt-2" />
      <PanelHeading>{b.costsTitle}</PanelHeading>
      {isClient ? (
        <Row label={<span className="text-gray-500">{b.clientItemCost}</span>} value={money(0)} />
      ) : (
        <Row
          label={
            <>
              {b.blank} · {qty} × {fmt(c.unitItemCostMdl)}
              {!(c.unitItemCostMdl > 0) && <span className="ml-1 text-amber-700">· {b.blankCostMissing}</span>}
            </>
          }
          value={money(c.itemCostMdl)}
        />
      )}
      {consumableRows.map((r) => (
        <Row key={r.label} label={r.label} value={money(r.cost)} />
      ))}
      <Divider />
      <Row
        className="font-medium text-gray-900"
        label={isClient ? b.directCostClient : b.directCost}
        value={money(c.totalCostMdl)}
      />
      {isClient && <Hint>{b.directCostClientHint}</Hint>}
      <Row label={b.margin} value={<span className="font-medium text-emerald-700">{margin}%</span>} />
      <Row label={b.grossProfit} value={<span className="font-medium text-emerald-700">{money(Math.round(profit))}</span>} />
    </div>
  );
}
