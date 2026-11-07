"use client";

import type { ReactElement } from "react";
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { AdminSheetPaperJson } from "@/lib/businessCard/toAdminSheetPaperJson";
import type { BusinessCardSheetLayout } from "@/lib/businessCard/businessCardSheetLayout";
import {
  POSTCARD_LAMINATIONS,
  POSTCARD_MAX_CREASE_LINES,
  POSTCARD_PURPOSES,
  POSTCARD_SHEET_FORMATS,
  POSTCARD_SHEET_FORMAT_SPECS,
  type PostcardLineInfo,
  type PostcardSettings,
  type PostcardSheetFormat,
} from "@/lib/postcard/postcard";
import type { PostcardDraft } from "@/lib/postcard/postcardDraft";
import { StickerSheetPreview } from "@/components/orders/StickerSheetPreview";

export interface PostcardRowPricing {
  sheetsUsed: number;
  cardsPerSheet: number;
  totalSellPriceMdl: number;
  quantity: number;
  /** Breakdown of the calculated price (null when the stored sold price is shown). */
  postcard?: PostcardLineInfo | null;
}

function Toggle<T extends string | number | boolean>({
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

function Check({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }): ReactElement {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-gray-300 accent-amber-600"
      />
      {label}
    </label>
  );
}

const Label = ({ children }: { children: string }) => (
  <label className="mb-1 block text-[11px] font-medium text-gray-600">{children}</label>
);

/** Purpose and «лист целиком» — shown above paper / size / sides. */
export function PostcardPurposeFields({
  draft,
  onChange,
  t,
}: {
  draft: PostcardDraft;
  onChange: (next: PostcardDraft) => void;
  t: TranslationDictionary;
}): ReactElement {
  const p = t.admin.postcard;
  return (
    <div className="max-w-md space-y-2 py-0.5 text-sm">
      <div>
        <Label>{p.purposeLabel}</Label>
        <Toggle
          value={draft.purpose}
          options={POSTCARD_PURPOSES.map((id) => [id, p.purposes[id]] as const)}
          onChange={(purpose) => onChange({ ...draft, purpose })}
        />
      </div>
      <div>
        <Check
          checked={draft.wholeSheet}
          label={p.wholeSheet}
          onChange={(wholeSheet) => onChange({ ...draft, wholeSheet })}
        />
        {draft.wholeSheet ? <p className="mt-0.5 text-[10px] text-gray-500">{p.wholeSheetHint}</p> : null}
      </div>
    </div>
  );
}

/**
 * Sheet format, finishing, «N шт на листе → M листов», the price breakdown, the
 * per-piece price and a to-scale sheet preview (camera marks only for a figured cut).
 */
export function PostcardFinishingFields({
  draft,
  effectiveFormat,
  layout,
  pricing,
  paper,
  settings,
  artworkFile,
  onChange,
  t,
  hideStock = false,
  dealerView = false,
  manualTotalMdl = null,
}: {
  draft: PostcardDraft;
  /** Sheet the item is actually printed on (A3+ when it does not fit A4+). */
  effectiveFormat: PostcardSheetFormat;
  layout: BusinessCardSheetLayout | null;
  pricing: PostcardRowPricing | null;
  paper: AdminSheetPaperJson | null;
  settings: PostcardSettings;
  artworkFile?: File | null;
  onChange: (next: PostcardDraft) => void;
  t: TranslationDictionary;
  hideStock?: boolean;
  dealerView?: boolean;
  manualTotalMdl?: number | null;
}): ReactElement {
  const p = t.admin.postcard;
  const cur = t.admin.currency;
  const artUrl = useMemo(
    () => (artworkFile && artworkFile.type.startsWith("image/") ? URL.createObjectURL(artworkFile) : null),
    [artworkFile],
  );
  useEffect(() => () => {
    if (artUrl) URL.revokeObjectURL(artUrl);
  }, [artUrl]);

  const set = (patch: Partial<PostcardDraft>) => onChange({ ...draft, ...patch });
  const spec = POSTCARD_SHEET_FORMAT_SPECS[effectiveFormat];
  const a4Sheets = pricing ? pricing.sheetsUsed * spec.a4Equivalent : 0;
  const pc = pricing?.postcard ?? null;
  const perPiece =
    pricing && pricing.quantity > 0 ? (Math.round((pricing.totalSellPriceMdl / pricing.quantity) * 100) / 100).toFixed(2) : null;
  const stockShort = paper != null && pricing != null && paper.stockSheets < a4Sheets;
  const unpriced = pc != null && !(pc.printRatePerPassMdl > 0);
  const marginMm = draft.figuredCut && !draft.wholeSheet ? settings.figuredCutMarginMm : 0;

  const lines: [string, number][] = pc
    ? ([
        [p.printLine(pc.passes, pc.printRatePerPassMdl), pc.breakdown.printMdl],
        [p.laminationLine(pc.paperSheetsUsed), pc.breakdown.laminationMdl],
        [p.figuredCutLine, pc.breakdown.figuredCutMdl],
        [p.creaseLine, pc.breakdown.creaseMdl],
        [p.cornersLine, pc.breakdown.cornersMdl],
        [p.minimumLine, pc.breakdown.minimumUpliftMdl],
      ] as [string, number][]).filter(([, v]) => v > 0)
    : [];

  return (
    <div className="max-w-md space-y-2 py-0.5 text-sm">
      <div>
        <Label>{p.sheetLabel}</Label>
        <Toggle
          value={draft.wholeSheet ? draft.format : effectiveFormat}
          options={POSTCARD_SHEET_FORMATS.map(
            (f) => [f, `${f} ${POSTCARD_SHEET_FORMAT_SPECS[f].widthCm * 10}×${POSTCARD_SHEET_FORMAT_SPECS[f].heightCm * 10}`] as const,
          )}
          onChange={(format) => set({ format })}
        />
        {!draft.wholeSheet && effectiveFormat !== draft.format ? (
          <p className="mt-0.5 text-[10px] font-medium text-amber-800">{p.sheetAutoA3}</p>
        ) : null}
      </div>
      <div>
        <Label>{p.laminationLabel}</Label>
        <Toggle
          value={draft.lamination}
          options={POSTCARD_LAMINATIONS.map(
            (l) => [l, l === "gloss" ? p.laminationGloss : l === "matte" ? p.laminationMatte : p.laminationNone] as const,
          )}
          onChange={(lamination) => set({ lamination })}
        />
      </div>
      <div>
        <Label>{p.creaseLabel}</Label>
        <Toggle
          value={draft.creaseLines}
          options={Array.from({ length: POSTCARD_MAX_CREASE_LINES + 1 }, (_, n) => [n, String(n)] as const)}
          onChange={(creaseLines) => set({ creaseLines })}
        />
      </div>
      {!draft.wholeSheet ? (
        <div className="flex flex-col gap-1">
          <Check checked={draft.roundedCorners} label={p.roundedCorners} onChange={(roundedCorners) => set({ roundedCorners })} />
          <Check checked={draft.figuredCut} label={p.figuredCut} onChange={(figuredCut) => set({ figuredCut })} />
          {draft.figuredCut ? (
            <p className="text-[10px] text-gray-500">{p.figuredCutHint(settings.figuredCutMarginMm, settings.figuredCutGapMm)}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2 rounded-lg border border-gray-100 bg-gray-50/80 p-2 text-[11px] leading-relaxed text-gray-800">
        {layout && layout.cardsPerSheet > 0 ? (
          <StickerSheetPreview
            data={{
              shape: draft.roundedCorners && !draft.wholeSheet ? "rounded" : "rect",
              format: effectiveFormat,
              cut: draft.figuredCut && !draft.wholeSheet,
              sheetWidthCm: spec.widthCm,
              sheetHeightCm: spec.heightCm,
              marginMm,
              columns: layout.columns,
              rows: layout.rows,
              slotWidthCm: layout.slotWidthCm,
              slotHeightCm: layout.slotHeightCm,
              gapCm: layout.gapCm,
              marginXCm: layout.marginXCm,
              marginYCm: layout.marginYCm,
            }}
            imageUrl={artUrl}
            fillColor="#ffe4e6"
            maxHeightPx={140}
            className="shrink-0"
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {layout && layout.cardsPerSheet > 0 ? (
            <p className="font-medium">
              {draft.wholeSheet
                ? p.wholeSheetsSummary(pricing?.sheetsUsed ?? 0, effectiveFormat, a4Sheets)
                : p.perSheetSummary(layout.cardsPerSheet, pricing?.sheetsUsed ?? 0, effectiveFormat)}
            </p>
          ) : (
            <p className="font-medium text-amber-800">{p.doesNotFit}</p>
          )}
          {pricing ? (
            <>
              {manualTotalMdl != null ? (
                <>
                  <p className="font-semibold tabular-nums">
                    {t.admin.newOrderPage.lfTotal}: {manualTotalMdl} {cur}
                  </p>
                  <p className="text-[10px] font-medium text-amber-800">
                    {t.admin.sheetManualPriceNote(unpriced ? null : pricing.totalSellPriceMdl)}
                  </p>
                </>
              ) : unpriced ? (
                dealerView ? (
                  <p className="font-medium">{t.cabinet.newOrder.studioPricesLine}</p>
                ) : (
                  <p className="text-[10px] font-medium text-amber-800">{t.admin.newOrderPage.bcPaperNoPrice}</p>
                )
              ) : (
                <>
                  {lines.map(([label, v]) => (
                    <p key={label} className="flex justify-between gap-2 tabular-nums text-gray-600">
                      <span className="min-w-0">{label}</span>
                      <span className="shrink-0">{Math.round(v * 100) / 100} {cur}</span>
                    </p>
                  ))}
                  <p className="font-semibold tabular-nums">
                    {t.admin.newOrderPage.lfTotal}: {pricing.totalSellPriceMdl} {cur}
                    {perPiece != null && !draft.wholeSheet ? (
                      <span className="ml-1 font-normal text-gray-600">· {p.perPiece(perPiece)}</span>
                    ) : null}
                  </p>
                </>
              )}
              {paper && !hideStock ? (
                <p className={cn("text-[10px]", stockShort ? "font-medium text-red-700" : "text-gray-500")}>
                  {t.admin.sheetPaperCatalogColStockSheets}: {paper.stockSheets.toFixed(0)} A4+ · {p.stockNeed(a4Sheets)}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
