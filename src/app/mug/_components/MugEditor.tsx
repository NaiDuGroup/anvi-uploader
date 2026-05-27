"use client";

import { useEffect, useMemo, useRef } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Input } from "@/components/ui/input";
import {
  ImagePlus,
  Trash2,
  Maximize2,
  Crop,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
} from "lucide-react";
import type { PhotoSettings, PhotoFitMode, PhotoAlignment, PhotoVerticalAlignment, MugTemplate } from "@/lib/mug/templates";
import { DEFAULT_PHOTO_SETTINGS } from "@/lib/mug/templates";
import {
  BG_COLOR_OPTIONS,
  FONT_OPTIONS,
  TEXT_COLOR_OPTIONS,
  TRANSPARENT_BACKGROUND,
  filterPaletteByBase,
} from "@/lib/editor/editorPalette";

// Re-exported so existing call sites (MugCanvasPreview, callers that read the
// default font) keep working without a churn-only refactor.
export { FONT_OPTIONS, BG_COLOR_OPTIONS, TEXT_COLOR_OPTIONS as COLOR_OPTIONS };

interface MugEditorProps {
  photos: string[];
  photoSettings: PhotoSettings[];
  template: MugTemplate;
  text: string;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  /**
   * Optional surface colour of the physical mug (body hex). When provided the
   * background and text-colour palettes hide swatches that are visually
   * indistinguishable from the mug, so e.g. a white mug never offers a white
   * background. Pass `null`/`undefined` for "Other" SKUs to keep the full
   * palette.
   */
  productBaseColor?: string | null;
  onPhotosChange: (photos: string[]) => void;
  onPhotoSettingsChange: (settings: PhotoSettings[]) => void;
  onTextChange: (text: string) => void;
  onFontChange: (font: string) => void;
  onTextColorChange: (color: string) => void;
  onBgColorChange: (color: string) => void;
}

