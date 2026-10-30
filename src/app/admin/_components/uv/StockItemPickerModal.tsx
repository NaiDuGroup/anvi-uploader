"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Hand, Package, Search, X } from "lucide-react";
import { localizedDtfName } from "@/lib/dtf/stockGarments";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { UvStockItemJson } from "@/lib/uv/dto";
import { cn } from "@/lib/utils";

function formatNumber(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

/**
 * What the picker shows of a stock item: UV / sublimation variants fit as they
 * are; DTF garments (item × colour) are mapped to it. `methodLabel` marks how
 * the item is printed («UV-печать», «Сублимация», «DTF-печать»).
 */
export type StockPickerItem = Pick<
  UvStockItemJson,
  | "id"
  | "categoryCode"
  | "categoryNames"
  | "itemNames"
  | "variantLabel"
  | "colorHex"
  | "imageUrl"
  | "sku"
  | "stockQuantity"
  | "priceTiers"
  | "printArea"
> & {
  /** Dealer price per piece; dealers pay it when it is below the retail tier. */
  dealerPriceMdl?: number | null;
  /** Garments: the 1-piece price of each size (card shows a range). */
  sizePricesMdl?: number[];
  methodLabel?: string;
  /** Replaces the print-size line (e.g. the sizes of a garment). */
  note?: string;
};

export type StockPickerCustomerType = "retail" | "dealer";

/** Price shown on a picker card: one piece (a range for garment sizes) plus the best run-size step. */
export interface StockPickerPrice {
  minMdl: number;
  maxMdl: number;
  /** Cheapest run-size step when it beats the 1-piece price. */
  bulk: { minQty: number; priceMdl: number } | null;
}

/**
 * Price of a stock item for the order's price type. Dealers pay the dealer
 * price when it is below the tier price (same rule as the UV / sublimation lines).
 */
export function stockPickerPrice(
  item: Pick<StockPickerItem, "priceTiers" | "dealerPriceMdl" | "sizePricesMdl">,
  customerType: StockPickerCustomerType = "retail",
): StockPickerPrice | null {
  const sizes: number[] = (item.sizePricesMdl ?? []).filter((n) => Number.isFinite(n));
  if (sizes.length > 0) {
    return { minMdl: Math.min(...sizes), maxMdl: Math.max(...sizes), bulk: null };
  }
  const tiers = [...item.priceTiers].sort((a, b) => a.minQty - b.minQty);
  if (tiers.length === 0) return null;
  const dealer: number | null =
    customerType === "dealer" && item.dealerPriceMdl != null ? item.dealerPriceMdl : null;
  const at = (tierPrice: number): number => (dealer != null && dealer < tierPrice ? dealer : tierPrice);
  const one: number = at(tiers[0].priceMdl);
  const last = tiers[tiers.length - 1];
  const lastPrice: number = at(last.priceMdl);
  return {
    minMdl: one,
    maxMdl: one,
    bulk: tiers.length > 1 && lastPrice < one ? { minQty: last.minQty, priceMdl: lastPrice } : null,
  };
}

/** «130 MDL» or «150–190 MDL». */
export function formatStockPickerPrice(price: StockPickerPrice, locale: string, currency: string): string {
  const fmt = (n: number): string => formatNumber(n, locale);
  return price.minMdl === price.maxMdl
    ? `${fmt(price.minMdl)} ${currency}`
    : `${fmt(price.minMdl)}–${fmt(price.maxMdl)} ${currency}`;
}

/**
 * Item photo with a colour dot in the corner; falls back to the colour swatch,
 * then to a box icon when the item has no photo (or it fails to load).
 */
export function StockItemThumb({ item, className }: { item: StockPickerItem; className?: string }) {
  const [broken, setBroken] = useState<boolean>(false);
  const photo: string | null = broken ? null : item.imageUrl;
  if (photo) {
    return (
      <span className={cn("relative block shrink-0 overflow-hidden bg-white", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- catalog CDN / API URLs, sized by CSS */}
        <img
          src={photo}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setBroken(true)}
        />
        {item.colorHex && (
          <span
            className="absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-white shadow"
            style={{ backgroundColor: item.colorHex }}
            aria-hidden
          />
        )}
      </span>
    );
  }
  if (item.colorHex) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center bg-gray-50", className)} aria-hidden>
        <span
          className="aspect-square h-1/2 max-h-20 rounded-full border border-black/10 shadow-inner"
          style={{ backgroundColor: item.colorHex }}
        />
      </span>
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-gray-100 text-gray-400", className)} aria-hidden>
      <Package className="h-1/3 w-1/3 max-h-8 max-w-8" />
    </span>
  );
}

