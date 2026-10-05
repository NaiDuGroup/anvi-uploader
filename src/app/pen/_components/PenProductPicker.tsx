"use client";

import { useLanguageStore } from "@/stores/useLanguageStore";
import { penProductDisplayName } from "@/lib/pen/penProductLabels";
import { cn } from "@/lib/utils";
import { formatAmountMdl } from "@/lib/money";
import { PublicImage } from "@/components/ui/PublicImage";

export interface PenProductOption {
  id: string;
  sku: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  imagePublicUrl: string | null;
  bodyColorHex: string;
  clipColorHex: string;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
  displayPrice: number | null;
  priceTier: "retail" | "dealer";
  sellPrice: number | null;
}

export type PenProductSelection =
  | { type: "catalog"; productId: string }
  | { type: "other" };

export type PenProductPickerVariant = "strip" | "admin" | "modal";

export function colorsFromPenProduct(product: PenProductOption | undefined) {
  return {
    bodyColorHex: product?.bodyColorHex ?? "#1f1f1f",
    clipColorHex: product?.clipColorHex ?? "#c0c0c0",
  };
}

interface PenProductPickerProps {
  items: PenProductOption[];
  value: PenProductSelection | null;
  onChange: (sel: PenProductSelection) => void;
  label: string;
  hint?: string;
  emptyMessage?: string;
  otherLabel: string;
  otherHint?: string;
  variant?: PenProductPickerVariant;
  className?: string;
  omitHeader?: boolean;
}

/**
 * Catalog grid of pen SKUs, laid out like `NotebookProductPicker` so the two
 * wizards read the same. The one deliberate difference is `object-contain` in
 * every variant: a pen photo is tall and narrow, and the `cover` the notebook
 * uses for its near-square covers would crop it to a sliver.
 */
export function PenProductPicker({
  items,
  value,
  onChange,
  label,
  hint,
  emptyMessage,
  otherLabel,
  otherHint,
  variant = "strip",
  className,
  omitHeader = false,
}: PenProductPickerProps) {
  const locale = useLanguageStore((s) => s.locale);
  const t = useLanguageStore((s) => s.t);

  const otherSelected = value?.type === "other";

  if (items.length === 0) {
    return (
      <div className={cn(omitHeader ? "" : "space-y-2", className)}>
        {omitHeader ? null : (
          <div>
            <p className="text-sm font-semibold text-gray-800">{label}</p>
            {hint ? <p className="text-xs text-gray-500 mt-0.5">{hint}</p> : null}
          </div>
        )}
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
          {emptyMessage ?? "No pen products available."}
        </div>
        <button
          type="button"
          onClick={() => onChange({ type: "other" })}
          className={cn(
            "w-full rounded-lg border-2 px-3 py-2 text-left text-sm font-medium transition-colors",
            otherSelected
              ? "border-gold ring-2 ring-gold/25 bg-amber-50/50 text-gray-900"
              : "border-gray-200 bg-white hover:border-gray-300 text-gray-800",
          )}
        >
          <span className="block">{otherLabel}</span>
          {otherHint ? (
            <span className="block text-[11px] font-normal text-gray-500 mt-0.5">{otherHint}</span>
          ) : null}
        </button>
      </div>
    );
  }

  const isModal = variant === "modal";
  const isAdmin = variant === "admin";

  const gridClass = isModal
    ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 max-h-[min(calc(90vh-11rem),700px)] overflow-y-auto pr-1 [scrollbar-width:thin]"
    : isAdmin
      ? "grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[min(52vh,380px)] sm:max-h-[400px] overflow-y-auto pr-0.5 [scrollbar-width:thin]"
      : "grid grid-cols-3 gap-2 max-h-[min(56vh,420px)] sm:max-h-[440px] overflow-y-auto pr-0.5 [scrollbar-width:thin]";

  return (
    <div className={cn(omitHeader ? "" : "space-y-2", className)}>
      {omitHeader ? null : (
        <div className="px-0.5">
          <p className="text-sm font-semibold text-gray-800">{label}</p>
          {hint ? (
            <p className="text-[11px] leading-snug text-gray-500 mt-0.5">{hint}</p>
          ) : null}
        </div>
      )}
      <div className={gridClass}>
        {items.map((p) => {
          const selected = value?.type === "catalog" && value.productId === p.id;
          const displayName = penProductDisplayName(p, locale);
          const colorFallback = (
            <div
              className="w-full h-full flex items-center justify-center rounded"
              style={{ backgroundColor: p.bodyColorHex }}
            >
              <span className="text-[9px] text-white/70 px-1 text-center">{displayName}</span>
            </div>
          );
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ type: "catalog", productId: p.id })}
              className={cn(
                "rounded-lg border-2 text-left overflow-hidden transition-all flex flex-col bg-white",
                selected
                  ? "border-gold ring-2 ring-gold/25 shadow-md"
                  : "border-gray-200 hover:border-gray-300",
              )}
            >
              <div className="h-[5.5rem] sm:h-28 w-full flex items-center justify-center bg-gray-50/95 p-1.5">
                {p.imagePublicUrl ? (
                  <PublicImage
                    src={p.imagePublicUrl}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    fallback={colorFallback}
                  />
                ) : (
                  colorFallback
                )}
              </div>
              <div className="flex flex-col items-stretch gap-0.5 p-1.5 min-h-[2.75rem]">
                <p className="font-medium text-gray-900 line-clamp-2 leading-snug w-full text-xs sm:text-[13px]">
                  {displayName}
                </p>
                {p.sellPrice != null && (
                  <p className="font-semibold text-gold tabular-nums leading-tight mt-0.5 text-[11px] sm:text-sm">
                    {formatAmountMdl(p.sellPrice, t.admin.currency)}
                  </p>
                )}
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange({ type: "other" })}
          className={cn(
            "rounded-lg border-2 text-left overflow-hidden transition-all flex flex-col justify-center p-2 min-h-[8.5rem] sm:min-h-[9.25rem]",
            otherSelected
              ? "border-gold ring-2 ring-gold/25 shadow-md bg-amber-50/40"
              : "border-dashed border-gray-300 bg-gray-50/80 hover:border-amber-300 hover:bg-amber-50/30",
          )}
        >
          <span className="font-semibold text-gray-800 leading-snug text-[11px] sm:text-xs">
            {otherLabel}
          </span>
          {otherHint ? (
            <span className="text-gray-500 mt-1 leading-snug text-[9px] sm:text-[10px] line-clamp-3">
              {otherHint}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
