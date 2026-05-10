"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import {
  PRODUCT_TYPE_CONFIGS,
  buildEntryHint,
  buildEntryLabel,
  getEntryIcon,
  getProductTypeConfig,
  type PickerEntry,
  type ProductMode,
  type ProductTypeConfig,
} from "@/lib/productTypes";

export interface ProductTypeSelection {
  productId: string;
  mode?: ProductMode;
}

export interface ProductTypePickerProps {
  selected: ProductTypeSelection | null;
  onSelect: (selection: ProductTypeSelection) => void;
  /**
   * Compact = renders inside a modal (smaller cards, tighter grid).
   * Default (page mode) = larger cards, more breathing room.
   */
  compact?: boolean;
}

/**
 * Two-step product picker:
 *   1. Pick a product (with search). Non-customized products commit immediately.
 *   2. For customized products with multiple modes, pick a mode.
 *
 * Reads everything from `PRODUCT_TYPE_CONFIGS` so adding a new product is one
 * registry entry — no UI changes here.
 */
export function ProductTypePicker({
  selected,
  onSelect,
  compact = false,
}: ProductTypePickerProps) {
  const { t } = useLanguageStore();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<"product" | "mode">(
    selected && selected.productId
      ? (() => {
          const cfg = getProductTypeConfig(selected.productId);
          return cfg && cfg.modes.length > 0 && !selected.mode
            ? "mode"
            : "product";
        })()
      : "product",
  );
  const [pendingProductId, setPendingProductId] = useState<string | null>(
    selected?.productId ?? null,
  );

  const pendingProduct = pendingProductId
    ? getProductTypeConfig(pendingProductId)
    : undefined;

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PRODUCT_TYPE_CONFIGS;
    return PRODUCT_TYPE_CONFIGS.filter((p) => {
      const title = p.getTitle(t).toLowerCase();
      const hint = p.getHint(t).toLowerCase();
      return title.includes(q) || hint.includes(q);
    });
  }, [query, t]);

  function handleProductPick(product: ProductTypeConfig): void {
    if (product.modes.length === 0) {
      onSelect({ productId: product.id });
      setPendingProductId(product.id);
      setStage("product");
      return;
    }
    setPendingProductId(product.id);
    setStage("mode");
  }

  function handleModePick(product: ProductTypeConfig, mode: ProductMode): void {
    onSelect({ productId: product.id, mode });
  }

  const gridClass = compact
    ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
    : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

  return (
    <div className="space-y-3">
      {stage === "product" && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              {t.productPicker.pickProduct}
            </h3>
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.productPicker.searchPlaceholder}
                className="w-full rounded-md border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm shadow-sm placeholder:text-gray-400 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
              {t.productPicker.noResults}
            </p>
          ) : (
            <div className={gridClass}>
              {filteredProducts.map((product) => {
                const isActive =
                  selected?.productId === product.id &&
                  // Non-customized: active as soon as selected.
                  // Customized: highlight only when a mode is also chosen.
                  (product.modes.length === 0 || selected.mode != null);
                const Icon = product.icon;
                return (
                  <ProductCard
                    key={product.id}
                    isActive={isActive}
                    isPending={pendingProductId === product.id && !isActive}
                    accentBorder={product.accent.borderActive}
                    accentBg={product.accent.bgActive}
                    accentText={product.accent.textActive}
                    accentRing={product.accent.ringActive}
                    icon={<Icon className={compact ? "h-5 w-5" : "h-6 w-6"} />}
                    label={product.getTitle(t)}
                    hint={product.getHint(t)}
                    compact={compact}
                    onClick={() => handleProductPick(product)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {stage === "mode" && pendingProduct && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              {t.productPicker.pickMode}{" "}
              <span className="font-normal text-gray-500">
                — {pendingProduct.getTitle(t)}
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setStage("product")}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t.productPicker.back}
            </button>
          </div>

          <div className={gridClass}>
            {pendingProduct.modes.map((mode) => {
              const isActive =
                selected?.productId === pendingProduct.id &&
                selected.mode === mode.id;
              const entry: PickerEntry = {
                key: `${pendingProduct.id}__${mode.id}`,
                product: pendingProduct,
                mode,
              };
              const Icon = getEntryIcon(entry);
              return (
                <ProductCard
                  key={mode.id}
                  isActive={isActive}
                  isPending={false}
                  accentBorder={pendingProduct.accent.borderActive}
                  accentBg={pendingProduct.accent.bgActive}
                  accentText={pendingProduct.accent.textActive}
                  accentRing={pendingProduct.accent.ringActive}
                  icon={<Icon className={compact ? "h-5 w-5" : "h-6 w-6"} />}
                  label={buildEntryLabel(entry, t)}
                  hint={buildEntryHint(entry, t)}
                  compact={compact}
                  onClick={() => handleModePick(pendingProduct, mode.id)}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

interface ProductCardProps {
  isActive: boolean;
  isPending: boolean;
  accentBorder: string;
  accentBg: string;
  accentText: string;
  accentRing: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  compact: boolean;
  onClick: () => void;
}

function ProductCard({
  isActive,
  isPending,
  accentBorder,
  accentBg,
  accentText,
  accentRing,
  icon,
  label,
  hint,
  compact,
  onClick,
}: ProductCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-2 rounded-xl border-2 text-center transition-all",
        compact ? "px-3 py-4" : "px-4 py-5",
        isActive
          ? `${accentBorder} ${accentBg} shadow-md ring-1 ${accentRing}`
          : isPending
            ? `${accentBorder} bg-white shadow-sm`
            : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full transition-colors",
          compact ? "h-10 w-10" : "h-12 w-12",
          isActive ? "bg-gold text-white" : "bg-gray-100 text-gray-500",
        )}
      >
        {icon}
      </div>
      <span
        className={cn(
          "font-semibold leading-tight",
          compact ? "text-sm" : "text-base",
          isActive ? accentText : "text-gray-700",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "leading-snug text-gray-400",
          compact ? "text-[11px]" : "text-xs",
        )}
      >
        {hint}
      </span>
    </button>
  );
}
