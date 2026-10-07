"use client";

import type { ReactElement } from "react";
import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import type { BusinessCardArtworkCheck } from "@/lib/businessCard/businessCardArtworkCheck";
import {
  MenuSelect,
  type MenuSelectOption,
} from "@/components/ui/MenuSelect";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { Input } from "@/components/ui/input";
import type { AdminSheetPaperJson } from "@/lib/businessCard/toAdminSheetPaperJson";
import {
  BUSINESS_CARD_BLEED_CM,
  BUSINESS_CARD_MAX_QUANTITY,
  BUSINESS_CARD_PRESETS,
  BUSINESS_CARD_SHEET_PRESETS,
  type BusinessCardPresetId,
  type BusinessCardSides,
} from "@/lib/businessCard/businessCardConstants";
import type { BusinessCardSheetLayout } from "@/lib/businessCard/businessCardSheetLayout";
import { BusinessCardSheetPreview } from "./BusinessCardSheetPreview";
import { cn } from "@/lib/utils";

/** Business-card fields of a wizard row: the subset of `SlotAssign` we own. */
export interface AdminBusinessCardRowAssign {
  copiesStr: string;
  bcSheetPaperId: string | null;
  bcSides: BusinessCardSides;
  bcPresetId: BusinessCardPresetId;
  bcTrimWidthStr: string;
  bcTrimHeightStr: string;
  bcBackFile: File | null;
  /** Reverse already stored on the order; replaced as soon as `bcBackFile` is set. */
  bcBackExistingFile: { id: string; fileName: string } | null;
}

export interface AdminBusinessCardRowPricing {
  layout: BusinessCardSheetLayout;
  sheetsUsed: number;
  cardsPerSheet: number;
  pricePerSheetMdl: number;
  totalSellPriceMdl: number;
  /** Run after rounding up to fill whole sheets. */
  quantity: number;
}

/** Bleed check of one artwork face, as far as the wizard has got with it. */
export type BusinessCardArtworkVerdict =
  | { kind: "checking" }
  /** The file could not be decoded — warn, but do not block on a guess. */
  | { kind: "unreadable" }
  | { kind: "checked"; check: BusinessCardArtworkCheck };

export interface AdminBusinessCardRowFieldsProps {
  assign: AdminBusinessCardRowAssign;
  papers: AdminSheetPaperJson[];
  /** Null when the row is not yet priceable (no paper / bad run / no fit). */
  pricing: AdminBusinessCardRowPricing | null;
  /**
   * Cards one sheet holds for the chosen paper and size (0 = not resolvable
   * yet). The run must be a multiple of it, so it drives the quick picks.
   */
  cardsPerSheet: number;
  /** Re-fit the run to whole sheets once a custom size has been typed in. */
  onCustomSizeCommit: () => void;
  /** Null when there is no artwork for that face yet, or no valid size. */
  frontArtwork: BusinessCardArtworkVerdict | null;
  backArtwork: BusinessCardArtworkVerdict | null;
  onChange: (patch: Partial<AdminBusinessCardRowAssign>) => void;
  t: TranslationDictionary;
}

/**
 * Business-card options for one admin order row: sheet paper, one or two
 * printed sides, the reverse artwork, plus the resulting sheet count, stock
 * balance and layout preview. The run size comes from the row's shared
 * quantity field, so it is not repeated here.
 */
