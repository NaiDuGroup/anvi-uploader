"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Box, Image as ImageIcon, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { TemplateSelector } from "@/app/mug/_components/TemplateSelector";
import { LayoutPreviewWithZoom } from "./LayoutPreviewWithZoom";
import { MugEditor } from "@/app/mug/_components/MugEditor";
import {
  MugCanvasPreview,
  type MugCanvasPreviewHandle,
} from "@/app/mug/_components/MugCanvasPreview";
import {
  buildMugTemplates,
  MUG_TEMPLATES,
  type MugTemplate,
  type PhotoSettings,
} from "@/lib/mug/templates";
import { MUG_DEFAULT_PRINT, cmToPx } from "@/lib/printDimensions";
import {
  getImageDimensions,
  validateLayoutSize,
  type SizeValidationResult,
} from "@/lib/imageDimensions";
import {
  MugProductPicker,
  colorsFromProduct,
  type MugProductOption,
  type MugProductSelection,
} from "@/app/mug/_components/MugProductPicker";
import MugFontLoader from "../MugFontLoader";
import { Input } from "@/components/ui/input";
import {
  MAX_ADMIN_COPIES,
  parseAdminCopiesInput,
} from "./PaperOrderForm";

const Preview3DLoading = () => (
  <div
    className="rounded-xl border border-gray-200 overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100 flex flex-col items-center justify-center gap-3"
    style={{ height: 340 }}
  >
    <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
  </div>
);

const Mug3DPreview = dynamic(
  () => import("@/app/mug/_components/Mug3DPreview").then((m) => m.Mug3DPreview),
  { ssr: false, loading: Preview3DLoading },
);

const Mug3DPreviewFromUrl = dynamic(
  () =>
    import("@/app/mug/_components/Mug3DPreviewFromUrl").then(
      (m) => m.Mug3DPreviewFromUrl,
    ),
  { ssr: false, loading: Preview3DLoading },
);

export type MugMode = "editor" | "upload";

export interface MugFormValue {
  mode: MugMode;
  template: MugTemplate;
  photos: string[];
  photoSettings: PhotoSettings[];
  text: string;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  selection: MugProductSelection | null;
  /** Newly chosen file in upload mode (null when reusing existing). */
  customLayoutFile: File | null;
  /** Either a `blob:` URL for the new file or an existing R2 preview URL. */
  customLayoutUrl: string | null;
  copiesStr: string;
}

