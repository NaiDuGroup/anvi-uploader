"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Package, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAnchoredPopover } from "@/components/ui/useAnchoredPopover";
import { buildProductPickerSections, getProductTypeConfig } from "@/lib/productTypes";
import { cn } from "@/lib/utils";
import type { ProductType } from "@/lib/validations";
import { useLanguageStore } from "@/stores/useLanguageStore";

const POPOVER_MIN_WIDTH_PX = 660;
const POPOVER_MAX_HEIGHT_PX = 720;

/** Stock category tile («Кружки», «Блокноты»…): picking it opens the item picker on that category. */
export interface ProductMenuStockCategory {
  code: string;
  title: string;
  count: number;
  imageUrl: string | null;
}

/** Printing service on the client's own item (UV, sublimation, DTF). */
export interface ProductMenuClientService {
  type: ProductType;
  title: string;
  hint: string;
}

/** What the trigger shows instead of the product type (e.g. «Кружки · Сублимация»). */
export interface ProductMenuCurrent {
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
}

export interface ProductTypeMenuProps {
  value: ProductType;
  /** Product types offered, in any order; the menu groups them itself. */
  options: readonly ProductType[];
  onChange: (next: ProductType) => void;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  ariaLabel?: string;
  /** «Товары со склада» group. */
  stockCategories?: readonly ProductMenuStockCategory[];
  stockGroupLabel?: string;
  selectedStockCategory?: string | null;
  onPickStockCategory?: (code: string) => void;
  /** «Печать на изделии клиента» group; these types are not shown among `options`. */
  clientServices?: readonly ProductMenuClientService[];
  clientGroupLabel?: string;
  selectedClientService?: ProductType | null;
  onPickClientService?: (type: ProductType) => void;
  current?: ProductMenuCurrent | null;
}

interface MenuEntry {
  id: string;
  title: string;
  hint: string;
  icon?: LucideIcon;
  imageUrl?: string | null;
  count?: number;
  selected: boolean;
  accent?: { borderActive: string; bgActive: string; textActive: string };
  pick: () => void;
}

interface MenuGroup {
  key: string;
  label: string;
  entries: MenuEntry[];
}

/** Hide a photo that failed to load (the tile keeps its grey frame). */
function hideBroken(e: SyntheticEvent<HTMLImageElement>): void {
  e.currentTarget.style.visibility = "hidden";
}

function Thumb({ imageUrl, icon: Icon }: { imageUrl?: string | null; icon?: LucideIcon }): ReactNode {
  if (imageUrl) {
    return (
      <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
        {/* eslint-disable-next-line @next/next/no-img-element -- catalog CDN / API URLs */}
        <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" onError={hideBroken} />
      </span>
    );
  }
  const I: LucideIcon = Icon ?? Package;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-400">
      <I className="h-4 w-4" aria-hidden />
    </span>
  );
}

/**
 * Product select for the order wizard: a trigger with icon + name and a popover
 * of grouped tiles with search — printing products, stock categories and the
 * services on a client's own item. Typing filters, ↑/↓ move, Enter picks.
 */
