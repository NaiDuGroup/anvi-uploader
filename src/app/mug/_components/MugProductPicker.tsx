"use client";

import type { StockItemDescription } from "@/lib/stock/unified/itemDescription";
import { MUG_SHAPE_DEFAULTS, parseMugShape, type MugHandleStyle, type MugShape } from "@/lib/mug/mugShape";
import type { MugPrintArea } from "@/lib/mug/mugGeometry";
import { MUG_SURFACE_DEFAULTS, parseMugSurface, type MugFinish, type MugSurface } from "@/lib/mug/mugSurface";
import { useState } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { mugProductDisplayName } from "@/lib/mug/mugProductLabels";
import { cn } from "@/lib/utils";
import { formatAmountMdl } from "@/lib/money";
import { PublicImage } from "@/components/ui/PublicImage";
import { OtherPickRow, ProductPickRow } from "@/components/catalog/ProductPickRow";
import { ProductDetailSheet, productImageList } from "@/components/catalog/ProductDetailSheet";
import { localizedDescription } from "@/lib/stock/unified/itemDescription";

export type MugProductOption = {
  /** Extra photos for the product window. */
  galleryPublicUrls?: string[];
  /** Client-facing description { ru, ro, en }. */
  description?: StockItemDescription | null;
  id: string;
  sku: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  imagePublicUrl: string | null;
  bodyColorHex: string;
  handleColorHex: string;
  innerColorHex: string | null;
  rimColorHex: string | null;
  /** 3D surface (finish + bottom gradient); older API payloads may omit it. */
  finish?: MugFinish;
  gradientColorHex?: string | null;
  gradientHeightPct?: number;
  /** 3D body sizes + handle; older API payloads may omit them. */
  bodyHeightCm?: number;
  topDiameterCm?: number;
  bottomDiameterCm?: number;
  handleStyle?: MugHandleStyle;
  /** Per-product print area (cm) used to size the editor canvas. */
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  /** When false, the editor / approve pages skip the 3D preview entirely. */
  has3dPreview: boolean;
  /** Retail price from catalog (MDL); omitted or null if not set */
  sellPrice?: number | null;
};

export type MugProductSelection =
  | { type: "catalog"; productId: string }
  | { type: "other" };

export type MugProductPickerVariant =
  | "comfortable"
  | "compact"
  | "strip"
  | "admin"
  /** Dense grid inside a large modal — search/filter is provided externally */
  | "modal";

interface MugProductPickerProps {
  items: MugProductOption[];
  value: MugProductSelection | null;
  onChange: (v: MugProductSelection) => void;
  label: string;
  hint?: string;
  emptyMessage?: string;
  otherLabel: string;
  otherHint?: string;
  /**
   * `compact` — dense grid (3–4 columns).
   * `strip` — client mug step: list rows (photo, full name, price), no inner scroll.
   * `admin` — studio modal: 3–4 columns, larger thumbnails, `object-contain` so the whole mug is visible.
   * `modal` — wide grid inside a fullscreen-style modal overlay.
   * `comfortable` — larger legacy tiles.
   */
  variant?: MugProductPickerVariant;
  className?: string;
  omitHeader?: boolean;
}

