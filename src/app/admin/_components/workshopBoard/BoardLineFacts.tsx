"use client";

import { BookOpen, Coffee, CreditCard, FileText, Pencil, ScanLine, Sticker } from "lucide-react";
import { StickerSheetPreview } from "@/components/orders/StickerSheetPreview";
import { isGiftSetSku } from "@/lib/giftSet/giftSet";
import { PRODUCT_TYPE_ICONS } from "@/lib/productTypeIcons";
import type { WorkshopBoardLine } from "@/lib/workshopBoard/types";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { DtfBoardLineSummary } from "./DtfBoardParts";
import { SublimationBoardLineSummary } from "./SublimationBoardParts";
import { UvBoardLineSummary } from "./UvBoardParts";

/** What a board line is (material, size, quantity…): the summary row of a board card and of the «Весь заказ» panel. */
export function BoardLineFacts({ line }: { line: WorkshopBoardLine }) {
  const { t } = useLanguageStore();
  switch (line.facts.kind) {
    case "lf": {
      const { materialName, widthCm, heightCm, quantity, extrasRu, sheets } = line.facts.data;
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
          <ScanLine className="h-3 w-3 shrink-0 text-sky-600" aria-hidden />
          <span className="font-medium text-gray-800 truncate max-w-[14rem]" title={materialName}>
            {materialName}
          </span>
          <span className="text-gray-300" aria-hidden>·</span>
          <span className="tabular-nums shrink-0">{widthCm}×{heightCm} см</span>
          <span className="text-gray-300" aria-hidden>·</span>
          <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800 leading-none">
            {t.admin.lfFilePrintCopiesBadge(quantity)}
          </span>
          {sheets ? (
            // Sheet material (VATMAN A1): how many sheets to print.
            <span className="shrink-0 rounded-md border border-sky-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-sky-900 leading-none">
              {sheets.label}
            </span>
          ) : null}
          {extrasRu ? (
            <span className="basis-full rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-900">
              Отделка: {extrasRu}
            </span>
          ) : null}
        </div>
      );
    }
    case "sheet_product": {
      const {
        paperName,
        quantity,
        sheetsUsed,
        sides,
        cardsPerSheet,
        cardTrimWidthCm,
        cardTrimHeightCm,
        finishingRu,
        sticker,
        postcard,
      } = line.facts.data;
      if (postcard) {
        const PostcardIcon = PRODUCT_TYPE_ICONS.postcard;
        return (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
            <PostcardIcon className="h-3 w-3 shrink-0 text-rose-700" aria-hidden />
            <span className="min-w-0 max-w-full rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-rose-800">
              {postcard.summaryRu}
            </span>
            <span className="max-w-[12rem] truncate font-medium text-gray-800" title={paperName}>
              {paperName}
            </span>
            <span className="shrink-0">
              {sides === "two" ? t.admin.bcOrderLineSidesTwo : t.admin.bcOrderLineSidesOne}
            </span>
            <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-teal-800">
              {t.admin.bcOrderLineRunLabel(quantity)}
            </span>
            <span className="shrink-0 text-gray-500">
              {t.admin.bcOrderLinePerSheetLabel(cardsPerSheet)}
            </span>
            <span className="shrink-0 font-medium text-gray-700">
              {t.admin.bcOrderLineSheetsLabel(sheetsUsed)} {postcard.preview.format}
            </span>
            <div className="flex basis-full items-start gap-2">
              <StickerSheetPreview data={postcard.preview} maxHeightPx={96} fillColor="#ffe4e6" className="shrink-0" />
              <ol className="min-w-0 list-decimal space-y-0.5 pl-4 text-[11px] text-gray-700">
                {postcard.stepsRu.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        );
      }
      if (sticker) {
        return (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
            <Sticker className="h-3 w-3 shrink-0 text-lime-700" aria-hidden />
            <span className="shrink-0 rounded-md border border-lime-200 bg-lime-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-lime-800">
              {sticker.summaryRu}
            </span>
            <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-teal-800">
              {t.admin.bcOrderLineRunLabel(quantity)}
            </span>
            <span className="shrink-0 text-gray-500">
              {t.admin.bcOrderLinePerSheetLabel(cardsPerSheet)}
            </span>
            <span className="shrink-0 font-medium text-gray-700">
              {t.admin.bcOrderLineSheetsLabel(sheetsUsed)}
            </span>
            <span className="max-w-[12rem] truncate text-gray-400" title={paperName}>
              {paperName}
            </span>
            <StickerSheetPreview data={sticker} maxHeightPx={96} className="basis-full" />
            {sticker.format === "A4+" ? (
              <span className="basis-full text-[10px] text-gray-500">
                {t.admin.stickerSheet.a4PairCaption} · {sheetsUsed} A4+ = {Math.ceil(sheetsUsed / 2)} A3+
              </span>
            ) : null}
          </div>
        );
      }
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
          <CreditCard className="h-3 w-3 shrink-0 text-teal-600" aria-hidden />
          <span
            className="max-w-[14rem] truncate font-medium text-gray-800"
            title={paperName}
          >
            {paperName}
          </span>
          <span className="text-gray-300" aria-hidden>·</span>
          <span className="shrink-0 tabular-nums">
            {t.admin.bcOrderLineCardSizeLabel(
              cardTrimWidthCm,
              cardTrimHeightCm,
            )}
          </span>
          <span className="text-gray-300" aria-hidden>·</span>
          <span className="shrink-0">
            {sides === "two"
              ? t.admin.bcOrderLineSidesTwo
              : t.admin.bcOrderLineSidesOne}
          </span>
          <span className="text-gray-300" aria-hidden>·</span>
          <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-teal-800">
            {t.admin.bcOrderLineRunLabel(quantity)}
          </span>
          <span className="shrink-0 text-gray-500">
            {t.admin.bcOrderLineSheetsLabel(sheetsUsed)}
          </span>
          <span className="shrink-0 text-gray-500">
            {t.admin.bcOrderLinePerSheetLabel(cardsPerSheet)}
          </span>
          {finishingRu ? (
            <span className="shrink-0 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-violet-800">
              {finishingRu}
            </span>
          ) : null}
        </div>
      );
    }
    case "mug": {
      const { displayName, quantity } = line.facts.data;
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
          <Coffee className="h-3 w-3 shrink-0 text-amber-600" aria-hidden />
          <span className="font-medium text-gray-800 truncate max-w-[14rem]" title={displayName}>
            {displayName}
          </span>
          <span className="text-gray-300" aria-hidden>·</span>
          <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 leading-none">
            {t.admin.orderSkuPiecesBadge(quantity)}
          </span>
        </div>
      );
    }
    case "notebook": {
      const { displayName, quantity, paperKind } = line.facts.data;
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
          <BookOpen className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden />
          <span className="font-medium text-gray-800 truncate max-w-[14rem]" title={displayName}>
            {displayName}
          </span>
          {paperKind && (
            <>
              <span className="text-gray-300" aria-hidden>·</span>
              <span className="text-gray-500">
                {paperKind === "squared"
                  ? t.admin.notebookPaperKindSquared
                  : paperKind === "dated"
                    ? t.admin.notebookPaperKindDated
                    : paperKind === "ruled"
                      ? t.admin.notebookPaperKindRuled
                      : paperKind}
              </span>
            </>
          )}
          <span className="text-gray-300" aria-hidden>·</span>
          <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 leading-none">
            {t.admin.orderSkuPiecesBadge(quantity)}
          </span>
        </div>
      );
    }
    case "pen": {
      const { displayName, sku, quantity } = line.facts.data;
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
          <Pencil className="h-3 w-3 shrink-0 text-pink-600" aria-hidden />
          <span className="font-medium text-gray-800 truncate max-w-[14rem]" title={displayName}>
            {displayName}
          </span>
          {/* A ready set's pen carries the set's SKU (grouping only): «Ручка из набора · чёрный» says it all. */}
          {!isGiftSetSku(sku) && (
            <>
              <span className="text-gray-300" aria-hidden>·</span>
              <span className="font-mono text-gray-500">{sku}</span>
            </>
          )}
          <span className="text-gray-300" aria-hidden>·</span>
          <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-pink-200 bg-pink-50 px-1.5 py-0.5 text-[11px] font-semibold text-pink-800 leading-none">
            {t.admin.orderSkuPiecesBadge(quantity)}
          </span>
        </div>
      );
    }
    case "dtf":
      return <DtfBoardLineSummary facts={line.facts.data} />;
    case "uv":
      return <UvBoardLineSummary facts={line.facts.data} />;
    case "sublimation":
      return <SublimationBoardLineSummary facts={line.facts.data} />;
    case "paper": {
      const { label, color, quantity } = line.facts.data;
      const colorLabel = color === "color"
        ? t.workshopBoard.paperColorLabel
        : color === "bw"
          ? t.workshopBoard.paperBwLabel
          : t.workshopBoard.paperMixedLabel;
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
          <FileText className="h-3 w-3 shrink-0 text-violet-600" aria-hidden />
          <span className="font-medium text-gray-800">{label}</span>
          <span className="text-gray-300" aria-hidden>·</span>
          <span>{colorLabel}</span>
          <span className="text-gray-300" aria-hidden>·</span>
          <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800 leading-none">
            ×{quantity}
          </span>
        </div>
      );
    }
  }
}
