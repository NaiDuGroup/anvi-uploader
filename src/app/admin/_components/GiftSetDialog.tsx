"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Gift, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { UvStockItemJson } from "@/lib/uv/dto";
import {
  boxSizeFromSku,
  giftSetUnitPrice,
  type GiftSetCustomerType,
  type GiftSetRole,
  type GiftSetTemplate,
} from "@/lib/giftSet/giftSet";
import {
  defaultGiftSetChoice,
  giftSetChoiceProblem,
  giftSetComponentOptions,
  giftSetShortNames,
  giftSetSwatchHex,
  readyGiftSetVariants,
  type GiftSetCatalogs,
  type GiftSetChoice,
} from "@/lib/giftSet/giftSetWizard";
import { cn } from "@/lib/utils";

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace(".", ",");
}

/** Colour swatches of one component (or the ready set's colours). */
function VariantPicker({
  label,
  items,
  value,
  onChange,
  available,
  t,
  testId,
}: {
  label: string;
  items: UvStockItemJson[];
  value: string | undefined | null;
  onChange: (id: string) => void;
  /** Stock left for this order (stock minus what the unsaved order already takes). */
  available: (i: UvStockItemJson) => number;
  t: TranslationDictionary;
  testId: string;
}) {
  const g = t.giftSet;
  const names = giftSetShortNames(items);
  return (
    <div data-testid={testId}>
      <p className="mb-1 text-xs font-medium text-gray-700">{label}</p>
      {items.length === 0 ? (
        <p className="text-xs text-amber-700">{g.noVariants}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((i) => {
            const selected = i.id === value;
            const left = available(i);
            const out = left <= 0;
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => onChange(i.id)}
                title={`${i.itemNames.ru ?? i.name} · ${i.sku} · ${out ? g.variantOutOfStock : g.stockLeft(left)}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
                  selected ? "border-amber-500 bg-amber-50 font-semibold text-amber-900" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                  out && !selected && "opacity-60",
                )}
              >
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: giftSetSwatchHex(i) }}
                  aria-hidden
                />
                <span>{names.get(i.id)}</span>
                <span className={cn("text-[10px]", out ? "text-red-600" : "text-gray-400")}>{out ? g.variantOutOfStock : left}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * «Набор» picker: template, number of sets, the colour of every item (or of
 * the ready set), price per set (retail / dealer; staff may type their own).
 */
export function GiftSetDialog({
  templates,
  catalogs,
  customerType,
  allowManualPrice,
  initial,
  reserved,
  boxStock,
  t,
  onApply,
  onClose,
}: {
  templates: readonly GiftSetTemplate[];
  catalogs: GiftSetCatalogs;
  customerType: GiftSetCustomerType;
  allowManualPrice: boolean;
  initial: GiftSetChoice | null;
  /** Units the unsaved order already takes (other rows / sets): variant id, `box:<SKU>`. */
  reserved: ReadonlyMap<string, number>;
  /** Stock of the template boxes by SKU (staff); absent → not shown. */
  boxStock?: Readonly<Record<string, number>>;
  t: TranslationDictionary;
  onApply: (template: GiftSetTemplate, choice: GiftSetChoice) => void;
  onClose: () => void;
}) {
  const g = t.giftSet;
  const active = useMemo(() => templates.filter((x) => x.active || x.id === initial?.templateId), [templates, initial]);
  const [choice, setChoice] = useState<GiftSetChoice | null>(() =>
    initial ?? (active[0] ? defaultGiftSetChoice(active[0], catalogs) : null),
  );
  const [qtyStr, setQtyStr] = useState<string>(String(initial?.quantity ?? 1));
  const [manualStr, setManualStr] = useState<string>(initial?.manualUnitPriceMdl != null ? String(initial.manualUnitPriceMdl) : "");
  const template = active.find((x) => x.id === choice?.templateId) ?? null;

  const quantity = Number.parseInt(qtyStr, 10);
  const manual = manualStr.trim() ? Number(manualStr.replace(",", ".")) : null;
  const effective: GiftSetChoice | null = choice
    ? {
        ...choice,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        manualUnitPriceMdl: allowManualPrice && manual != null && Number.isFinite(manual) && manual > 0 ? manual : null,
      }
    : null;
  const problem = template && effective ? giftSetChoiceProblem(template, effective) : "variant";
  const price = template ? giftSetUnitPrice(template, customerType, effective?.manualUnitPriceMdl ?? null) : null;
  const available = (i: UvStockItemJson): number => i.stockQuantity - (reserved.get(i.id) ?? 0);
  const want = Math.max(0, effective?.quantity ?? 0);
  // Items short for N sets: the order still goes in, marked «Закупка».
  const pickedIds: string[] = template && choice
    ? template.kind === "ready"
      ? [choice.readyVariantId ?? ""]
      : template.components.map((c) => choice.variants[c.role] ?? "")
    : [];
  const allItems = [...catalogs.uv, ...catalogs.sublimation];
  const shortItems = pickedIds
    .map((id) => allItems.find((i) => i.id === id))
    .filter((i): i is UvStockItemJson => Boolean(i) && available(i!) < want);
  const boxSku = template?.boxSku ?? null;
  const boxLeft = boxSku && boxStock && boxStock[boxSku] !== undefined ? boxStock[boxSku]! - (reserved.get(`box:${boxSku}`) ?? 0) : null;
  const boxShort = boxLeft != null && boxLeft < want;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-3 sm:p-6">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label={g.cancel} onClick={onClose} />
      <div
        className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-set-dialog-title"
        data-testid="gift-set-dialog"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <h2 id="gift-set-dialog-title" className="flex items-center gap-2 text-lg font-semibold">
            <Gift className="h-5 w-5 text-fuchsia-600" aria-hidden />
            {g.dialogTitle}
          </h2>
          <button type="button" onClick={onClose} aria-label={g.cancel} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
          <div>
            <p className="mb-1 text-xs font-medium text-gray-700">{g.template}</p>
            <div className="grid gap-1.5">
              {active.map((x) => (
                <label
                  key={x.id}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
                    x.id === template?.id ? "border-amber-500 bg-amber-50" : "border-gray-200 hover:border-gray-300",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="gift-set-template"
                      checked={x.id === template?.id}
                      onChange={() => setChoice({ ...defaultGiftSetChoice(x, catalogs), quantity: choice?.quantity ?? 1 })}
                    />
                    {x.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {fmt(giftSetUnitPrice(x, customerType).unitPriceMdl)} MDL
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="text-xs font-medium text-gray-700">
            {g.quantity}
            <input
              type="number"
              min={1}
              inputMode="numeric"
              data-testid="gift-set-quantity"
              className="mt-1 block h-9 w-28 rounded-md border border-gray-300 px-2 text-sm"
              value={qtyStr}
              onChange={(e) => setQtyStr(e.target.value)}
            />
          </label>

          {template && choice ? (
            template.kind === "ready" ? (
              <>
                <VariantPicker
                  testId="gift-set-variants-ready"
                  label={g.colour}
                  items={readyGiftSetVariants(template, catalogs.uv)}
                  value={choice.readyVariantId}
                  onChange={(id) => setChoice({ ...choice, readyVariantId: id })}
                  available={available}
                  t={t}
                />
                {readyGiftSetVariants(template, catalogs.uv).length === 0 ? (
                  <p className="flex items-start gap-1.5 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {g.readyItemMissing}
                  </p>
                ) : null}
                <p className="text-xs text-gray-500">
                  {template.zones.map((z) => `${z.label} ${g.zoneSize(fmt(z.widthCm), fmt(z.heightCm))}`).join(" · ")}
                </p>
              </>
            ) : (
              template.components.map((c) => (
                <VariantPicker
                  key={c.role}
                  testId={`gift-set-variants-${c.role}`}
                  label={c.label}
                  items={giftSetComponentOptions(template, c.role, catalogs)}
                  value={choice.variants[c.role]}
                  onChange={(id) => setChoice({ ...choice, variants: { ...choice.variants, [c.role as GiftSetRole]: id } })}
                  available={available}
                  t={t}
                />
              ))
            )
          ) : null}

          {template && boxSku ? (
            <p className="text-xs text-gray-600" data-testid="gift-set-box">
              {g.boxLine(boxSizeFromSku(boxSku) ?? boxSku)}
              {boxLeft != null ? (
                <span className={cn("ml-1", boxShort ? "text-red-600" : "text-gray-400")}>
                  · {boxLeft > 0 ? g.stockLeft(boxLeft) : g.variantOutOfStock}
                </span>
              ) : null}
            </p>
          ) : null}

          {shortItems.length > 0 || boxShort ? (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800" data-testid="gift-set-short">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {g.shortWarning}
            </p>
          ) : null}

          {template && price ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {g.pricePerSet}: <b>{fmt(price.unitPriceMdl)} MDL</b>
                </span>
                <span>
                  {g.total}: <b data-testid="gift-set-total">{fmt(Math.round(price.unitPriceMdl * Math.max(0, effective?.quantity ?? 0) * 100) / 100)} MDL</b>
                </span>
              </div>
              {customerType === "dealer" && template.dealerPriceMdl == null && allowManualPrice ? (
                <p className="mt-1 text-xs text-amber-700">{g.dealerPriceMissing}</p>
              ) : null}
              {allowManualPrice ? (
                <label className="mt-2 block text-xs text-gray-600">
                  {g.manualPrice}
                  <input
                    inputMode="decimal"
                    placeholder={g.manualPriceHint}
                    className="mt-1 block h-8 w-40 rounded-md border border-gray-300 px-2 text-sm"
                    value={manualStr}
                    onChange={(e) => setManualStr(e.target.value)}
                  />
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
          {problem ? <span className="mr-auto text-xs text-amber-700">{g.pickProblem[problem]}</span> : null}
          <Button type="button" variant="outline" onClick={onClose}>
            {g.cancel}
          </Button>
          <Button
            type="button"
            data-testid="gift-set-apply"
            disabled={!template || !effective || problem != null}
            onClick={() => template && effective && onApply(template, effective)}
          >
            {g.apply}
          </Button>
        </div>
      </div>
    </div>
  );
}