export function MugProductPicker({
  items,
  value,
  onChange,
  label,
  hint,
  emptyMessage,
  otherLabel,
  otherHint,
  variant = "compact",
  className,
  omitHeader = false,
}: MugProductPickerProps) {
  const locale = useLanguageStore((s) => s.locale);
  const t = useLanguageStore((s) => s.t);
  const [detailId, setDetailId] = useState<string | null>(null);

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
          {emptyMessage ?? "No mug products available."}
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

  const isComfortable = variant === "comfortable";
  const isStrip = variant === "strip";
  const isAdmin = variant === "admin";
  const isModal = variant === "modal";

  const gridClass = isComfortable
    ? "grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[min(320px,50vh)] overflow-y-auto pr-1 [scrollbar-width:thin]"
    : isStrip
      ? "grid grid-cols-3 gap-2 max-h-[min(56vh,420px)] sm:max-h-[440px] overflow-y-auto pr-0.5 [scrollbar-width:thin]"
      : isModal
        ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 max-h-[min(calc(90vh-11rem),700px)] overflow-y-auto pr-1 [scrollbar-width:thin]"
        : isAdmin
          ? "grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[min(52vh,380px)] sm:max-h-[400px] overflow-y-auto pr-0.5 [scrollbar-width:thin]"
          : "grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-[200px] sm:max-h-[220px] overflow-y-auto pr-0.5 [scrollbar-width:thin]";

  const header = (
    <div className={cn((isStrip || isAdmin || isModal) && "px-0.5")}>
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      {hint ? (
        <p
          className={cn(
            "text-gray-500 mt-0.5",
            isStrip || isAdmin || isModal ? "text-[11px] leading-snug" : "text-xs",
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );

  if (isStrip) {
    const detail = detailId ? items.find((i) => i.id === detailId) : undefined;
    return (
      <div className={cn(omitHeader ? "" : "space-y-2", className)}>
        {omitHeader ? null : header}
        <div className="flex flex-col gap-2">
          {items.map((p) => {
            const displayName = mugProductDisplayName(p, locale);
            return (
              <ProductPickRow
                key={p.id}
                selected={value?.type === "catalog" && value.productId === p.id}
                onClick={() => onChange({ type: "catalog", productId: p.id })}
                onOpenDetails={() => setDetailId(p.id)}
                detailsLabel={t.productWindow.details}
                name={displayName}
                price={p.sellPrice != null ? formatAmountMdl(p.sellPrice, t.admin.currency) : null}
                image={
                  p.imagePublicUrl ? (
                    <PublicImage
                      src={p.imagePublicUrl}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : null
                }
              />
            );
          })}
          {detail && (
            <ProductDetailSheet
              open
              onClose={() => setDetailId(null)}
              images={productImageList(detail.imagePublicUrl, detail.galleryPublicUrls)}
              name={mugProductDisplayName(detail, locale)}
              price={detail.sellPrice != null ? formatAmountMdl(detail.sellPrice, t.admin.currency) : null}
              description={localizedDescription(detail.description, locale)}
              selected={value?.type === "catalog" && value.productId === detail.id}
              onChoose={() => onChange({ type: "catalog", productId: detail.id })}
            />
          )}
          <OtherPickRow
            selected={otherSelected}
            onClick={() => onChange({ type: "other" })}
            label={otherLabel}
            hint={otherHint}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(omitHeader ? "" : "space-y-2", className)}>
      {omitHeader ? null : header}
      <div className={gridClass}>
        {items.map((p) => {
          const selected = value?.type === "catalog" && value.productId === p.id;
          const displayName = mugProductDisplayName(p, locale);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ type: "catalog", productId: p.id })}
              className={cn(
                "rounded-xl border-2 text-left overflow-hidden transition-all flex flex-col bg-white",
                isComfortable ? "rounded-xl" : "rounded-lg",
                selected
                  ? "border-gold ring-2 ring-gold/25 shadow-md"
                  : "border-gray-200 hover:border-gray-300",
              )}
            >
              <div
                className={cn(
                  "bg-gray-100 relative",
                  isComfortable && "aspect-square",
                  !isComfortable && !isAdmin && !isModal && "h-16 w-full",
                  (isAdmin || isModal) &&
                    "h-[5.5rem] sm:h-28 w-full flex items-center justify-center bg-gray-50/95 p-1.5",
                )}
              >
                {p.imagePublicUrl ? (
                  <PublicImage
                    src={p.imagePublicUrl}
                    alt=""
                    className={cn(
                      isAdmin || isModal
                        ? "max-h-full max-w-full object-contain"
                        : "w-full h-full object-cover",
                    )}
                    fallback={
                      <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-400 px-1 text-center">
                        {displayName}
                      </div>
                    }
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-400 px-1 text-center">
                    {displayName}
                  </div>
                )}
              </div>
              <div
                className={cn(
                  "flex flex-col items-stretch gap-0.5",
                  isComfortable ? "p-2 min-h-[2.5rem]" : "p-1.5 min-h-[2.35rem]",
                  (isAdmin || isModal) && "min-h-[2.75rem]",
                )}
              >
                <p
                  className={cn(
                    "font-medium text-gray-900 line-clamp-2 leading-snug w-full",
                    isComfortable ? "text-xs" : "text-[10px] sm:text-[11px]",
                    (isAdmin || isModal) && "text-xs sm:text-[13px]",
                  )}
                >
                  {displayName}
                </p>
                {p.sellPrice != null && (
                  <p
                    className={cn(
                      "font-semibold text-gold tabular-nums leading-tight mt-0.5",
                      isComfortable ? "text-xs" : "text-[10px] sm:text-[11px]",
                      (isAdmin || isModal) && "text-[11px] sm:text-sm",
                    )}
                  >
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
            "rounded-xl border-2 text-left overflow-hidden transition-all flex flex-col justify-center",
            isComfortable ? "min-h-[120px] p-3 rounded-xl" : "min-h-[4.75rem] p-2 rounded-lg col-span-1",
            (isAdmin || isModal) && "min-h-[8.5rem] sm:min-h-[9.25rem]",
            otherSelected
              ? "border-gold ring-2 ring-gold/25 shadow-md bg-amber-50/40"
              : "border-dashed border-gray-300 bg-gray-50/80 hover:border-amber-300 hover:bg-amber-50/30",
          )}
        >
          <span
            className={cn(
              "font-semibold text-gray-800 leading-snug",
              isComfortable ? "text-sm" : "text-[11px] sm:text-xs",
            )}
          >
            {otherLabel}
          </span>
          {otherHint ? (
            <span
              className={cn(
                "text-gray-500 mt-1 leading-snug",
                isComfortable ? "text-[11px]" : "text-[9px] sm:text-[10px] line-clamp-3",
              )}
            >
              {otherHint}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

export function colorsFromProduct(p: MugProductOption | undefined): {
  bodyColorHex: string;
  handleColorHex: string;
  innerColorHex: string;
  rimColorHex: string;
  surface: MugSurface;
  shape: MugShape;
  print: MugPrintArea | null;
} {
  if (!p) {
    return {
      bodyColorHex: "#f5f5f0",
      handleColorHex: "#a8a29e",
      innerColorHex: "#f5f5f0",
      rimColorHex: "#f5f5f0",
      surface: MUG_SURFACE_DEFAULTS,
      shape: MUG_SHAPE_DEFAULTS,
      print: null,
    };
  }
  const body = p.bodyColorHex;
  return {
    bodyColorHex: body,
    handleColorHex: p.handleColorHex,
    innerColorHex: p.innerColorHex ?? body,
    rimColorHex: p.rimColorHex ?? body,
    surface: parseMugSurface(p),
    shape: parseMugShape(p),
    print: { widthCm: p.printWidthCm, heightCm: p.printHeightCm },
  };
}
