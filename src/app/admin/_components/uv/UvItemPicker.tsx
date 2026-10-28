"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Package, Search } from "lucide-react";
import { localizedDtfName } from "@/lib/dtf/stockGarments";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { UvStockItemJson } from "@/lib/uv/dto";
import { useAnchoredPopover } from "@/components/ui/useAnchoredPopover";
import { cn } from "@/lib/utils";

function formatNumber(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

/** Retail price of the smallest run (what one piece costs). */
function fromPriceMdl(item: UvStockItemJson): number | null {
  const tier = [...item.priceTiers].sort((a, b) => a.minQty - b.minQty)[0];
  return tier ? tier.priceMdl : null;
}

/**
 * Item photo with a colour dot in the corner; falls back to the colour swatch,
 * then to a box icon when the item has no photo (or it fails to load).
 */
function Thumb({ item, size = "md" }: { item: UvStockItemJson; size?: "sm" | "md" }) {
  const [broken, setBroken] = useState<boolean>(false);
  const box: string = size === "md" ? "h-11 w-11" : "h-9 w-9";
  const photo: string | null = broken ? null : item.imageUrl;
  if (photo) {
    return (
      <span className={cn("relative shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white", box)}>
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
            className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border border-white shadow"
            style={{ backgroundColor: item.colorHex }}
            aria-hidden
          />
        )}
      </span>
    );
  }
  if (item.colorHex) {
    return (
      <span
        className={cn("shrink-0 rounded-lg border border-black/10 shadow-inner", box)}
        style={{ backgroundColor: item.colorHex }}
        aria-hidden
      />
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400", box)} aria-hidden>
      <Package className="h-4 w-4" />
    </span>
  );
}

interface Group {
  code: string;
  name: string;
  items: UvStockItemJson[];
}

/**
 * Stock item picker for a UV line: category tabs, search by name / colour /
 * SKU, rows with colour, price from 1 pc, stock and print size — so the
 * operator sees which item it is without knowing the SKU.
 */
