"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAnchoredPopover } from "@/components/ui/useAnchoredPopover";
import {
  buildProductPickerSections,
  getProductTypeConfig,
  type ProductPickerItem,
  type ProductPickerSection,
} from "@/lib/productTypes";
import { cn } from "@/lib/utils";
import type { ProductType } from "@/lib/validations";
import { useLanguageStore } from "@/stores/useLanguageStore";

const POPOVER_MIN_WIDTH_PX = 620;
const POPOVER_MAX_HEIGHT_PX = 720;

export interface ProductTypeMenuProps {
  value: ProductType;
  /** Product types offered, in any order; the menu groups them itself. */
  options: readonly ProductType[];
  onChange: (next: ProductType) => void;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  ariaLabel?: string;
}

/**
 * Product type select for the order wizard: a trigger with icon + full name and
 * a popover of grouped tiles with search. Typing filters, ↑/↓ move, Enter picks.
 */
export function ProductTypeMenu({
  value,
  options,
  onChange,
  disabled = false,
  className,
  buttonClassName,
  ariaLabel,
}: ProductTypeMenuProps) {
  const { t } = useLanguageStore();
  const [open, setOpen] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId: string = `product-menu-${useId()}`;

  const sections: ProductPickerSection[] = useMemo(
    () => buildProductPickerSections(options, t, query),
    [options, t, query],
  );
  const flatItems: ProductPickerItem[] = useMemo(
    () => sections.flatMap((s) => s.items),
    [sections],
  );

  const close = useCallback((): void => {
    setOpen(false);
    setQuery("");
  }, []);

  const { containerRef, triggerRef, popoverRef, popoverStyle, mounted } = useAnchoredPopover({
    open,
    onClose: close,
    minWidthPx: POPOVER_MIN_WIDTH_PX,
    maxHeightPx: POPOVER_MAX_HEIGHT_PX,
    contentKey: flatItems.length,
  });

  const selectedConfig = getProductTypeConfig(value);
  const SelectedIcon: LucideIcon | null = selectedConfig?.icon ?? null;
  const selectedTitle: string = selectedConfig?.getTitle(t) ?? value;

  const optionId = (productType: ProductType): string => `${listboxId}-opt-${productType}`;

  function openMenu(): void {
    const all: ProductPickerItem[] = buildProductPickerSections(options, t, "").flatMap((s) => s.items);
    setActiveIndex(Math.max(0, all.findIndex((i) => i.config.dbProductType === value)));
    setOpen(true);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function pick(productType: ProductType): void {
    onChange(productType);
    close();
    triggerRef.current?.focus();
  }

  function moveActive(delta: number): void {
    if (flatItems.length === 0) return;
    const next: number = (activeIndex + delta + flatItems.length) % flatItems.length;
    setActiveIndex(next);
    const target = flatItems[next];
    if (target) {
      window.requestAnimationFrame(() =>
        document.getElementById(optionId(target.config.dbProductType))?.scrollIntoView({ block: "nearest" }),
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
      const target = flatItems[activeIndex];
      if (target) pick(target.config.dbProductType);
    } else if (e.key === "Escape") {
      close();
    }
  }

  const activeItem: ProductPickerItem | undefined = flatItems[activeIndex];

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
              aria-activedescendant={activeItem ? optionId(activeItem.config.dbProductType) : undefined}
              className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm text-gray-950 outline-none transition-colors focus:border-gray-300"
            />
          </div>
        </div>
        <div id={listboxId} role="listbox" data-popover-scroll="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {sections.length === 0 ? (
            <p className="px-2 py-3 text-sm text-gray-400">{t.productPicker.noResults}</p>
          ) : (
            sections.map((section) => (
              <div key={section.group} role="group" aria-label={t.productPicker.groups[section.group]} className="mb-2 last:mb-0">
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {t.productPicker.groups[section.group]}
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {section.items.map((item) => {
                    const productType: ProductType = item.config.dbProductType;
                    const Icon: LucideIcon = item.config.icon;
                    const isSelected: boolean = productType === value;
                    const isActive: boolean = activeItem?.config.dbProductType === productType;
                    return (
                      <div
                        key={productType}
                        id={optionId(productType)}
                        role="option"
                        aria-selected={isSelected}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(productType)}
                        onMouseEnter={() => setActiveIndex(flatItems.indexOf(item))}
                        className={cn(
                          "flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors",
                          isSelected
                            ? cn(item.config.accent.borderActive, item.config.accent.bgActive)
                            : "border-gray-200 bg-white",
                          isActive && !isSelected && "border-gray-300 bg-gray-50",
                        )}
                      >
                        <Icon
                          className={cn(
                            "mt-0.5 h-4 w-4 shrink-0",
                            isSelected ? item.config.accent.textActive : "text-gray-500",
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-snug text-gray-900">{item.title}</span>
                          {item.hint !== item.title && (
                            <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-gray-500">
                              {item.hint}
                            </span>
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
          {SelectedIcon ? <SelectedIcon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" /> : null}
          <span className="min-w-0 flex-1">{selectedTitle}</span>
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
