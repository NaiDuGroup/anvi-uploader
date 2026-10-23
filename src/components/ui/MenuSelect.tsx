"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnchoredPopover } from "./useAnchoredPopover";

/**
 * Single-value select rendered as a custom popup so it can be styled
 * consistently with the rest of the app (the native `<select>` popup is
 * rendered by the OS and can't be themed).
 *
 * Visual contract aligns with admin filters (e.g. orders status): thin gray
 * border (`border-gray-200` / hover `gray-300`), rounded-lg trigger, list
 * `border-gray-200` + `shadow-lg` — no gold ring/stack when open.
 *
 * The list renders in a `fixed` portal so wrappers with `overflow-x-auto`
 * (e.g. data tables) do not clip the menu or change row heights.
 */
export interface MenuSelectOption<TValue extends string | number> {
  value: TValue;
  label: string;
  /** Decorative preview left of label (use `alt=""` on images). Shown on the trigger when selected. */
  leading?: ReactNode;
  /** Secondary line under `label`, e.g. SKU. */
  description?: string;
}

export interface MenuSelectProps<TValue extends string | number> {
  value: TValue;
  options: ReadonlyArray<MenuSelectOption<TValue>>;
  onChange: (next: TValue) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
  buttonClassName?: string;
  leadingIcon?: ReactNode;
  /** Extra classes on the list (scroll, padding tweaks). Geometry uses inline styles. */
  listClassName?: string;
  /**
   * Minimum dropdown width (px); useful for catalog scans. Effective width respects viewport.
   */
  popoverMinWidthPx?: number;
  /** Show a search box at the top of the list that filters by label/description. */
  searchable?: boolean;
  /** Placeholder for the search box (when `searchable`). */
  searchPlaceholder?: string;
}

export function MenuSelect<TValue extends string | number>({
  value,
  options,
  onChange,
  disabled = false,
  className,
  id,
  ariaLabel,
  buttonClassName,
  leadingIcon,
  listClassName,
  popoverMinWidthPx = 0,
  searchable = false,
  searchPlaceholder,
}: MenuSelectProps<TValue>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const reactId = useId();
  const listboxId = id ?? `menusel-${reactId}`;

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const { containerRef, triggerRef, popoverRef, popoverStyle, mounted } = useAnchoredPopover({
    open,
    onClose: close,
    minWidthPx: popoverMinWidthPx,
    contentKey: options.length,
  });

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    if (!searchable) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const haystack = `${o.label} ${o.description ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query, searchable]);

  const triggerLeading = selected?.leading ?? leadingIcon;

  useEffect(() => {
    if (!open || !searchable) return;
    const raf = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, searchable]);

  const handleSelect = useCallback(
    (next: TValue) => {
      onChange(next);
      close();
    },
    [onChange, close],
  );

  const dropdown =
    mounted && typeof document !== "undefined" && open && popoverStyle ? (
      <div
        ref={popoverRef}
        className={cn(
          "fixed z-[130] flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg text-gray-950",
        )}
        style={popoverStyle}
        onMouseDown={(e) => {
          /* avoid losing focus before item click resolves; but let the search
             input receive clicks/typing */
          if (e.target !== searchInputRef.current) e.preventDefault();
        }}
      >
        {searchable ? (
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
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") close();
                }}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm text-gray-950 outline-none transition-colors focus:border-gray-300"
              />
            </div>
          </div>
        ) : null}
        <ul
          id={`${listboxId}-list`}
          role="listbox"
          aria-activedescendant={
            selected ? `${listboxId}-opt-${selected.value}` : undefined
          }
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain py-1",
            listClassName,
          )}
        >
          {filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">—</li>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = opt.value === value;
              const hasRichRow = Boolean(opt.leading || opt.description);
              return (
                <li
                  key={String(opt.value)}
                  id={`${listboxId}-opt-${opt.value}`}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors tabular-nums",
                    isSelected
                      ? "bg-gray-100 font-medium text-gray-900"
                      : "text-gray-700 hover:bg-gray-50",
                  )}
                >
                  {opt.leading ? (
                    <span className="shrink-0" aria-hidden="true">
                      {opt.leading}
                    </span>
                  ) : null}
                  {hasRichRow ? (
                    <div className="min-w-0 flex-1">
                      <span className="block truncate leading-snug">{opt.label}</span>
                      {opt.description ? (
                        <span className="mt-0.5 block truncate font-mono text-[11px] font-normal tracking-wide text-gray-600">
                          {opt.description}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  )}
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>
    ) : null;

  return (
    <>
      <div ref={containerRef} className={cn("relative block min-w-0 w-full", className)}>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          onClick={() => {
            if (disabled) return;
            if (open) close();
            else setOpen(true);
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? `${listboxId}-list` : undefined}
          aria-label={ariaLabel}
          className={cn(
            "flex min-h-9 w-full items-center rounded-lg border border-gray-200 bg-white px-3 py-0 text-[15px] leading-none tracking-tight text-gray-950 shadow-sm transition-colors tabular-nums",
            open
              ? "z-[40] border-gray-300"
              : "hover:border-gray-300 hover:bg-gray-50",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950",
            "disabled:cursor-not-allowed disabled:opacity-55",
            buttonClassName,
          )}
        >
          {triggerLeading ? (
            <span className="-ml-1 mr-2 flex shrink-0 items-center" aria-hidden="true">
              {triggerLeading}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-left">
            {selected?.label ?? ""}
          </span>
          <ChevronDown
            className={cn(
              "ml-2 h-4 w-4 shrink-0 text-gray-500 opacity-70 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </div>
      {dropdown && mounted && createPortal(dropdown, document.body)}
    </>
  );
}