export function AdminBusinessCardRowFields({
  assign,
  papers,
  pricing,
  cardsPerSheet,
  onCustomSizeCommit,
  frontArtwork,
  backArtwork,
  onChange,
  t,
}: AdminBusinessCardRowFieldsProps): ReactElement {
  const tt = t.admin;
  const tt2 = t.cabinet.newOrder;
  const paper = papers.find((p) => p.id === assign.bcSheetPaperId) ?? null;
  /** A fresh upload wins over the stored reverse it is meant to replace. */
  const backArtworkName =
    assign.bcBackFile?.name ?? assign.bcBackExistingFile?.fileName ?? null;

  const paperOptions = useMemo(
    (): MenuSelectOption<string>[] =>
      papers.map((p) => ({
        value: p.id,
        label: `${p.name} · ${p.sheetWidthCm}×${p.sheetHeightCm}`,
        description: tt.sheetPaperCatalogCardsPerSheet(p.standardCardsPerSheet),
      })),
    [papers, tt],
  );

  const sizeOptions = useMemo(
    (): MenuSelectOption<BusinessCardPresetId>[] => [
      ...BUSINESS_CARD_PRESETS.map((preset) => ({
        value: preset.id as BusinessCardPresetId,
        label: `${preset.trimWidthCm} × ${preset.trimHeightCm} cm`,
      })),
      { value: "custom", label: tt2.bcSizeCustomLabel },
    ],
    [tt2],
  );

  if (papers.length === 0) {
    return (
      <p className="max-w-md py-0.5 text-xs text-amber-800">
        {t.cabinet.newOrder.bcNoPapers}
      </p>
    );
  }

  const quantityPresets = BUSINESS_CARD_SHEET_PRESETS.map(
    (sheetCount) => sheetCount * cardsPerSheet,
  ).filter((quantity) => quantity <= BUSINESS_CARD_MAX_QUANTITY);
  const stockShort =
    paper != null && pricing != null && paper.stockSheets < pricing.sheetsUsed;
  const parsedCopies = Number.parseInt(assign.copiesStr, 10);
  const typedQuantity = Number.isInteger(parsedCopies) ? parsedCopies : null;

  return (
    <div className="max-w-md space-y-2 py-0.5 text-sm">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-gray-600">
          {t.cabinet.newOrder.bcPaperLabel}
        </label>
        <MenuSelect<string>
          className="w-full"
          value={assign.bcSheetPaperId ?? papers[0]!.id}
          options={paperOptions}
          onChange={(bcSheetPaperId) => onChange({ bcSheetPaperId })}
          ariaLabel={t.cabinet.newOrder.bcPaperLabel}
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-gray-600">
          {tt2.bcSizeLabel}
        </label>
        <MenuSelect<BusinessCardPresetId>
          className="w-full"
          value={assign.bcPresetId}
          options={sizeOptions}
          onChange={(bcPresetId) => onChange({ bcPresetId })}
          ariaLabel={tt2.bcSizeLabel}
        />
        {assign.bcPresetId === "custom" && (
          <div className="mt-1.5 flex items-center gap-1">
            <Input
              type="text"
              inputMode="decimal"
              placeholder={tt2.bcSizeCustomWidth}
              value={assign.bcTrimWidthStr}
              onChange={(e) =>
                onChange({
                  bcTrimWidthStr: e.target.value.replace(/[^0-9.,]/g, ""),
                })
              }
              onBlur={onCustomSizeCommit}
              className="h-8 min-w-0 flex-1 px-2 text-xs"
            />
            <X className="h-3 w-3 shrink-0 text-gray-400" aria-hidden />
            <Input
              type="text"
              inputMode="decimal"
              placeholder={tt2.bcSizeCustomHeight}
              value={assign.bcTrimHeightStr}
              onChange={(e) =>
                onChange({
                  bcTrimHeightStr: e.target.value.replace(/[^0-9.,]/g, ""),
                })
              }
              onBlur={onCustomSizeCommit}
              className="h-8 min-w-0 flex-1 px-2 text-xs"
            />
          </div>
        )}
        <ArtworkVerdictNote
          face={tt.bcArtworkFaceFront}
          verdict={frontArtwork}
          t={t}
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-gray-600">
          {t.cabinet.newOrder.bcSidesLabel}
        </label>
        <div className="flex gap-1.5">
          {(
            [
              ["one", t.cabinet.newOrder.bcSidesOne],
              ["two", t.cabinet.newOrder.bcSidesTwo],
            ] as const
          ).map(([side, label]) => (
            <button
              key={side}
              type="button"
              aria-pressed={assign.bcSides === side}
              onClick={() =>
                onChange({
                  bcSides: side,
                  // Dropping to one side discards the now-unused reverse artwork.
                  bcBackFile: side === "one" ? null : assign.bcBackFile,
                  bcBackExistingFile:
                    side === "one" ? null : assign.bcBackExistingFile,
                })
              }
              className={cn(
                "flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                assign.bcSides === side
                  ? "border-gold bg-amber-50 text-amber-950"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {assign.bcSides === "two" && (
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-600">
            {t.cabinet.newOrder.bcUploadLabelBack}
          </label>
          {backArtworkName !== null ? (
            <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate text-gray-800">
                {backArtworkName}
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange({ bcBackFile: null, bcBackExistingFile: null })
                }
                aria-label={t.admin.sheetPaperCatalogCancel}
                className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-gray-50/60 px-2 py-2 text-xs text-gray-600 transition-colors hover:border-amber-300 hover:bg-amber-50/40">
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {t.cabinet.newOrder.bcUploadLabelBack}
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onChange({ bcBackFile: file });
                }}
              />
            </label>
          )}
          <ArtworkVerdictNote
            face={tt.bcArtworkFaceBack}
            verdict={backArtwork}
            t={t}
          />
        </div>
      )}

      {cardsPerSheet > 0 ? (
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-600">
            {tt2.bcQuantityLabel}
            <span className="ml-1 font-normal text-gray-500">
              · {tt2.bcQuantityStepHint(cardsPerSheet)}
            </span>
          </label>
          <div className="flex flex-wrap gap-1">
            {quantityPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={typedQuantity === preset}
                onClick={() => onChange({ copiesStr: String(preset) })}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums transition-colors",
                  typedQuantity === preset
                    ? "border-gold bg-amber-50 text-amber-950"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                )}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-1 flex flex-col gap-0.5 rounded-lg border border-gray-100 bg-gray-50/80 p-2 text-[11px] leading-relaxed text-gray-800">
        <p className="text-[10px] text-gray-500">
          {tt2.bcBleedHint(BUSINESS_CARD_BLEED_CM * 10)}
        </p>
        {pricing ? (
          <>
            <p>
              {tt2.bcSheetsSummary(
                pricing.quantity,
                pricing.sheetsUsed,
                pricing.cardsPerSheet,
              )}
            </p>
            {typedQuantity != null && typedQuantity !== pricing.quantity ? (
              <p className="text-[10px] font-medium text-amber-800">
                {tt2.bcQuantitySnapHint(typedQuantity, pricing.quantity)}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-x-2">
              <span>{t.cabinet.newOrder.bcPerSheet}</span>
              <span className="text-right tabular-nums">
                {pricing.pricePerSheetMdl} {tt.currency}
              </span>
              <span className="font-semibold">{tt.newOrderPage.lfTotal}</span>
              <span className="text-right font-semibold tabular-nums">
                {pricing.totalSellPriceMdl} {tt.currency}
              </span>
            </div>
            {paper ? (
              <p
                className={cn(
                  "text-[10px]",
                  stockShort ? "font-medium text-red-700" : "text-gray-500",
                )}
              >
                {tt.sheetPaperCatalogColStockSheets}:{" "}
                {paper.stockSheets.toFixed(0)}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[10px] text-gray-500">
            {t.cabinet.newOrder.bcDoesNotFit}
          </p>
        )}
      </div>

      <BusinessCardSheetPreview
        title={t.cabinet.newOrder.bcPreviewTitle}
        emptyHint={t.cabinet.newOrder.bcUploadHint}
        layout={pricing?.layout ?? null}
      />
    </div>
  );
}

/** One decimal, without float noise: 8.899999 → 8.9. */
function cm(value: number): number {
  return Math.round(value * 10) / 10;
}

function ArtworkVerdictNote({
  face,
  verdict,
  t,
}: {
  face: string;
  verdict: BusinessCardArtworkVerdict | null;
  t: TranslationDictionary;
}): ReactElement | null {
  if (verdict === null) return null;
  const tt = t.admin;
  const bleedMm = BUSINESS_CARD_BLEED_CM * 10;

  if (verdict.kind === "checking") {
    return (
      <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
        {tt.bcArtworkChecking(face)}
      </p>
    );
  }
  if (verdict.kind === "unreadable") {
    return (
      <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-800">
        <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
        {tt.bcArtworkUnreadable(face, bleedMm)}
      </p>
    );
  }

  const { check } = verdict;
  const reqW = cm(check.required.widthCm);
  const reqH = cm(check.required.heightCm);
  if (check.ok) {
    return (
      <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
        <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
        {tt.bcArtworkOk(face, reqW, reqH)}
      </p>
    );
  }

  const actW = cm(check.actual.widthCm);
  const actH = cm(check.actual.heightCm);
  const message =
    check.issue === "no_bleed"
      ? tt.bcArtworkNoBleed(
          face,
          reqW,
          reqH,
          cm(check.trim.widthCm),
          cm(check.trim.heightCm),
          bleedMm,
        )
      : check.issue === "too_small"
        ? tt.bcArtworkTooSmall(face, actW, actH, reqW, reqH)
        : tt.bcArtworkWrongProportions(face, actW, actH, reqW, reqH);
  return (
    <p
      role="alert"
      className="mt-1 flex items-start gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-medium leading-snug text-red-700"
    >
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
