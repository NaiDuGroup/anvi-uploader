"use client";

import { useLanguageStore } from "@/stores/useLanguageStore";
import { notebookProductDisplayName } from "@/lib/notebook/notebookProductLabels";
import { cn } from "@/lib/utils";
import type { NotebookPaperKind } from "@/lib/notebook/notebookPaperKind";
import { NotebookPaperKindBadge } from "@/app/notebook/_components/NotebookPaperKindBadge";
import { formatAmountMdl } from "@/lib/money";
import { PublicImage } from "@/components/ui/PublicImage";

export type NotebookProductOption = {
  id: string;
  sku: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  imagePublicUrl: string | null;
  coverColorHex: string;
  strapColorHex: string;
  bookmarkColorHex: string;
  /** Paper layout (ruled / squared / dated). */
  paperKind: NotebookPaperKind;
  /** Per-product print area (cm) used to size the editor canvas. */
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  /** When false, the editor / approve pages skip the 3D preview entirely. */
  has3dPreview: boolean;
  sellPrice?: number | null;
};

export type NotebookProductSelection =
  | { type: "catalog"; productId: string }
  | { type: "other" };

export type NotebookProductPickerVariant =
  | "comfortable"
  | "compact"
  | "strip"
  | "admin"
  | "modal";

interface NotebookProductPickerProps {
  items: NotebookProductOption[];
  value: NotebookProductSelection | null;
  onChange: (v: NotebookProductSelection) => void;
  label: string;
  hint?: string;
  emptyMessage?: string;
  otherLabel: string;
  otherHint?: string;
  variant?: NotebookProductPickerVariant;
  className?: string;
  omitHeader?: boolean;
}

export function NotebookProductPicker({
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
}: NotebookProductPickerProps) {
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
          {emptyMessage ?? "No notebook products available."}
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

  return (
    <div className={cn(omitHeader ? "" : "space-y-2", className)}>
      {omitHeader ? null : header}
      <div className={gridClass}>
        {items.map((p) => {
          const selected = value?.type === "catalog" && value.productId === p.id;
          const displayName = notebookProductDisplayName(p, locale);
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
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ backgroundColor: p.coverColorHex }}
                      >
                        <span className="text-[9px] text-white/70 px-1 text-center">{displayName}</span>
                      </div>
                    }
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor: p.coverColorHex }}
                  >
                    <span className="text-[9px] text-white/70 px-1 text-center">{displayName}</span>
                  </div>
                )}
                <NotebookPaperKindBadge
                  kind={p.paperKind}
                  size="xs"
                  className="pointer-events-none absolute right-1 top-1 shadow-sm ring-2 ring-white/80"
                />
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

export function colorsFromNotebookProduct(p: NotebookProductOption | undefined): {
  coverColorHex: string;
  strapColorHex: string;
  bookmarkColorHex: string;
} {
  if (!p) {
    return {
      coverColorHex: "#1f1f1f",
      strapColorHex: "#1f1f1f",
      bookmarkColorHex: "#c0392b",
    };
  }
  return {
    coverColorHex: p.coverColorHex,
    strapColorHex: p.strapColorHex,
    bookmarkColorHex: p.bookmarkColorHex,
  };
}
