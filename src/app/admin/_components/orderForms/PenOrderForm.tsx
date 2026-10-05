"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { PenTemplateSelector } from "@/app/pen/_components/PenTemplateSelector";
import { PenEditor } from "@/app/pen/_components/PenEditor";
import {
  PenCanvasPreview,
  type PenCanvasPreviewHandle,
} from "@/app/pen/_components/PenCanvasPreview";
import {
  buildPenTemplates,
  type PenTemplate,
  type PhotoSettings,
} from "@/lib/pen/templates";
import { PEN_DEFAULT_PRINT, cmToPx } from "@/lib/printDimensions";
import {
  PenProductPicker,
  type PenProductOption,
  type PenProductSelection,
} from "@/app/pen/_components/PenProductPicker";
import MugFontLoader from "../MugFontLoader";
import { Input } from "@/components/ui/input";
import { MAX_ADMIN_COPIES, parseAdminCopiesInput } from "./PaperOrderForm";

/**
 * Pen rows come in the same two flavours as mug and notebook rows, but only
 * the editor flavour reaches this component — ready-made artwork is handled by
 * the generic upload row. The field is still part of the value so pen rows can
 * share the cabinet's row-state and blob-cleanup helpers.
 */
export type PenMode = "editor" | "upload";

export interface PenFormValue {
  mode: PenMode;
  template: PenTemplate;
  photos: string[];
  photoSettings: PhotoSettings[];
  text: string;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  selection: PenProductSelection | null;
  customLayoutFile: File | null;
  customLayoutUrl: string | null;
  copiesStr: string;
}

export const EMPTY_PEN_VALUE: PenFormValue = {
  mode: "editor",
  template: buildPenTemplates()[0]!,
  photos: [],
  photoSettings: [],
  text: "",
  fontFamily: "Roboto",
  textColor: "#000000",
  backgroundColor: "transparent",
  selection: null,
  customLayoutFile: null,
  customLayoutUrl: null,
  copiesStr: "1",
};

export interface PenOrderFormHandle {
  getCanvas: () => HTMLCanvasElement | null;
}

export interface PenOrderFormProps {
  value: PenFormValue;
  /**
   * Accepts a new value or a functional updater. The functional form is
   * required because `PenEditor` fires `onPhotosChange` and
   * `onPhotoSettingsChange` back-to-back inside `img.onload`.
   */
  onChange: (next: PenFormValue | ((prev: PenFormValue) => PenFormValue)) => void;
  productItems: PenProductOption[];
  t: TranslationDictionary;
  hideProductPicker?: boolean;
  /** When true, hides the quantity row at the bottom (the row card owns it). */
  hideCopiesBar?: boolean;
}

export const PenOrderForm = forwardRef<PenOrderFormHandle, PenOrderFormProps>(
  function PenOrderForm(
    {
      value,
      onChange,
      productItems,
      t,
      hideProductPicker = false,
      hideCopiesBar = false,
    },
    ref,
  ) {
    const canvasRef = useRef<PenCanvasPreviewHandle>(null);

    useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current?.getCanvas() ?? null,
    }));

    function patch(p: Partial<PenFormValue>): void {
      onChange((prev) => ({ ...prev, ...p }));
    }

    const selectedProduct = useMemo(() => {
      const sel = value.selection;
      if (sel?.type !== "catalog") return undefined;
      return productItems.find((p) => p.id === sel.productId);
    }, [productItems, value.selection]);

    const canvasSize = useMemo(() => {
      if (selectedProduct) {
        return {
          width: cmToPx(selectedProduct.printWidthCm, selectedProduct.printDpi),
          height: cmToPx(selectedProduct.printHeightCm, selectedProduct.printDpi),
        };
      }
      return {
        width: cmToPx(PEN_DEFAULT_PRINT.widthCm, PEN_DEFAULT_PRINT.dpi),
        height: cmToPx(PEN_DEFAULT_PRINT.heightCm, PEN_DEFAULT_PRINT.dpi),
      };
    }, [selectedProduct]);

    const sizedTemplate = useMemo(() => {
      const built = buildPenTemplates(canvasSize.width, canvasSize.height);
      return built.find((tmpl) => tmpl.id === value.template.id) ?? built[0]!;
    }, [canvasSize.width, canvasSize.height, value.template.id]);

    const copiesValid = parseAdminCopiesInput(value.copiesStr) !== null;

    return (
      <>
        <MugFontLoader />

        {!hideProductPicker && (
          <div className="border border-gray-200 rounded-lg p-3 mb-4 bg-gray-50/50">
            <PenProductPicker
              variant="admin"
              items={productItems}
              value={value.selection}
              onChange={(sel) => patch({ selection: sel })}
              label={t.pen.penProductPickLabel}
              hint={t.pen.penProductPickHint}
              emptyMessage={t.pen.penProductCatalogEmpty}
              otherLabel={t.pen.penProductOtherLabel}
              otherHint={t.pen.penProductOtherHint}
            />
          </div>
        )}

        <div className="space-y-5 min-w-0">
          <PenTemplateSelector
            selected={sizedTemplate.id}
            onSelect={(template) => patch({ template })}
            canvasWidth={canvasSize.width}
            canvasHeight={canvasSize.height}
          />

          <PenEditor
            photos={value.photos}
            photoSettings={value.photoSettings}
            template={sizedTemplate}
            text={value.text}
            fontFamily={value.fontFamily}
            textColor={value.textColor}
            backgroundColor={value.backgroundColor}
            productBaseColor={selectedProduct?.bodyColorHex ?? null}
            onPhotosChange={(photos) => patch({ photos })}
            onPhotoSettingsChange={(photoSettings) => patch({ photoSettings })}
            onTextChange={(text) => patch({ text })}
            onFontChange={(fontFamily) => patch({ fontFamily })}
            onTextColorChange={(textColor) => patch({ textColor })}
            onBgColorChange={(backgroundColor) => patch({ backgroundColor })}
          />

          <PenCanvasPreview
            ref={canvasRef}
            template={sizedTemplate}
            photoUrls={value.photos}
            photoSettings={value.photoSettings}
            text={value.text}
            fontFamily={value.fontFamily}
            textColor={value.textColor}
            backgroundColor={value.backgroundColor}
          />
        </div>

        {!hideCopiesBar && (
          <div className="border border-gray-200 rounded-xl p-4 mt-6 flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700 shrink-0">
              {t.upload.copiesLabel}
            </span>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={t.admin.copiesInputPlaceholder}
              value={value.copiesStr}
              onChange={(e) =>
                patch({ copiesStr: e.target.value.replace(/\D/g, "").slice(0, 7) })
              }
              onBlur={() => {
                const digits = value.copiesStr.replace(/\D/g, "");
                if (digits === "") {
                  patch({ copiesStr: "1" });
                  return;
                }
                let n = parseInt(digits, 10);
                if (!Number.isFinite(n) || n < 1) n = 1;
                if (n > MAX_ADMIN_COPIES) n = MAX_ADMIN_COPIES;
                patch({ copiesStr: String(n) });
              }}
              className="w-28 text-right tabular-nums"
              aria-invalid={!copiesValid}
            />
          </div>
        )}
      </>
    );
  },
);