export const EMPTY_MUG_VALUE: MugFormValue = {
  mode: "editor",
  template: MUG_TEMPLATES[0]!,
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

export interface MugOrderFormHandle {
  /** Returns the active 2D canvas (editor mode only). */
  getCanvas: () => HTMLCanvasElement | null;
  /**
   * Returns the latest upload-size validation. `null` means "not validated"
   * (no file picked, no catalog product selected, or "Other"). The parent
   * should block submit when `result.ok === false`.
   */
  getUploadSizeValidation: () => SizeValidationResult | null;
}

export interface MugOrderFormProps {
  value: MugFormValue;
  /**
   * Accepts either a new value or a functional updater (mirrors React's
   * `useState` signature). Functional form is required for safe back-to-back
   * updates inside async callbacks (e.g. `MugEditor` fires `onPhotosChange`
   * and `onPhotoSettingsChange` synchronously inside `img.onload`).
   */
  onChange: (next: MugFormValue | ((prev: MugFormValue) => MugFormValue)) => void;
  productItems: MugProductOption[];
  t: TranslationDictionary;
  /** Hides the mug-product picker block (e.g. when product is fixed during edit). */
  hideProductPicker?: boolean;
  /**
   * Notifies the parent of the latest upload-size validation. `null` =
   * "not validated" (no file, no catalog product, or "Other"). The parent
   * uses this to disable the submit button reactively.
   */
  onUploadValidationChange?: (result: SizeValidationResult | null) => void;
  /**
   * When true, the form renders the upload/editor block and the 3D preview
   * stacked vertically (single column). The default is to show them
   * side-by-side on `lg+` screens. The cabinet sets this to `true` because
   * its outer layout already places the picker beside the form, leaving no
   * horizontal room for an additional inline preview pane.
   */
  singleColumn?: boolean;
  /**
   * When true, hides the bottom quantity row (e.g. wizard uses table copies).
   */
  hideCopiesBar?: boolean;
}

export const MugOrderForm = forwardRef<MugOrderFormHandle, MugOrderFormProps>(
  function MugOrderForm(
    {
      value,
      onChange,
      productItems,
      t,
      hideProductPicker = false,
      onUploadValidationChange,
      singleColumn = false,
      hideCopiesBar = false,
    },
    ref,
  ) {
    const layoutGridClass = singleColumn
      ? "grid grid-cols-1 gap-6"
      : "grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6";
    const canvasRef = useRef<MugCanvasPreviewHandle>(null);
    const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
    const [previewMode, setPreviewMode] = useState<"2d" | "3d">("2d");
    const [sizeValidation, setSizeValidation] =
      useState<SizeValidationResult | null>(null);
    const [sizeReadError, setSizeReadError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current?.getCanvas() ?? null,
      getUploadSizeValidation: () => sizeValidation,
    }));

    // Functional updater so synchronous back-to-back patches (e.g.
    // photos + photoSettings inside img.onload) don't clobber each other.
    function patch(p: Partial<MugFormValue>): void {
      onChange((prev) => ({ ...prev, ...p }));
    }

    const selectedProduct = useMemo(() => {
      const sel = value.selection;
      if (sel?.type !== "catalog") return undefined;
      return productItems.find((p) => p.id === sel.productId);
    }, [productItems, value.selection]);

    const previewColors = useMemo(
      () => colorsFromProduct(selectedProduct),
      [selectedProduct],
    );

    // Per-product print area (cm × DPI → px). Falls back to legacy mug canvas
    // when "Other" is selected or before the picker has any value.
    const canvasSize = useMemo(() => {
      if (selectedProduct) {
        return {
          width: cmToPx(selectedProduct.printWidthCm, selectedProduct.printDpi),
          height: cmToPx(selectedProduct.printHeightCm, selectedProduct.printDpi),
        };
      }
      return {
        width: cmToPx(MUG_DEFAULT_PRINT.widthCm, MUG_DEFAULT_PRINT.dpi),
        height: cmToPx(MUG_DEFAULT_PRINT.heightCm, MUG_DEFAULT_PRINT.dpi),
      };
    }, [selectedProduct]);

    // Re-instantiate the active template against the selected canvas size so
    // the editor / preview always render at the product's true dimensions.
    const sizedTemplate = useMemo(() => {
      const built = buildMugTemplates(canvasSize.width, canvasSize.height);
      return built.find((t) => t.id === value.template.id) ?? built[0]!;
    }, [canvasSize.width, canvasSize.height, value.template.id]);

    // 3D preview availability is per-product. "Other" mugs default to true so
    // the legacy GLB still works for non-catalog orders.
    const has3dPreview = selectedProduct?.has3dPreview ?? true;

    // If the selected SKU has no GLB, force the visible mode back to 2D so
    // switching SKUs mid-edit doesn't leave the user looking at a hidden 3D pane.
    useEffect(() => {
      if (!has3dPreview && previewMode === "3d") setPreviewMode("2d");
    }, [has3dPreview, previewMode]);

    // Mirror local validation state up to the parent so step-gating reacts to
    // async dimension reads (parent never imports the validator directly).
    useEffect(() => {
      onUploadValidationChange?.(sizeValidation);
    }, [sizeValidation, onUploadValidationChange]);

    const handleCustomLayoutFile = useCallback(
      (file: File | null) => {
        if (value.customLayoutUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(value.customLayoutUrl);
        }
        if (!file) {
          setSizeValidation(null);
          setSizeReadError(null);
          onChange((prev) => ({
            ...prev,
            customLayoutFile: null,
            customLayoutUrl: null,
          }));
          return;
        }
        onChange((prev) => ({
          ...prev,
          customLayoutFile: file,
          customLayoutUrl: URL.createObjectURL(file),
        }));
        // Validation runs only for catalog products. "Other" mugs (no
        // selectedProduct) intentionally skip the size check per plan.
        if (!selectedProduct) {
          setSizeValidation(null);
          setSizeReadError(null);
          return;
        }
        const expected = {
          width: cmToPx(selectedProduct.printWidthCm, selectedProduct.printDpi),
          height: cmToPx(
            selectedProduct.printHeightCm,
            selectedProduct.printDpi,
          ),
        };
        getImageDimensions(file)
          .then((actual) => {
            setSizeReadError(null);
            setSizeValidation(validateLayoutSize(actual, expected));
          })
          .catch(() => {
            setSizeReadError(t.admin.layoutValidation.readDimensionsFailed);
            setSizeValidation(null);
          });
      },
      [value, onChange, selectedProduct, t.admin.layoutValidation],
    );

    // Re-validate when the catalog product changes mid-upload (e.g. operator
    // first uploads file, then picks the SKU). Only runs against an actual
    // local File — already-uploaded R2 URLs are trusted.
    useEffect(() => {
      const file = value.customLayoutFile;
      if (!file) return;
      if (!selectedProduct) {
        setSizeValidation(null);
        setSizeReadError(null);
        return;
      }
      const expected = {
        width: cmToPx(selectedProduct.printWidthCm, selectedProduct.printDpi),
        height: cmToPx(selectedProduct.printHeightCm, selectedProduct.printDpi),
      };
      let cancelled = false;
      getImageDimensions(file)
        .then((actual) => {
          if (cancelled) return;
          setSizeReadError(null);
          setSizeValidation(validateLayoutSize(actual, expected));
        })
        .catch(() => {
          if (cancelled) return;
          setSizeReadError(t.admin.layoutValidation.readDimensionsFailed);
          setSizeValidation(null);
        });
      return () => {
        cancelled = true;
      };
    }, [
      value.customLayoutFile,
      selectedProduct,
      t.admin.layoutValidation,
    ]);

    const copiesValid = parseAdminCopiesInput(value.copiesStr) !== null;

    // Cleanup blob URL on unmount only — blobs created elsewhere remain owned by parent.
    useEffect(() => {
      const url = value.customLayoutUrl;
      return () => {
        if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <>
        {value.mode === "editor" && <MugFontLoader />}

        {!hideProductPicker && (
          <div className="border border-gray-200 rounded-lg p-3 mb-4 bg-gray-50/50">
            <MugProductPicker
              variant="admin"
              items={productItems}
              value={value.selection}
              onChange={(sel) => patch({ selection: sel })}
              label={t.admin.mugProductPickLabel}
              hint={t.admin.mugProductPickHint}
              emptyMessage={t.admin.mugProductCatalogEmpty}
              otherLabel={t.admin.mugProductOtherLabel}
              otherHint={t.admin.mugProductOtherHint}
            />
          </div>
        )}

        {value.mode === "upload" ? (
          <div className={layoutGridClass}>
            <div className="space-y-5 min-w-0">
              {!value.customLayoutUrl ? (
                <>
                  <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-300 rounded-xl p-10 cursor-pointer hover:border-gold hover:bg-gold/5 transition-colors">
                    <Upload className="w-10 h-10 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                      {t.mug.uploadReadyLayout}
                    </span>
                    <span className="text-xs text-gray-400">
                      {t.mug.uploadLayoutHint}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        handleCustomLayoutFile(f);
                      }}
                    />
                  </label>
                  {selectedProduct && (
                    <p className="text-xs text-gray-500 text-center">
                      {t.admin.layoutValidation.requiredSizeHint(
                        canvasSize.width,
                        canvasSize.height,
                      )}
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <LayoutPreviewWithZoom
                    imageUrl={value.customLayoutUrl}
                    onRemove={() => handleCustomLayoutFile(null)}
                    removeLabel={t.mug.removeLayout}
                    t={t}
                  />
                  {sizeReadError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {sizeReadError}
                    </p>
                  )}
                  {sizeValidation && !sizeValidation.ok && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {t.admin.layoutValidation.sizeMismatch(
                        sizeValidation.expected.width,
                        sizeValidation.expected.height,
                        sizeValidation.actual.width,
                        sizeValidation.actual.height,
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>

            {value.customLayoutUrl && has3dPreview && (
              <div
                className={cn(
                  "space-y-3",
                  !singleColumn && "lg:sticky lg:top-0 lg:self-start",
                )}
              >
                <Mug3DPreviewFromUrl
                  imageUrl={value.customLayoutUrl}
                  bodyColorHex={previewColors.bodyColorHex}
                  handleColorHex={previewColors.handleColorHex}
                  innerColorHex={previewColors.innerColorHex}
                  rimColorHex={previewColors.rimColorHex}
                />
              </div>
            )}
          </div>
        ) : (
          <div className={layoutGridClass}>
            <div className="space-y-5 min-w-0">
              <TemplateSelector
                selected={sizedTemplate.id}
                onSelect={(template) => patch({ template })}
                canvasWidth={canvasSize.width}
                canvasHeight={canvasSize.height}
                compact
              />

              <MugEditor
                photos={value.photos}
                photoSettings={value.photoSettings}
                template={sizedTemplate}
                text={value.text}
                fontFamily={value.fontFamily}
                textColor={value.textColor}
                backgroundColor={value.backgroundColor}
                productBaseColor={selectedProduct?.bodyColorHex ?? null}
                onPhotosChange={(photos) => patch({ photos })}
                onPhotoSettingsChange={(photoSettings) =>
                  patch({ photoSettings })
                }
                onTextChange={(text) => patch({ text })}
                onFontChange={(fontFamily) => patch({ fontFamily })}
                onTextColorChange={(textColor) => patch({ textColor })}
                onBgColorChange={(backgroundColor) =>
                  patch({ backgroundColor })
                }
              />
            </div>

            <div
              className={cn(
                "space-y-3",
                !singleColumn && "lg:sticky lg:top-0 lg:self-start",
              )}
            >
              <div className="relative">
                <MugCanvasPreview
                  ref={canvasRef}
                  template={sizedTemplate}
                  photoUrls={value.photos}
                  photoSettings={value.photoSettings}
                  text={value.text}
                  fontFamily={value.fontFamily}
                  textColor={value.textColor}
                  backgroundColor={value.backgroundColor}
                  onCanvasReady={setCanvasEl}
                />
                {has3dPreview && (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewMode(previewMode === "2d" ? "3d" : "2d")
                    }
                    className={cn(
                      "absolute top-2 right-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-md backdrop-blur-sm transition-colors",
                      previewMode === "3d"
                        ? "bg-gold text-white hover:bg-gold-dark"
                        : "bg-white/90 text-gray-600 hover:bg-white border border-gray-200",
                    )}
                    title={
                      previewMode === "2d"
                        ? t.approve.preview3d
                        : t.approve.preview2d
                    }
                  >
                    {previewMode === "2d" ? (
                      <Box className="w-3.5 h-3.5" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5" />
                    )}
                    {previewMode === "2d" ? "3D" : "2D"}
                  </button>
                )}
              </div>

              {has3dPreview && previewMode === "3d" && (
                <Mug3DPreview
                  canvasElement={canvasEl}
                  bodyColorHex={previewColors.bodyColorHex}
                  handleColorHex={previewColors.handleColorHex}
                  innerColorHex={previewColors.innerColorHex}
                  rimColorHex={previewColors.rimColorHex}
                />
              )}
            </div>
          </div>
        )}

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
              patch({
                copiesStr: e.target.value.replace(/\D/g, "").slice(0, 7),
              })
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