export function UvItemPicker({
  items,
  value,
  onChange,
  t,
  locale,
  className,
}: {
  items: readonly UvStockItemJson[];
  value: string | null;
  onChange: (variantId: string) => void;
  t: TranslationDictionary;
  locale: string;
  className?: string;
}) {
  const p = t.uv.editor.picker;
  const cur: string = t.admin.currency;
  const [open, setOpen] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");
  const [category, setCategory] = useState<string | null>(null);
  const [active, setActive] = useState<number>(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = `uvpick-${useId()}`;

  const close = useCallback((): void => {
    setOpen(false);
    setQuery("");
  }, []);

  const selected: UvStockItemJson | undefined = items.find((i) => i.id === value);

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
    const q: string = query.trim().toLowerCase();
    const words: string[] = q.split(/\s+/).filter(Boolean);
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

  const flat: UvStockItemJson[] = useMemo(() => visibleGroups.flatMap((g) => g.items), [visibleGroups]);

  const { containerRef, triggerRef, popoverRef, popoverStyle, mounted } = useAnchoredPopover({
    open,
    onClose: close,
    minWidthPx: 460,
    maxHeightPx: 460,
    contentKey: `${flat.length}:${category ?? ""}`,
  });

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  /** Each opening starts on «All», highlighting the picked item. */
  function openPicker(): void {
    const idx: number = groups.flatMap((g) => g.items).findIndex((i) => i.id === value);
    setCategory(null);
    setQuery("");
    setActive(idx >= 0 ? idx : 0);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function pick(id: string): void {
    onChange(id);
    close();
  }

  function onKeyDown(ev: React.KeyboardEvent): void {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const item = flat[active];
      if (item) pick(item.id);
    } else if (ev.key === "Escape") {
      close();
    }
  }

  function itemTitle(item: UvStockItemJson): string {
    return localizedDtfName(item.itemNames, locale);
  }

  function meta(item: UvStockItemJson): string {
    const area = item.printArea;
    return [
      item.sku,
      area
        ? p.printArea(`${formatNumber(area.widthCm, locale)}×${formatNumber(area.heightCm, locale)}`)
        : p.noPrintArea,
    ].join(" · ");
  }

  function stockBadge(item: UvStockItemJson) {
    const n: number = item.stockQuantity;
    return (
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
          n > 0 ? "bg-gray-100 text-gray-600" : "bg-red-50 text-red-700",
        )}
      >
        {n > 0 ? t.uv.editor.pieces(n) : p.outOfStock}
      </span>
    );
  }

  let rowIndex = -1;
  const dropdown =
    mounted && open && popoverStyle ? (
      <div
        ref={popoverRef}
        className="fixed z-[130] flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-950 shadow-xl"
        style={popoverStyle}
        onMouseDown={(e) => {
          if (e.target !== searchRef.current) e.preventDefault();
        }}
      >
        <div className="shrink-0 space-y-2 border-b border-gray-100 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={p.search}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm outline-none focus:border-gray-300"
            />
          </div>
          {groups.length > 1 && (
            <div className="flex flex-wrap gap-1" role="tablist">
              {[{ code: null as string | null, name: p.all, count: items.length }, ...groups.map((g) => ({ code: g.code as string | null, name: g.name, count: g.items.length }))].map(
                (tab) => (
                  <button
                    key={tab.code ?? "_all"}
                    type="button"
                    role="tab"
                    aria-selected={category === tab.code}
                    onClick={() => {
                      setCategory(tab.code);
                      setActive(0);
                    }}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      category === tab.code
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900",
                    )}
                  >
                    {tab.name}
                    <span className={cn("ml-1 tabular-nums", category === tab.code ? "text-white/60" : "text-gray-400")}>
                      {tab.count}
                    </span>
                  </button>
                ),
              )}
            </div>
          )}
        </div>
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          data-popover-scroll=""
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1"
        >
          {visibleGroups.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-400">{p.empty}</p>
          ) : (
            visibleGroups.map((g) => (
              <div key={g.code} role="group" aria-label={g.name}>
                <div className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 backdrop-blur">
                  {g.name}
                  <span className="ml-1 font-normal normal-case text-gray-400">· {g.items.length}</span>
                </div>
                {g.items.map((item) => {
                  rowIndex += 1;
                  const idx: number = rowIndex;
                  const isSelected: boolean = item.id === value;
                  const price: number | null = fromPriceMdl(item);
                  return (
                    <div
                      key={item.id}
                      role="option"
                      aria-selected={isSelected}
                      data-index={idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => pick(item.id)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 px-3 py-2",
                        idx === active ? "bg-gray-100" : "bg-white",
                        item.stockQuantity <= 0 && "opacity-70",
                      )}
                    >
                      <Thumb key={item.id} item={item} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("truncate text-sm text-gray-900", isSelected && "font-semibold")}>
                            {itemTitle(item)}
                          </span>
                          {item.variantLabel && (
                            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                              {item.variantLabel}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-gray-500">
                          <span className="font-mono tracking-wide">{meta(item)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        {price != null && (
                          <span className="text-sm font-medium tabular-nums text-gray-900">
                            {p.fromPrice(`${formatNumber(price, locale)} ${cur}`)}
                          </span>
                        )}
                        {stockBadge(item)}
                      </div>
                      <Check
                        className={cn("h-4 w-4 shrink-0", isSelected ? "text-gray-700" : "invisible")}
                        aria-hidden
                      />
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    ) : null;

  const selectedPrice: number | null = selected ? fromPriceMdl(selected) : null;

  return (
    <>
      <div ref={containerRef} className={cn("relative min-w-0", className)}>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t.uv.editor.item}
          onClick={() => (open ? close() : openPicker())}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left shadow-sm transition-colors",
            open ? "border-gray-300" : "hover:border-gray-300 hover:bg-gray-50",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950",
          )}
        >
          {selected ? (
            <>
              <Thumb key={selected.id} item={selected} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-gray-900">
                  {itemTitle(selected)}
                  {selected.variantLabel && <span className="font-normal text-gray-500"> · {selected.variantLabel}</span>}
                </span>
                <span className="block truncate text-[11px] text-gray-500">
                  {localizedDtfName(selected.categoryNames, locale)} ·{" "}
                  <span className="font-mono tracking-wide">{selected.sku}</span>
                  {selectedPrice != null && <> · {p.fromPrice(`${formatNumber(selectedPrice, locale)} ${cur}`)}</>}
                </span>
              </span>
            </>
          ) : (
            <span className="flex-1 text-[13px] text-gray-400">{p.placeholder}</span>
          )}
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-gray-500 opacity-70 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </div>
      {dropdown && createPortal(dropdown, document.body)}
    </>
  );
}
