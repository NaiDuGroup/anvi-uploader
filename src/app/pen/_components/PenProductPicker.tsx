"use client";

import { useLanguageStore } from "@/stores/useLanguageStore";
import { Check, AlertCircle } from "lucide-react";
import { useMemo } from "react";

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

export function colorsFromPenProduct(product: PenProductOption | undefined) {
  return {
    bodyColorHex: product?.bodyColorHex ?? "#1f1f1f",
    clipColorHex: product?.clipColorHex ?? "#c0c0c0",
  };
}

interface PenProductPickerProps {
  variant: "strip" | "list";
  items: PenProductOption[];
  value: PenProductSelection | null;
  onChange: (sel: PenProductSelection) => void;
  label?: string;
  hint?: string;
  emptyMessage?: string;
  otherLabel?: string;
  otherHint?: string;
}

export function PenProductPicker({
  variant,
  items,
  value,
  onChange,
  label,
  hint,
  emptyMessage,
  otherLabel,
  otherHint,
}: PenProductPickerProps) {
  const { locale } = useLanguageStore();

  const localizedName = useMemo(
    () => (p: PenProductOption) => {
      if (locale === "ru") return p.nameRu;
      if (locale === "en") return p.nameEn;
      return p.nameRo;
    },
    [locale],
  );

  const selectedProductId = value?.type === "catalog" ? value.productId : null;

  if (variant === "strip") {
    const empty = items.length === 0;

    return (
      <div className="space-y-2">
        {label && <p className="text-sm font-medium text-gray-700">{label}</p>}
        {hint && <p className="text-xs text-gray-500">{hint}</p>}

        {empty && emptyMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{emptyMessage}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {items.map((p) => {
            const active = selectedProductId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ type: "catalog", productId: p.id })}
                className={`
                  group relative rounded-lg border-2 p-3 text-left transition-all
                  ${active ? "border-gold bg-gold/5" : "border-gray-200 bg-white hover:border-gray-300"}
                `}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-8 w-8 shrink-0 rounded border border-gray-200"
                    style={{ backgroundColor: p.bodyColorHex }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {localizedName(p)}
                    </p>
                    <p className="text-xs text-gray-500">{p.sku}</p>
                  </div>
                  {active && (
                    <Check className="ml-auto h-5 w-5 shrink-0 text-gold" />
                  )}
                </div>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onChange({ type: "other" })}
            className={`
              group relative rounded-lg border-2 p-3 text-left transition-all
              ${value?.type === "other" ? "border-gold bg-gold/5" : "border-gray-200 bg-white hover:border-gray-300"}
            `}
          >
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 shrink-0 rounded border border-dashed border-gray-300 bg-gray-50" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {otherLabel ?? "Other"}
                </p>
                {otherHint && <p className="text-xs text-gray-500">{otherHint}</p>}
              </div>
              {value?.type === "other" && (
                <Check className="ml-auto h-5 w-5 shrink-0 text-gold" />
              )}
            </div>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
