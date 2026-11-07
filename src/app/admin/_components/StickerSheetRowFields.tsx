"use client";

import type { ReactElement } from "react";
import { useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { AdminSheetPaperJson } from "@/lib/businessCard/toAdminSheetPaperJson";
import type { BusinessCardSheetLayout } from "@/lib/businessCard/businessCardSheetLayout";
import {
  STICKER_SHEET_FORMAT_SPECS,
  STICKER_SHEET_FORMATS,
  STICKER_MAX_QUANTITY,
  STICKER_MAX_SIDE_MM,
  STICKER_MIN_SIDE_MM,
  stickerRoundSheets,
  type StickerShape,
  type StickerSheetSettings,
} from "@/lib/stickerSheet/stickerSheet";
import { stickerDraftSizeIssue, type StickerDraft } from "@/lib/stickerSheet/stickerSheetDraft";
import { StickerSheetPreview } from "@/components/orders/StickerSheetPreview";

export interface StickerSheetRowPricing {
  layout: BusinessCardSheetLayout;
  sheetsUsed: number;
  cardsPerSheet: number;
  pricePerSheetMdl: number;
  totalSellPriceMdl: number;
  /** Stickers ordered (pieces). */
  quantity: number;
}

function Toggle<T extends string | boolean>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
            value === v
              ? "border-gold bg-amber-50 text-amber-950"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * «Наклейки на листе» options of a wizard row: shape, size, cut, sheet format
 * and how the run is counted (pieces / sheets — the row's quantity field), the
 * stickers per sheet, the price and a to-scale sheet preview with the camera marks.
 */
export function StickerSheetRowFields({
  draft,
  copiesStr,
  paper,
  pricing,
  layout,
  settings,
  artworkFile,
  onChange,
  t,
  hideStock = false,
  dealerView = false,
  manualTotalMdl = null,
}: {
  draft: StickerDraft;
  copiesStr: string;
  paper: AdminSheetPaperJson | null;
  /** Null while the row is not priceable (size / run missing, does not fit). */
  pricing: StickerSheetRowPricing | null;
  /** Grid for the current size even before a run is typed. */
  layout: BusinessCardSheetLayout | null;
  settings: StickerSheetSettings;
  /** Fresh upload: drawn into every sticker of the preview. */
  artworkFile?: File | null;
  onChange: (patch: { sticker?: StickerDraft; copiesStr?: string }) => void;
  t: TranslationDictionary;
  hideStock?: boolean;
  dealerView?: boolean;
  /** Staff «ручная цена» typed in the row's price field (null = calculated). */
  manualTotalMdl?: number | null;
}): ReactElement {
  const s = t.admin.stickerSheet;
  const cur = t.admin.currency;
  const artUrl = useMemo(
    () => (artworkFile && artworkFile.type.startsWith("image/") ? URL.createObjectURL(artworkFile) : null),
    [artworkFile],
  );
  useEffect(() => () => {
    if (artUrl) URL.revokeObjectURL(artUrl);
  }, [artUrl]);

  if (!paper) {
    return <p className="max-w-md py-0.5 text-xs text-amber-800">{s.noPaper}</p>;
  }

  const set = (patch: Partial<StickerDraft>) => onChange({ sticker: { ...draft, ...patch } });
  const perSheet = layout?.cardsPerSheet ?? 0;
  const typed = Number.parseInt(copiesStr, 10);

  const switchMode = (mode: StickerDraft["quantityMode"]) => {
    if (mode === draft.quantityMode) return;
    let nextCopies = copiesStr;
    if (Number.isInteger(typed) && typed > 0 && perSheet > 0) {
      nextCopies =
        mode === "sheets"
          ? String(stickerRoundSheets(Math.ceil(typed / perSheet), draft.format))
          : String(stickerRoundSheets(typed, draft.format) * perSheet);
    }
    onChange({ sticker: { ...draft, quantityMode: mode }, copiesStr: nextCopies });
  };

  const shapes: readonly (readonly [StickerShape, string])[] = [
    ["circle", s.shapeCircle],
    ["rect", s.shapeRect],
    ["rounded", s.shapeRounded],
    ["contour", s.shapeContour],
  ];
  const shownTotalMdl = manualTotalMdl ?? pricing?.totalSellPriceMdl ?? null;
  const perPiece =
    pricing && pricing.quantity > 0 && shownTotalMdl != null
      ? Math.round((shownTotalMdl / pricing.quantity) * 100) / 100
      : null;
  const typedPieces =
    Number.isInteger(typed) && typed > 0
      ? draft.quantityMode === "sheets"
        ? stickerRoundSheets(typed, draft.format) * perSheet
        : typed
      : 0;
  // A4+ goes in pairs: the sheets as typed / counted before rounding up to even.
  const rawSheets =
    Number.isInteger(typed) && typed > 0 && perSheet > 0
      ? draft.quantityMode === "sheets"
        ? typed
        : Math.ceil(typed / perSheet)
      : 0;
  const tooManyPieces = typedPieces > STICKER_MAX_QUANTITY;
  const stockShort =
    pricing != null && paper.stockSheets < pricing.sheetsUsed * STICKER_SHEET_FORMAT_SPECS[draft.format].paperShare;
  const spec = STICKER_SHEET_FORMAT_SPECS[draft.format];
  const sizeIssue = stickerDraftSizeIssue(draft);

  return (
    <div className="max-w-md space-y-2 py-0.5 text-sm">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-gray-600">{s.shapeLabel}</label>
        <Toggle value={draft.shape} options={shapes} onChange={(shape) => set({ shape })} />
      </div>
      <div className="flex items-end gap-1.5">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-[11px] font-medium text-gray-600">
            {draft.shape === "circle" ? s.diameterMm : s.widthMm}
          </label>
          <Input
            type="text"
            inputMode="decimal"
            value={draft.widthStr}
            onChange={(e) => set({ widthStr: e.target.value.replace(/[^0-9.,]/g, "") })}
            className="h-8 px-2 text-xs"
          />
        </div>
        {draft.shape !== "circle" ? (
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-[11px] font-medium text-gray-600">{s.heightMm}</label>
            <Input
              type="text"
              inputMode="decimal"
              value={draft.heightStr}
              onChange={(e) => set({ heightStr: e.target.value.replace(/[^0-9.,]/g, "") })}
              className="h-8 px-2 text-xs"
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-600">{s.cutLabel}</label>
          <Toggle
            value={draft.cut}
            options={[
              [true, s.cutYes],
              [false, s.cutNo],
            ]}
            onChange={(cut) => set({ cut })}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-600">{s.formatLabel}</label>
          <Toggle
            value={draft.format}
            options={STICKER_SHEET_FORMATS.map((f) => [f, `${f} ${STICKER_SHEET_FORMAT_SPECS[f].widthCm * 10}×${STICKER_SHEET_FORMAT_SPECS[f].heightCm * 10}`] as const)}
            onChange={(format) => set({ format })}
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-gray-600">{s.quantityLabel}</label>
        <Toggle
          value={draft.quantityMode}
          options={[
            ["pieces", s.modePieces],
            ["sheets", s.modeSheets],
          ]}
          onChange={switchMode}
        />
      </div>

      <div className="flex gap-2 rounded-lg border border-gray-100 bg-gray-50/80 p-2 text-[11px] leading-relaxed text-gray-800">
        {layout ? (
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <StickerSheetPreview
              data={{
                shape: draft.shape,
                format: draft.format,
                cut: draft.cut,
                sheetWidthCm: spec.widthCm,
                sheetHeightCm: spec.heightCm,
                marginMm: settings.marginMm,
                columns: layout.columns,
                rows: layout.rows,
                slotWidthCm: layout.slotWidthCm,
                slotHeightCm: layout.slotHeightCm,
                gapCm: layout.gapCm,
                marginXCm: layout.marginXCm,
                marginYCm: layout.marginYCm,
              }}
              imageUrl={artUrl}
              maxHeightPx={150}
              className="shrink-0"
            />
            {draft.format === "A4+" ? (
              <span className="text-[10px] text-gray-500">{s.a4PairCaption}</span>
            ) : null}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          {layout && tooManyPieces ? (
            <p className="font-medium text-amber-800">{s.tooManyPieces(STICKER_MAX_QUANTITY)}</p>
          ) : layout ? (
            <p className="font-medium">
              {s.perSheetSummary(layout.cardsPerSheet, pricing?.sheetsUsed ?? 0)}
            </p>
          ) : (
            <p className="font-medium text-amber-800">
              {sizeIssue === "missing"
                ? s.sizeMissing
                : sizeIssue === "out_of_range"
                  ? s.sizeOutOfRange(STICKER_MIN_SIDE_MM, STICKER_MAX_SIDE_MM)
                  : s.doesNotFit}
            </p>
          )}
          {pricing ? (
            <>
              {draft.format === "A4+" && rawSheets > 0 ? (
                <p className={cn(rawSheets !== pricing.sheetsUsed ? "font-medium text-amber-800" : "text-gray-600")}>
                  {s.a4PairNote(rawSheets, pricing.sheetsUsed)}
                </p>
              ) : null}
              <p className="text-gray-600">{s.piecesSummary(pricing.quantity)}</p>
              <p className="tabular-nums">{s.perSheetPrice(pricing.pricePerSheetMdl, draft.format)}</p>
              <p className="font-semibold tabular-nums">
                {t.admin.newOrderPage.lfTotal}: {shownTotalMdl} {cur}
                {perPiece != null ? (
                  <span className="ml-1 font-normal text-gray-600">· ≈ {perPiece.toFixed(2)} {cur}/шт</span>
                ) : null}
              </p>
              {manualTotalMdl != null ? (
                <p className="text-[10px] font-medium text-amber-800">
                  {t.admin.sheetManualPriceNote(pricing.totalSellPriceMdl)}
                </p>
              ) : null}
              {!hideStock ? (
                <p className={cn("text-[10px]", stockShort ? "font-medium text-red-700" : "text-gray-500")}>
                  {t.admin.sheetPaperCatalogColStockSheets}: {paper.stockSheets.toFixed(0)} A3+
                </p>
              ) : null}
            </>
          ) : null}
          <p className="text-[10px] text-gray-500">{s.marginsHint(settings.marginMm, settings.gapMm)}</p>
          {!dealerView && manualTotalMdl == null ? (
            <p className="text-[10px] text-gray-500">{s.manualPriceHint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