export function ProductTypeMenu({
  value,
  options,
  onChange,
  disabled = false,
  className,
  buttonClassName,
  ariaLabel,
  stockCategories = [],
  stockGroupLabel = "",
  selectedStockCategory = null,
  onPickStockCategory,
  clientServices = [],
  clientGroupLabel = "",
  selectedClientService = null,
  onPickClientService,
  current = null,
}: ProductTypeMenuProps) {
  const { t } = useLanguageStore();
  const [open, setOpen] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId: string = `product-menu-${useId()}`;

  const close = useCallback((): void => {
    setOpen(false);
    setQuery("");
  }, []);

  const { containerRef, triggerRef, popoverRef, popoverStyle, mounted } = useAnchoredPopover({
    open,
    onClose: close,
    minWidthPx: POPOVER_MIN_WIDTH_PX,
    maxHeightPx: POPOVER_MAX_HEIGHT_PX,
    contentKey: `${query}`,
  });

  const groups: MenuGroup[] = useMemo(() => {
    const needle: string = query.trim().toLocaleLowerCase();
    const matches = (e: Pick<MenuEntry, "title" | "hint">): boolean =>
      needle === "" || e.title.toLocaleLowerCase().includes(needle) || e.hint.toLocaleLowerCase().includes(needle);
    const serviceTypes = new Set<ProductType>(clientServices.map((s) => s.type));
    const done = (fn: () => void) => () => {
      fn();
      close();
      triggerRef.current?.focus();
    };
    const typed: MenuGroup[] = buildProductPickerSections(
      options.filter((o) => !serviceTypes.has(o)),
      t,
      query,
    ).map((section) => ({
      key: section.group,
      label: t.productPicker.groups[section.group],
      entries: section.items.map((item) => ({
        id: `type:${item.config.dbProductType}`,
        title: item.title,
        hint: item.hint,
        icon: item.config.icon,
        selected: current == null && item.config.dbProductType === value,
        accent: item.config.accent,
        pick: done(() => onChange(item.config.dbProductType)),
      })),
    }));
    const stock: MenuEntry[] = onPickStockCategory
      ? stockCategories
          .map((c) => ({
            id: `stock:${c.code}`,
            title: c.title,
            hint: "",
            imageUrl: c.imageUrl,
            count: c.count,
            selected: selectedStockCategory === c.code,
            pick: done(() => onPickStockCategory(c.code)),
          }))
          .filter(matches)
      : [];
    const services: MenuEntry[] = onPickClientService
      ? clientServices
          .map((s) => ({
            id: `client:${s.type}`,
            title: s.title,
            hint: s.hint,
            icon: getProductTypeConfig(s.type)?.icon,
            selected: selectedClientService === s.type,
            accent: getProductTypeConfig(s.type)?.accent,
            pick: done(() => onPickClientService(s.type)),
          }))
          .filter(matches)
      : [];
    // Polygraphy first, then what we sell from stock, then printing on the client's item.
    const [first, ...rest] = typed;
    return [
      ...(first ? [first] : []),
      ...(stock.length ? [{ key: "stock", label: stockGroupLabel, entries: stock }] : []),
      ...(services.length ? [{ key: "client", label: clientGroupLabel, entries: services }] : []),
      ...rest,
    ].filter((g) => g.entries.length > 0);
  }, [
    query,
    clientServices,
    options,
    t,
    current,
    value,
    onChange,
    onPickStockCategory,
    stockCategories,
    selectedStockCategory,
    stockGroupLabel,
    onPickClientService,
    selectedClientService,
    clientGroupLabel,
    close,
    triggerRef,
  ]);

  const flat: MenuEntry[] = useMemo(() => groups.flatMap((g) => g.entries), [groups]);

  const selectedConfig = getProductTypeConfig(value);
  const SelectedIcon: LucideIcon | null = selectedConfig?.icon ?? null;
  const selectedTitle: string = current?.title ?? selectedConfig?.getTitle(t) ?? value;

  const optionId = (entryId: string): string => `${listboxId}-opt-${entryId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  function openMenu(): void {
    setQuery("");
    setActiveIndex(Math.max(0, flat.findIndex((e) => e.selected)));
    setOpen(true);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function moveActive(delta: number): void {
    if (flat.length === 0) return;
    const next: number = (activeIndex + delta + flat.length) % flat.length;
    setActiveIndex(next);
    const target = flat[next];
    if (target) {
      window.requestAnimationFrame(() =>
        document.getElementById(optionId(target.id))?.scrollIntoView({ block: "nearest" }),
      );
    }
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      flat[activeIndex]?.pick();
    } else if (e.key === "Escape") {
      close();
    }
  }

  const activeEntry: MenuEntry | undefined = flat[activeIndex];

  const popover =
    mounted && open && popoverStyle ? (
      <div
        ref={popoverRef}
        className="fixed z-[130] flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-950 shadow-lg"
        style={popoverStyle}
      >
        <div className="shrink-0 border-b border-gray-100 p-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder={t.productPicker.searchPlaceholder}
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeEntry ? optionId(activeEntry.id) : undefined}
              className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm text-gray-950 outline-none transition-colors focus:border-gray-300"
            />
          </div>
        </div>
        <div id={listboxId} role="listbox" data-popover-scroll="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {groups.length === 0 ? (
            <p className="px-2 py-3 text-sm text-gray-400">{t.productPicker.noResults}</p>
          ) : (
            groups.map((group) => (
              <div key={group.key} role="group" aria-label={group.label} className="mb-2 last:mb-0">
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{group.label}</p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {group.entries.map((entry) => {
                    const isActive: boolean = activeEntry?.id === entry.id;
                    const isStock: boolean = entry.count !== undefined;
                    return (
                      <div
                        key={entry.id}
                        id={optionId(entry.id)}
                        role="option"
                        aria-selected={entry.selected}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={entry.pick}
                        onMouseEnter={() => setActiveIndex(flat.indexOf(entry))}
                        className={cn(
                          "flex cursor-pointer gap-2 rounded-lg border px-2.5 py-2 transition-colors",
                          isStock ? "items-center" : "items-start",
                          entry.selected
                            ? cn(
                                entry.accent?.borderActive ?? "border-gold",
                                entry.accent?.bgActive ?? "bg-amber-50/60",
                              )
                            : "border-gray-200 bg-white",
                          isActive && !entry.selected && "border-gray-300 bg-gray-50",
                        )}
                      >
                        {isStock ? (
                          <Thumb imageUrl={entry.imageUrl} />
                        ) : entry.icon ? (
                          <entry.icon
                            className={cn(
                              "mt-0.5 h-4 w-4 shrink-0",
                              entry.selected ? entry.accent?.textActive : "text-gray-500",
                            )}
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-snug text-gray-900">{entry.title}</span>
                          {isStock ? (
                            <span className="block text-[11px] tabular-nums text-gray-400">{entry.count}</span>
                          ) : (
                            entry.hint &&
                            entry.hint !== entry.title && (
                              <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-gray-500">
                                {entry.hint}
                              </span>
                            )
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    ) : null;

  return (
    <>
      <div ref={containerRef} className={cn("relative block w-full min-w-0", className)}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => (open ? close() : openMenu())}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-label={ariaLabel}
          title={selectedTitle}
          className={cn(
            "flex min-h-9 w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-left text-sm leading-tight text-gray-950 shadow-sm transition-colors",
            open ? "border-gray-300" : "hover:border-gray-300 hover:bg-gray-50",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950",
            "disabled:cursor-not-allowed disabled:opacity-55",
            buttonClassName,
          )}
        >
          {current?.imageUrl ? (
            <span className="-my-0.5 h-7 w-7 shrink-0 overflow-hidden rounded border border-gray-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- catalog CDN / API URLs */}
              <img src={current.imageUrl} alt="" className="h-full w-full object-contain" onError={hideBroken} />
            </span>
          ) : SelectedIcon ? (
            <SelectedIcon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate">{selectedTitle}</span>
            {current?.subtitle && (
              <span className="block truncate text-[11px] font-medium text-gold-text">{current.subtitle}</span>
            )}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-gray-500 opacity-70 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>
      {popover && createPortal(popover, document.body)}
    </>
  );
}