export function MugEditor({
  photos,
  photoSettings,
  template,
  text,
  fontFamily,
  textColor,
  backgroundColor,
  productBaseColor,
  onPhotosChange,
  onPhotoSettingsChange,
  onTextChange,
  onFontChange,
  onTextColorChange,
  onBgColorChange,
}: MugEditorProps) {
  const { t } = useLanguageStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const maxPhotos = template.maxPhotos;

  // Filter swatches that are visually identical to the mug body.
  // `transparent` survives the filter and acts as the safe fallback when the
  // current background gets evicted by switching products mid-edit.
  const visibleTextColors = useMemo(
    () => filterPaletteByBase(TEXT_COLOR_OPTIONS, productBaseColor),
    [productBaseColor],
  );
  const visibleBgColors = useMemo(
    () => filterPaletteByBase(BG_COLOR_OPTIONS, productBaseColor),
    [productBaseColor],
  );
  const textPaletteFiltered = visibleTextColors.length < TEXT_COLOR_OPTIONS.length;
  const bgPaletteFiltered = visibleBgColors.length < BG_COLOR_OPTIONS.length;

  // Snap the selected text/background colour to a sensible neighbour when the
  // user picks a SKU that no longer offers it (e.g. switched from white mug
  // to black mug while #000000 was selected for text).
  useEffect(() => {
    if (!visibleTextColors.includes(textColor) && visibleTextColors.length > 0) {
      onTextColorChange(visibleTextColors[0]);
    }
  }, [visibleTextColors, textColor, onTextColorChange]);

  useEffect(() => {
    if (
      backgroundColor !== TRANSPARENT_BACKGROUND &&
      !visibleBgColors.includes(backgroundColor)
    ) {
      onBgColorChange(TRANSPARENT_BACKGROUND);
    }
  }, [visibleBgColors, backgroundColor, onBgColorChange]);

  const handlePhotoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      onPhotosChange([...photos, url]);
      onPhotoSettingsChange([
        ...photoSettings,
        { ...DEFAULT_PHOTO_SETTINGS, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight },
      ]);
    };
    img.src = url;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    const removed = photos[index];
    if (removed?.startsWith("blob:")) URL.revokeObjectURL(removed);
    onPhotosChange(photos.filter((_, i) => i !== index));
    onPhotoSettingsChange(photoSettings.filter((_, i) => i !== index));
  };

  const updateSetting = (index: number, patch: Partial<PhotoSettings>) => {
    const next = photoSettings.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onPhotoSettingsChange(next);
  };

  return (
    <div className="space-y-5">
      {/* Photos */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">{t.mug.uploadPhotos}</h3>
        <div className="flex flex-col gap-2">
          {photos.map((url, i) => {
            const s = photoSettings[i] ?? DEFAULT_PHOTO_SETTINGS;
            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-gray-200 p-2"
              >
                <div className="relative w-14 h-14 flex-shrink-0 rounded-md overflow-hidden bg-gray-100">
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-black/50 text-white px-1 rounded">
                    {t.mug.photoSlot(i + 1)}
                  </span>
                </div>
                <div className="flex flex-col justify-center gap-2 flex-1 min-w-0">
                  {(() => {
                    const slot = template.photoSlots[i];
                    const slotRatio = slot ? slot.width / slot.height : 1;
                    const imgRatio =
                      s.naturalWidth && s.naturalHeight
                        ? s.naturalWidth / s.naturalHeight
                        : null;
                    const canAlignH = imgRatio !== null && imgRatio > slotRatio;
                    const canAlignV = imgRatio !== null && imgRatio <= slotRatio;

                    return (
                      <>
                        <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
                          <button
                            type="button"
                            onClick={() => updateSetting(i, { fitMode: "cover" })}
                            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium transition-colors ${
                              s.fitMode === "cover"
                                ? "bg-gold text-white"
                                : "bg-white text-gray-500"
                            }`}
                          >
                            <Crop className="w-3.5 h-3.5" />
                            {t.mug.fitCover}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSetting(i, { fitMode: "contain" })}
                            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium transition-colors ${
                              s.fitMode === "contain"
                                ? "bg-gold text-white"
                                : "bg-white text-gray-500"
                            }`}
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                            {t.mug.fitContain}
                          </button>
                        </div>
                        {s.fitMode === "cover" && canAlignH && (
                          <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
                            {(["left", "center", "right"] as PhotoAlignment[]).map((align) => {
                              const Icon =
                                align === "left"
                                  ? AlignHorizontalJustifyStart
                                  : align === "right"
                                    ? AlignHorizontalJustifyEnd
                                    : AlignHorizontalJustifyCenter;
                              return (
                                <button
                                  key={align}
                                  type="button"
                                  onClick={() => updateSetting(i, { alignment: align })}
                                  className={`px-3 py-2 transition-colors ${
                                    s.alignment === align
                                      ? "bg-gold text-white"
                                      : "bg-white text-gray-400"
                                  }`}
                                >
                                  <Icon className="w-4 h-4" />
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {s.fitMode === "cover" && canAlignV && (
                          <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
                            {(["top", "center", "bottom"] as PhotoVerticalAlignment[]).map((vAlign) => {
                              const Icon =
                                vAlign === "top"
                                  ? AlignVerticalJustifyStart
                                  : vAlign === "bottom"
                                    ? AlignVerticalJustifyEnd
                                    : AlignVerticalJustifyCenter;
                              return (
                                <button
                                  key={vAlign}
                                  type="button"
                                  onClick={() => updateSetting(i, { verticalAlignment: vAlign })}
                                  className={`px-3 py-2 transition-colors ${
                                    (s.verticalAlignment ?? "center") === vAlign
                                      ? "bg-gold text-white"
                                      : "bg-white text-gray-400"
                                  }`}
                                >
                                  <Icon className="w-4 h-4" />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="w-8 h-8 flex-shrink-0 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}

          {photos.length < maxPhotos && (
            <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-4 cursor-pointer hover:border-gold hover:bg-gold-light/30 transition-colors">
              <ImagePlus className="w-5 h-5 text-gray-400" />
              <span className="text-xs text-gray-500 font-medium">{t.mug.addPhoto}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoAdd}
              />
            </label>
          )}
        </div>
        {maxPhotos > 1 && (
          <p className="text-xs text-gray-400">{t.mug.maxPhotos(maxPhotos)}</p>
        )}
      </div>

      {/* Text */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">{t.mug.addText}</h3>
        <Input
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={t.mug.textPlaceholder}
          maxLength={80}
        />
        <p className="text-xs text-gray-400 text-right">{text.length}/80</p>
      </div>

      {/* Font */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">{t.mug.fontFamily}</h3>
        <div className="flex flex-wrap gap-2">
          {FONT_OPTIONS.map((font) => (
            <button
              key={font.id}
              type="button"
              onClick={() => onFontChange(font.family)}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                fontFamily === font.family
                  ? "border-gold bg-gold-light text-gold-text font-semibold"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
              style={{ fontFamily: `${font.cssVar}, ${font.family}` }}
            >
              {font.label}
            </button>
          ))}
        </div>
      </div>

      {/* Text Color */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">{t.mug.textColor}</h3>
        <div className="flex flex-wrap gap-2">
          {visibleTextColors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onTextColorChange(color)}
              className={`w-9 h-9 rounded-full border-2 transition-all ${
                textColor === color
                  ? "border-gold scale-110 shadow-md"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        {textPaletteFiltered && (
          <p className="text-[11px] text-gray-400">{t.mug.paletteFilteredHint}</p>
        )}
      </div>

      {/* Background Color */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">{t.mug.background}</h3>
        <div className="flex flex-wrap gap-2">
          {visibleBgColors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onBgColorChange(color)}
              className={`w-9 h-9 rounded-full border-2 transition-all ${
                backgroundColor === color
                  ? "border-gold scale-110 shadow-md"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              style={
                color === TRANSPARENT_BACKGROUND
                  ? {
                      backgroundImage:
                        "repeating-conic-gradient(#d1d5db 0% 25%, transparent 0% 50%)",
                      backgroundSize: "8px 8px",
                    }
                  : { backgroundColor: color }
              }
            />
          ))}
        </div>
        {bgPaletteFiltered && (
          <p className="text-[11px] text-gray-400">{t.mug.paletteFilteredHint}</p>
        )}
      </div>
    </div>
  );
}