interface Group {
  code: string;
  name: string;
  items: StockPickerItem[];
}

export interface StockItemPickerModalProps {
  open: boolean;
  onClose: () => void;
  items: readonly StockPickerItem[];
  /** Category tab the dialog opens on (null = «All»). */
  initialCategory?: string | null;
  /** Variant the row is on; null when none / the client's item. */
  value: string | null;
  onPick: (variantId: string) => void;
  /** UV only: «the client brings the item» card at the end of the grid. */
  onPickClient?: () => void;
  /** The row is on the client's item (highlights that card). */
  clientSelected?: boolean;
  /** Order price type: dealers see the dealer price. */
  customerType?: StockPickerCustomerType;
  t: TranslationDictionary;
  locale: string;
}

/**
 * Full-screen picker of stock items for a print method (UV, sublimation): one
 * place for every category — tabs, search by name / colour / SKU, photo cards
 * with the price for the order's price type, stock and print size. The dialog keeps a fixed height
 * so filtering never makes it jump.
 */
export function StockItemPickerModal(props: StockItemPickerModalProps) {
  // Opens only after a click, so the document is always there.
  if (!props.open || typeof document === "undefined") return null;
  return createPortal(<PickerDialog {...props} />, document.body);
}

function PickerDialog({
  onClose,
  items,
  initialCategory = null,
  value,
  onPick,
  onPickClient,
  clientSelected = false,
  customerType = "retail",
  t,
  locale,
}: StockItemPickerModalProps) {
  const p = t.uv.editor.picker;
  const cur: string = t.admin.currency;
  const [query, setQuery] = useState<string>("");
  const [category, setCategory] = useState<string | null>(
    initialCategory != null && items.some((i) => i.categoryCode === initialCategory) ? initialCategory : null,
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow: string = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
      scrollRef.current?.querySelector<HTMLElement>("[data-selected='true']")?.scrollIntoView({ block: "center" });
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.cancelAnimationFrame(raf);
    };
  }, [onClose]);

  const groups: Group[] = useMemo(() => {
    const byCode = new Map<string, Group>();
    for (const item of items) {
      const g = byCode.get(item.categoryCode);
      if (g) g.items.push(item);
      else
        byCode.set(item.categoryCode, {
          code: item.categoryCode,
          name: localizedDtfName(item.categoryNames, locale),
          items: [item],
        });
    }
    return [...byCode.values()];
  }, [items, locale]);

  const visibleGroups: Group[] = useMemo(() => {
    const words: string[] = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return groups
      .filter((g) => category == null || g.code === category)
      .map((g) => ({
        ...g,
        items: words.length
          ? g.items.filter((item) => {
              const hay: string = [
                item.itemNames.ru,
                item.itemNames.ro,
                item.itemNames.en,
                item.variantLabel ?? "",
                item.sku,
                g.name,
              ]
                .join(" ")
                .toLowerCase();
              return words.every((w) => hay.includes(w));
            })
          : g.items,
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, category, query]);

  const firstVisible: StockPickerItem | undefined = visibleGroups[0]?.items[0];

  function pick(id: string): void {
    onPick(id);
    onClose();
  }

  function setFilter(next: { query?: string; category?: string | null }): void {
    if (next.query !== undefined) setQuery(next.query);
    if (next.category !== undefined) setCategory(next.category);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  const tabs: { code: string | null; name: string; count: number }[] = [
    { code: null, name: p.all, count: items.length },
    ...groups.map((g) => ({ code: g.code, name: g.name, count: g.items.length })),
  ];

  const card = (item: StockPickerItem) => {
    const selected: boolean = item.id === value;
    const price: StockPickerPrice | null = stockPickerPrice(item, customerType);
    const area = item.printArea;
    const out: boolean = item.stockQuantity <= 0;
    return (
      <button
        key={item.id}
        type="button"
        data-selected={selected}
        onClick={() => pick(item.id)}
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-xl border bg-white text-left transition",
          selected
            ? "border-gold ring-2 ring-gold/40"
            : "border-gray-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md",
        )}
      >
        <span className="relative block aspect-[4/3] w-full bg-gray-50">
          <StockItemThumb item={item} className="h-full w-full bg-gray-50 p-2" />
          <span
            className={cn(
              "absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums shadow-sm",
              out ? "bg-red-50 text-red-700" : "bg-white/90 text-gray-700",
            )}
          >
            {out ? p.outOfStock : t.uv.editor.pieces(item.stockQuantity)}
          </span>
          {item.methodLabel && (
            <span className="absolute bottom-2 left-2 rounded-md bg-gray-900/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {item.methodLabel}
            </span>
          )}
          {selected && (
            <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gold text-white shadow">
              <Check className="h-4 w-4" aria-hidden />
            </span>
          )}
        </span>
        <span className="flex flex-1 flex-col gap-0.5 px-3 pb-3 pt-2">
          <span className="line-clamp-2 text-sm font-medium leading-snug text-gray-900">
            {localizedDtfName(item.itemNames, locale)}
            {item.variantLabel && <span className="font-normal text-gray-500"> · {item.variantLabel}</span>}
          </span>
          <span className="truncate font-mono text-[11px] tracking-wide text-gray-500">{item.sku}</span>
          <span className="truncate text-[11px] text-gray-500">
            {item.note ??
              (area
                ? p.printArea(`${formatNumber(area.widthCm, locale)}×${formatNumber(area.heightCm, locale)}`)
                : p.noPrintArea)}
          </span>
          <span className="mt-auto pt-1 text-[15px] font-semibold tabular-nums text-gold-text">
            {price != null ? formatStockPickerPrice(price, locale, cur) : "—"}
          </span>
          {price?.bulk && (
            <span className="text-[11px] tabular-nums text-gray-500">
              {p.bulkPrice(
                price.bulk.minQty,
                `${formatNumber(price.bulk.priceMdl, locale)} ${cur}`,
              )}
            </span>
          )}
        </span>
      </button>
    );
  };

  const clientCard =
    onPickClient && category == null && !query.trim() ? (
      <button
        type="button"
        data-selected={clientSelected}
        onClick={() => {
          onPickClient();
          onClose();
        }}
        className={cn(
          "flex min-h-48 flex-col items-start justify-center gap-1.5 rounded-xl border-2 border-dashed p-4 text-left transition",
          clientSelected ? "border-gold bg-amber-50/50" : "border-gray-300 bg-gray-50 hover:border-gray-400",
        )}
      >
        <Hand className="h-6 w-6 text-gray-400" aria-hidden />
        <span className="text-sm font-semibold text-gray-900">{t.uv.sources.client}</span>
        <span className="text-xs leading-snug text-gray-500">{p.clientHint}</span>
      </button>
    ) : null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-3 sm:p-6">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label={p.close} onClick={onClose} />
      <div
        className="relative flex h-[min(90vh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-item-picker-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3.5 sm:px-5">
          <h2 id="stock-item-picker-title" className="text-lg font-semibold tracking-tight">
            {p.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={p.close}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="shrink-0 space-y-2.5 border-b border-gray-100 px-4 py-3 sm:px-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setFilter({ query: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && firstVisible) {
                  e.preventDefault();
                  pick(firstVisible.id);
                }
              }}
              placeholder={p.search}
              className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-[15px] outline-none focus:border-gray-300"
            />
          </div>
          {groups.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="tablist">
              {tabs.map((tab) => (
                <button
                  key={tab.code ?? "_all"}
                  type="button"
                  role="tab"
                  aria-selected={category === tab.code}
                  onClick={() => setFilter({ category: tab.code })}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                    category === tab.code
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900",
                  )}
                >
                  {tab.name}
                  <span className={cn("ml-1.5 tabular-nums", category === tab.code ? "text-white/60" : "text-gray-400")}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-5">
          {visibleGroups.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-10">
              <p className="text-sm text-gray-500">{p.empty}</p>
              {onPickClient && (
                <button
                  type="button"
                  onClick={() => {
                    onPickClient();
                    onClose();
                  }}
                  className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-700 hover:border-gray-400"
                >
                  {t.uv.sources.client}
                </button>
              )}
            </div>
          ) : (
            visibleGroups.map((g, gi) => (
              <section key={g.code} aria-label={g.name}>
                <h3 className="sticky top-0 z-10 -mx-1 bg-white/95 px-1 pb-2 pt-4 text-[12px] font-semibold uppercase tracking-wide text-gray-500 backdrop-blur">
                  {g.name}
                  <span className="ml-1.5 font-normal text-gray-400">{g.items.length}</span>
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {g.items.map(card)}
                  {gi === visibleGroups.length - 1 && clientCard}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
