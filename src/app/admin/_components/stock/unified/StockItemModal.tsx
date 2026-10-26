"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { formatAmountInput, parseAmountMdl, sanitizeMoneyInput } from "@/lib/money";
import { StockCategoryKind, unitAllowsFractions, type StockUnit } from "@/lib/stock/unified/kinds";
import type { StockCategoryJson, StockItemJson, StockVariantJson } from "@/lib/stock/unified/adminTypes";
import { formatQuantity, parseQuantityInput, sanitizeQuantityInput } from "@/lib/stock/unified/quantity";
import type { GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";
import {
  defaultTierDrafts,
  draftsToTiers,
  formatTierPrice,
  sameTiers,
  singlePiecePrice,
  tierColorKey,
  tierGroupsFromVariants,
  tiersByColor,
  tiersToDrafts,
  type TierDraft,
  type TierGroup,
  type TierParseError,
} from "@/lib/stock/unified/garmentTiers";
import { priceTierScope, type PriceTierScope } from "@/lib/stock/unified/printMethods";
import {
  applyPricesToAll,
  COMMON_CLOTHING_SIZES,
  duplicateSkus,
  emptyVariantDraft,
  generateVariantGrid,
  gridAxesFromDrafts,
  mergeVariantDrafts,
  resyncVariantSkus,
  type ColorChoice,
  type VariantDraft,
} from "@/lib/stock/unified/variantGrid";
import { ColorSwatch, fieldLabelCls, PhotoDropzone } from "./StockBits";
import { StockRequestError, stockErrorMessage, stockFetch, uploadStockPhoto } from "./stockApi";
import { StockTierEditor } from "./StockTierEditor";

type Mode = "single" | "grid";

type BulkPrices = Pick<VariantDraft, "sellPrice" | "dealerPrice" | "purchaseCost" | "reorderLevel">;

const EMPTY_BULK: BulkPrices = { sellPrice: "", dealerPrice: "", purchaseCost: "", reorderLevel: "" };

function draftFromVariant(v: StockVariantJson): VariantDraft {
  return {
    key: v.id,
    id: v.id,
    sku: v.sku,
    label: v.label ?? "",
    options: v.options,
    sellPrice: formatAmountInput(v.sellPrice),
    dealerPrice: formatAmountInput(v.dealerPrice),
    purchaseCost: formatAmountInput(v.purchaseCost),
    reorderLevel: v.reorderLevel == null ? "" : formatQuantity(v.reorderLevel),
    isActive: v.isActive,
    sortOrder: v.sortOrder,
    skuEdited: true,
  };
}

/** Tier-editor key of one variant row (UV / sublimation blanks have tiers per variant). */
function variantTierKey(draftKey: string): string {
  return `v:${draftKey}`;
}

type VariantPayload = {
  sku: string;
  label: string | null;
  options: VariantDraft["options"];
  sellPrice: number | null;
  dealerPrice: number | null;
  purchaseCost: number | null;
  reorderLevel: number | null;
  /** Sent only for printed categories (DTF / UV / sublimation); null clears. */
  priceTiers?: GarmentPriceTier[] | null;
  isActive: boolean;
  sortOrder: number;
};

function toPayload(d: VariantDraft, unit: StockUnit, index: number): VariantPayload {
  return {
    sku: d.sku.trim(),
    label: d.label.trim() || null,
    options: d.options,
    sellPrice: parseAmountMdl(d.sellPrice),
    dealerPrice: parseAmountMdl(d.dealerPrice),
    purchaseCost: parseAmountMdl(d.purchaseCost),
    reorderLevel: parseQuantityInput(d.reorderLevel, unit, { allowZero: true }),
    isActive: d.isActive,
    sortOrder: index,
  };
}

function samePayload(a: VariantPayload, v: StockVariantJson): boolean {
  return (
    a.sku === v.sku &&
    a.label === (v.label ?? null) &&
    JSON.stringify(a.options) === JSON.stringify(v.options) &&
    a.sellPrice === v.sellPrice &&
    a.dealerPrice === v.dealerPrice &&
    a.purchaseCost === v.purchaseCost &&
    a.reorderLevel === v.reorderLevel &&
    (a.priceTiers === undefined || sameTiers(a.priceTiers, v.priceTiers)) &&
    a.isActive === v.isActive &&
    a.sortOrder === v.sortOrder
  );
}

function tierErrorText(error: TierParseError, color: string, s: TranslationDictionary["stock"]): string {
  switch (error) {
    case "duplicate_qty":
      return s.errorTiersDuplicate(color);
    case "need_single_piece":
      return s.errorTiersNeedSingle(color);
    case "too_many":
      return s.errorTiersTooMany(color);
    case "invalid":
      return s.errorTiersInvalid(color);
  }
}

/** Create / edit an item with its variants (single row, or colour × size grid). */
export function StockItemModal({
  category,
  item,
  onClose,
  onSaved,
}: {
  category: StockCategoryJson;
  item: StockItemJson | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useLanguageStore();
  const s = t.stock;
  const unit: StockUnit = category.unit;
  const initialDrafts: VariantDraft[] = item ? item.variants.map(draftFromVariant) : [];
  const initialAxes = gridAxesFromDrafts(initialDrafts);
  const initialMode: Mode = item
    ? item.variants.length > 1 || initialAxes.colors.length > 0 || initialAxes.sizes.length > 0
      ? "grid"
      : "single"
    : category.kind === StockCategoryKind.Product && !unitAllowsFractions(unit)
      ? "grid"
      : "single";

  const [sku, setSku] = useState<string>(item?.sku ?? "");
  const [nameRo, setNameRo] = useState<string>(item?.nameRo ?? "");
  const [nameRu, setNameRu] = useState<string>(item?.nameRu ?? "");
  const [nameEn, setNameEn] = useState<string>(item?.nameEn ?? "");
  const [notes, setNotes] = useState<string>(item?.internalNotes ?? "");
  const [active, setActive] = useState<boolean>(item?.isActive ?? true);
  const [sellable, setSellable] = useState<boolean>(item?.isSellable ?? false);
  const [imageKey, setImageKey] = useState<string | null>(item?.imageUrl ?? null);
  const [preview, setPreview] = useState<string | null>(item?.imagePublicUrl ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [drafts, setDrafts] = useState<VariantDraft[]>(
    initialDrafts.length > 0 ? initialDrafts : initialMode === "single" ? [emptyVariantDraft("single", 0)] : [],
  );
  const [colors, setColors] = useState<ColorChoice[]>(initialAxes.colors);
  const [sizes, setSizes] = useState<string[]>(initialAxes.sizes);
  const [colorName, setColorName] = useState<string>("");
  const [colorHex, setColorHex] = useState<string>("#1f2937");
  const [sizeInput, setSizeInput] = useState<string>("");
  const [bulk, setBulk] = useState<BulkPrices>(EMPTY_BULK);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // «Тиражные цены» for printed categories: per colour for DTF garments, per
  // variant for UV / sublimation blanks (each fabric or format has its own
  // prices). A DTF colour without an entry starts empty on an existing item and
  // from the studio price list on a new one; a variant starts empty.
  const tierScope: PriceTierScope | null = priceTierScope(category);
  const [tierRows, setTierRows] = useState<Record<string, TierDraft[]>>(() => {
    const out: Record<string, TierDraft[]> = {};
    if (!item) return out;
    if (tierScope === "variant") {
      for (const v of item.variants) if (v.priceTiers && v.priceTiers.length > 0) out[variantTierKey(v.id)] = tiersToDrafts(v.priceTiers);
    } else {
      for (const [key, tiers] of tiersByColor(item.variants)) out[key] = tiersToDrafts(tiers);
    }
    return out;
  });
  const tierGroups: TierGroup[] =
    tierScope === "color"
      ? tierGroupsFromVariants(drafts)
      : tierScope === "variant"
        ? drafts.map((d) => ({
            key: variantTierKey(d.key),
            color: d.label.trim() || d.sku.trim() || null,
            hex: d.options.colorHex,
          }))
        : [];

  function tierKeyFor(d: VariantDraft): string {
    return tierScope === "variant" ? variantTierKey(d.key) : tierColorKey(d.options);
  }

  function rowsFor(g: TierGroup): TierDraft[] {
    if (tierRows[g.key]) return tierRows[g.key];
    if (item || tierScope !== "color") return [];
    return defaultTierDrafts(category.code, { name: g.color ?? undefined, hex: g.hex });
  }

  function groupTitle(g: TierGroup): string {
    return g.color ?? s.tiersAllVariants;
  }

  /** 1-piece price from the group's valid tiers, for the read-only «Цена» cell. */
  function tierPriceFor(d: VariantDraft): number | null {
    if (!tierScope) return null;
    const g: TierGroup | undefined = tierGroups.find((x) => x.key === tierKeyFor(d));
    if (!g) return null;
    const parsed = draftsToTiers(rowsFor(g));
    return parsed.ok ? singlePiecePrice(parsed.tiers) : null;
  }

  function regrid(nextColors: ColorChoice[], nextSizes: string[]): void {
    setColors(nextColors);
    setSizes(nextSizes);
    setDrafts((prev) => mergeVariantDrafts(prev, generateVariantGrid(sku, nextColors, nextSizes), bulk));
  }

  function changeSku(next: string): void {
    const clean: string = next.toUpperCase().replace(/[^A-Z0-9._-]/g, "");
    setSku(clean);
    setDrafts((prev) => resyncVariantSkus(prev, clean));
  }

  function switchMode(next: Mode): void {
    if (next === mode) return;
    setMode(next);
    if (next === "single" && drafts.length === 0) {
      setDrafts(resyncVariantSkus([emptyVariantDraft("single", 0)], sku));
    }
    if (next === "grid") {
      setDrafts((prev) => prev.filter((d) => d.id || d.options.color || d.options.size));
    }
  }

  function addColor(): void {
    const name: string = colorName.trim();
    if (!name || colors.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    regrid([...colors, { name, hex: colorHex }], sizes);
    setColorName("");
  }

  function addSizes(values: readonly string[]): void {
    const next: string[] = [...sizes];
    for (const raw of values) {
      const v: string = raw.trim();
      if (v && !next.some((x) => x.toLowerCase() === v.toLowerCase())) next.push(v);
    }
    regrid(colors, next);
  }

  function patchDraft(key: string, p: Partial<VariantDraft>): void {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...p } : d)));
  }

  function removeDraft(d: VariantDraft): void {
    if (d.id) setRemovedIds((prev) => [...prev, d.id!]);
    setDrafts((prev) => prev.filter((x) => x.key !== d.key));
  }

  async function save(): Promise<void> {
    const names: string[] = [nameRu, nameRo, nameEn].map((n) => n.trim());
    const fallback: string = names.find((n) => n) ?? "";
    if (!fallback) return setError(s.errorNameRequired);
    if (!sku.trim()) return setError(s.errorSkuRequired);
    if (drafts.length === 0) return setError(s.errorNoVariants);
    if (drafts.some((d) => !d.sku.trim())) return setError(s.errorVariantSkuRequired);
    const dup: string[] = duplicateSkus(drafts.map((d) => d.sku));
    if (dup.length > 0) return setError(s.errorDuplicateSku(dup.join(", ")));
    const tiersByKey = new Map<string, GarmentPriceTier[] | null>();
    for (const g of tierGroups) {
      const parsed = draftsToTiers(rowsFor(g));
      if (!parsed.ok) return setError(tierErrorText(parsed.error, groupTitle(g), s));
      tiersByKey.set(g.key, parsed.tiers);
    }
    const payloads: VariantPayload[] = drafts.map((d, i) => {
      const payload: VariantPayload = toPayload(d, unit, i);
      if (tierScope) {
        const tiers: GarmentPriceTier[] | null = tiersByKey.get(tierKeyFor(d)) ?? null;
        payload.priceTiers = tiers;
        // Per-variant blanks: the 1-piece price is the variant's sell price (what orders fall back to).
        const single: number | null = tierScope === "variant" ? singlePiecePrice(tiers) : null;
        if (single != null) payload.sellPrice = single;
      }
      return payload;
    });

    setSaving(true);
    setError(null);
    let anySaved = false;
    try {
      let imageUrl: string | null = imageKey;
      if (pendingFile) {
        try {
          imageUrl = await uploadStockPhoto(pendingFile);
        } catch {
          setError(s.errorUpload);
          return;
        }
      }
      const itemBody = {
        sku: sku.trim(),
        nameRo: nameRo.trim() || fallback,
        nameRu: nameRu.trim() || fallback,
        nameEn: nameEn.trim() || fallback,
        imageUrl,
        internalNotes: notes.trim() || null,
        isActive: active,
        isSellable: sellable,
      };
      if (!item) {
        await stockFetch("/api/admin/stock/items", {
          method: "POST",
          body: { ...itemBody, categoryId: category.id, variants: payloads },
        });
        anySaved = true;
      } else {
        await stockFetch(`/api/admin/stock/items/${item.id}`, { method: "PATCH", body: itemBody });
        anySaved = true;
        // Free SKUs first (deletes), then edits, then new rows — so a SKU can move between rows.
        for (const id of removedIds) {
          await stockFetch(`/api/admin/stock/variants/${id}`, { method: "DELETE" });
        }
        const originals = new Map(item.variants.map((v) => [v.id, v]));
        for (let i = 0; i < drafts.length; i++) {
          const d: VariantDraft = drafts[i];
          const original: StockVariantJson | undefined = d.id ? originals.get(d.id) : undefined;
          if (d.id && original && !samePayload(payloads[i], original)) {
            await stockFetch(`/api/admin/stock/variants/${d.id}`, { method: "PATCH", body: payloads[i] });
          }
        }
        for (let i = 0; i < drafts.length; i++) {
          if (!drafts[i].id) {
            await stockFetch(`/api/admin/stock/items/${item.id}/variants`, { method: "POST", body: payloads[i] });
          }
        }
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof StockRequestError && e.body.error === "has_movements"
          ? s.errorVariantHasMovements
          : stockErrorMessage(e, s),
      );
      if (anySaved) await onSaved();
    } finally {
      setSaving(false);
    }
  }

  const qtyInputMode = unitAllowsFractions(unit) ? "decimal" : "numeric";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !saving && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-item-modal-title"
        className="relative flex max-h-[min(94vh,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl ring-1 ring-black/5"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-6">
          <h2 id="stock-item-modal-title" className="text-lg font-bold tracking-tight text-gray-900 sm:text-xl">
            {item ? s.itemEditTitle : s.itemAddTitle}
          </h2>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label={s.cancel}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
            <aside className="shrink-0 lg:w-[240px]">
              <p className="mb-2 text-xs font-medium text-gray-500">{s.photo}</p>
              <PhotoDropzone
                disabled={saving}
                publicUrl={preview}
                dropLabel={s.photoDrop}
                onPickFile={(f) => {
                  setPendingFile(f);
                  setPreview(URL.createObjectURL(f));
                }}
              />
              {preview ? (
                <button
                  type="button"
                  className="mt-2 text-xs text-gray-500 underline-offset-2 hover:text-red-600 hover:underline"
                  disabled={saving}
                  onClick={() => {
                    setPendingFile(null);
                    setPreview(null);
                    setImageKey(null);
                  }}
                >
                  {s.photoRemove}
                </button>
              ) : null}
            </aside>

            <div className="min-w-0 flex-1 space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className={fieldLabelCls}>
                  {s.colSku}
                  <Input
                    value={sku}
                    onChange={(e) => changeSku(e.target.value)}
                    className="mt-1 font-mono"
                    disabled={saving}
                    autoComplete="off"
                  />
                </label>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-gray-700">{s.namesSection}</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {(
                    [
                      [s.nameRu, nameRu, setNameRu],
                      [s.nameRo, nameRo, setNameRo],
                      [s.nameEn, nameEn, setNameEn],
                    ] as const
                  ).map(([label, value, set]) => (
                    <label key={label} className="block text-[11px] font-medium text-gray-500">
                      {label}
                      <Input value={value} onChange={(e) => set(e.target.value)} className="mt-1" disabled={saving} />
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    disabled={saving}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  {s.active}
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600" title={s.sellableHint}>
                  <input
                    type="checkbox"
                    checked={sellable}
                    onChange={(e) => setSellable(e.target.checked)}
                    disabled={saving}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  {s.sellable}
                </label>
              </div>

              <label className={fieldLabelCls}>
                {s.notes}
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  disabled={saving}
                />
              </label>
            </div>
          </div>

          <section className="mt-6 rounded-xl border border-gray-100 bg-gray-50/60 p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold text-gray-800">{s.variantsSection}</h3>
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs" role="tablist">
                {(["single", "grid"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    disabled={saving}
                    onClick={() => switchMode(m)}
                    className={cn(
                      "rounded-md px-3 py-1.5 font-medium transition-colors",
                      mode === m ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100",
                    )}
                  >
                    {m === "single" ? s.modeSingle : s.modeGrid}
                  </button>
                ))}
              </div>
            </div>

            {mode === "grid" ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold text-gray-700">{s.colorsTitle}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {colors.map((c) => (
                      <span
                        key={c.name}
                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white py-1 pl-1.5 pr-1 text-xs"
                      >
                        <ColorSwatch hex={c.hex} />
                        {c.name}
                        <button
                          type="button"
                          className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          aria-label={`${s.remove} ${c.name}`}
                          disabled={saving}
                          onClick={() => regrid(colors.filter((x) => x !== c), sizes)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="color"
                      value={colorHex}
                      onChange={(e) => setColorHex(e.target.value)}
                      className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-gray-200 bg-white p-1"
                      aria-label={s.colorHex}
                      disabled={saving}
                    />
                    <Input
                      value={colorName}
                      onChange={(e) => setColorName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addColor();
                        }
                      }}
                      placeholder={s.colorNamePlaceholder}
                      className="h-9 min-w-0 flex-1 bg-white"
                      disabled={saving}
                    />
                    <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={addColor} disabled={saving}>
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">{s.add}</span>
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-gray-700">{s.sizesTitle}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sizes.map((z) => (
                      <span
                        key={z}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white py-1 pl-2.5 pr-1 text-xs"
                      >
                        {z}
                        <button
                          type="button"
                          className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          aria-label={`${s.remove} ${z}`}
                          disabled={saving}
                          onClick={() => regrid(colors, sizes.filter((x) => x !== z))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      value={sizeInput}
                      onChange={(e) => setSizeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSizes(sizeInput.split(/[,;]/));
                          setSizeInput("");
                        }
                      }}
                      placeholder={s.sizePlaceholder}
                      className="h-9 min-w-0 flex-1 bg-white"
                      disabled={saving}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0"
                      disabled={saving}
                      onClick={() => {
                        addSizes(sizeInput.split(/[,;]/));
                        setSizeInput("");
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">{s.add}</span>
                    </Button>
                  </div>
                  <button
                    type="button"
                    className="mt-2 text-xs font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
                    disabled={saving}
                    onClick={() => addSizes(COMMON_CLOTHING_SIZES)}
                  >
                    {s.addCommonSizes(COMMON_CLOTHING_SIZES.join(" "))}
                  </button>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-3 lg:col-span-2">
                  <p className="mb-2 text-xs font-semibold text-gray-700">{s.bulkPricesTitle}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:items-end">
                    {(
                      [
                        ["sellPrice", s.colSellPrice],
                        ["dealerPrice", s.colDealerPrice],
                        ["purchaseCost", s.purchaseCostHint],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="block text-[11px] font-medium text-gray-500">
                        {label}
                        <Input
                          value={bulk[key]}
                          onChange={(e) => setBulk((b) => ({ ...b, [key]: sanitizeMoneyInput(e.target.value, { maxIntegerDigits: 8 }) }))}
                          inputMode="decimal"
                          placeholder="—"
                          className="mt-1 h-9"
                          disabled={saving}
                        />
                      </label>
                    ))}
                    <label className="block text-[11px] font-medium text-gray-500">
                      {s.reorderLevel}
                      <Input
                        value={bulk.reorderLevel}
                        onChange={(e) => setBulk((b) => ({ ...b, reorderLevel: sanitizeQuantityInput(e.target.value, unit) }))}
                        inputMode={qtyInputMode}
                        placeholder="—"
                        className="mt-1 h-9"
                        disabled={saving}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="col-span-2 h-9 sm:col-span-1"
                      disabled={saving || drafts.length === 0}
                      onClick={() => setDrafts((prev) => applyPricesToAll(prev, bulk))}
                    >
                      {s.applyToAll}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {tierGroups.length > 0 ? (
              <div className="mt-4 rounded-lg border border-fuchsia-100 bg-fuchsia-50/40 p-3">
                <p className="text-xs font-semibold text-gray-800">{s.tiersTitle}</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {tierScope === "variant" ? s.tiersHintPerVariant : s.tiersHint}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {tierGroups.map((g) => (
                    <StockTierEditor
                      key={g.key || "_all"}
                      title={groupTitle(g)}
                      hex={g.hex}
                      rows={rowsFor(g)}
                      disabled={saving}
                      strings={s}
                      onChange={(rows) => setTierRows((prev) => ({ ...prev, [g.key]: rows }))}
                      onFillDefaults={
                        tierScope === "color"
                          ? () =>
                              setTierRows((prev) => ({
                                ...prev,
                                [g.key]: defaultTierDrafts(category.code, { name: g.color ?? undefined, hex: g.hex }),
                              }))
                          : undefined
                      }
                      onApplyToAll={
                        tierGroups.length > 1
                          ? () =>
                              setTierRows((prev) => {
                                const rows: TierDraft[] = rowsFor(g);
                                const next: Record<string, TierDraft[]> = { ...prev };
                                for (const other of tierGroups) next[other.key] = rows.map((r) => ({ ...r }));
                                return next;
                              })
                          : undefined
                      }
                      applyToAllLabel={tierScope === "variant" ? s.tiersApplyToAllVariants : undefined}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {drafts.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-white p-4 text-center text-xs text-gray-500">
                {s.noVariantsHint}
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full min-w-[860px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left font-semibold uppercase tracking-wide text-gray-500">
                      <th className="p-2">{s.colVariant}</th>
                      <th className="p-2">{s.colSku}</th>
                      <th className="p-2">{s.colSellPrice}</th>
                      <th className="p-2">{s.colDealerPrice}</th>
                      <th className="p-2">{s.purchaseCostHint}</th>
                      <th className="p-2">{s.reorderLevel}</th>
                      <th className="p-2 text-center">{s.colActive}</th>
                      <th className="p-2" aria-label={s.remove} />
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((d) => (
                      <tr key={d.key} className="border-b border-gray-100 last:border-0">
                        <td className="p-2">
                          {mode === "grid" ? (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                              <ColorSwatch hex={d.options.colorHex} />
                              {d.label || "—"}
                            </span>
                          ) : (
                            <Input
                              value={d.label}
                              onChange={(e) => patchDraft(d.key, { label: e.target.value })}
                              placeholder={s.variantLabelPlaceholder}
                              className="h-8 w-32"
                              disabled={saving}
                            />
                          )}
                        </td>
                        <td className="p-2">
                          <Input
                            value={d.sku}
                            onChange={(e) =>
                              patchDraft(d.key, {
                                sku: e.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, ""),
                                skuEdited: true,
                              })
                            }
                            className="h-8 w-44 font-mono"
                            disabled={saving}
                          />
                        </td>
                        {(["sellPrice", "dealerPrice", "purchaseCost"] as const).map((key) => {
                          const tierPrice: number | null = key === "sellPrice" ? tierPriceFor(d) : null;
                          return tierPrice != null ? (
                            <td key={key} className="p-2">
                              <span className="block w-24 font-semibold tabular-nums text-gray-900" title={s.tiersPriceHint}>
                                {formatTierPrice(tierPrice)}
                              </span>
                              <span className="block w-24 text-[10px] leading-tight text-fuchsia-700">{s.tiersPriceHint}</span>
                            </td>
                          ) : (
                            <td key={key} className="p-2">
                              <Input
                                value={d[key]}
                                onChange={(e) => patchDraft(d.key, { [key]: sanitizeMoneyInput(e.target.value, { maxIntegerDigits: 8 }) })}
                                inputMode="decimal"
                                placeholder="—"
                                className="h-8 w-24 tabular-nums"
                                disabled={saving}
                              />
                            </td>
                          );
                        })}
                        <td className="p-2">
                          <Input
                            value={d.reorderLevel}
                            onChange={(e) => patchDraft(d.key, { reorderLevel: sanitizeQuantityInput(e.target.value, unit) })}
                            inputMode={qtyInputMode}
                            placeholder="—"
                            className="h-8 w-20 tabular-nums"
                            disabled={saving}
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={d.isActive}
                            onChange={(e) => patchDraft(d.key, { isActive: e.target.checked })}
                            disabled={saving}
                            className="h-4 w-4 rounded border-gray-300"
                            aria-label={s.colActive}
                          />
                        </td>
                        <td className="p-2 text-right">
                          {drafts.length > 1 ? (
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              aria-label={s.remove}
                              title={s.remove}
                              disabled={saving}
                              onClick={() => removeDraft(d)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {mode === "single" ? (
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                disabled={saving}
                onClick={() =>
                  setDrafts((prev) => [
                    ...prev,
                    { ...emptyVariantDraft(`row-${Date.now()}`, prev.length), sku: `${sku}-${prev.length + 1}`, skuEdited: true },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                {s.addVariantRow}
              </button>
            ) : null}
          </section>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="min-h-[1.25rem] text-sm text-red-600">{error}</p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              {s.cancel}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {s.save}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
