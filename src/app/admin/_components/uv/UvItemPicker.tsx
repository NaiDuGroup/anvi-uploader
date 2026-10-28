"use client";

import { useState } from "react";
import { ChevronRight, Hand } from "lucide-react";
import { localizedDtfName } from "@/lib/dtf/stockGarments";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { UvStockItemJson } from "@/lib/uv/dto";
import { cn } from "@/lib/utils";
import { StockItemPickerModal, StockItemThumb, stockItemFromPriceMdl } from "./StockItemPickerModal";

function formatNumber(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

/**
 * Picked stock item (photo, name, category · SKU · price) as a button that
 * opens {@link StockItemPickerModal} with every item of the print method.
 */
export function UvItemPicker({
  items,
  value,
  onChange,
  onPickClient,
  clientSelected = false,
  emptyLabel,
  t,
  locale,
  className,
  open: openProp,
  onOpenChange,
}: {
  items: readonly UvStockItemJson[];
  value: string | null;
  onChange: (variantId: string) => void;
  /** UV only: offer «the client's item» in the picker. */
  onPickClient?: () => void;
  clientSelected?: boolean;
  /** Trigger text when no stock item is picked (default «Выберите изделие»). */
  emptyLabel?: string;
  t: TranslationDictionary;
  locale: string;
  className?: string;
  /** Controlled open state (e.g. «Изменить» elsewhere in the row opens the same picker). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const p = t.uv.editor.picker;
  const cur: string = t.admin.currency;
  const [openState, setOpenState] = useState<boolean>(false);
  const open: boolean = openProp ?? openState;
  const setOpen = (next: boolean): void => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const selected: UvStockItemJson | undefined = items.find((i) => i.id === value);
  const price: number | null = selected ? stockItemFromPriceMdl(selected) : null;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={t.uv.editor.item}
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-gray-200 bg-white p-1.5 pr-2.5 text-left shadow-sm transition-colors",
          "hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950",
          className,
        )}
      >
        {selected ? (
          <>
            <StockItemThumb
              key={selected.id}
              item={selected}
              className="h-10 w-10 rounded-md border border-gray-200"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-gray-900">
                {localizedDtfName(selected.itemNames, locale)}
                {selected.variantLabel && <span className="font-normal text-gray-500"> · {selected.variantLabel}</span>}
              </span>
              <span className="block truncate text-[11px] text-gray-500">
                {localizedDtfName(selected.categoryNames, locale)} ·{" "}
                <span className="font-mono tracking-wide">{selected.sku}</span>
                {price != null && <> · {p.fromPrice(`${formatNumber(price, locale)} ${cur}`)}</>}
              </span>
            </span>
          </>
        ) : clientSelected ? (
          <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-400">
              <Hand className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-900">{t.uv.sources.client}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate px-1 py-2.5 text-[13px] text-gray-500">{emptyLabel ?? p.placeholder}</span>
        )}
        <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-gold-text">
          {selected || clientSelected ? p.change : null}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </button>
      <StockItemPickerModal
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        value={value}
        onPick={onChange}
        onPickClient={onPickClient}
        clientSelected={clientSelected}
        t={t}
        locale={locale}
      />
    </>
  );
}
