"use client";

import { useEffect, useMemo } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Input } from "@/components/ui/input";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { ImagePlus, Trash2, Maximize2, Crop } from "lucide-react";
import type { PhotoSettings, PenTemplate } from "@/lib/pen/templates";
import { DEFAULT_PHOTO_SETTINGS } from "@/lib/pen/templates";
import {
  BG_COLOR_OPTIONS,
  FONT_OPTIONS,
  TEXT_COLOR_OPTIONS,
  TRANSPARENT_BACKGROUND,
  filterPaletteByBase,
} from "@/lib/editor/editorPalette";

export { FONT_OPTIONS, BG_COLOR_OPTIONS, TEXT_COLOR_OPTIONS as COLOR_OPTIONS };

interface PenEditorProps {
  photos: string[];
  photoSettings: PhotoSettings[];
  template: PenTemplate;
  text: string;
  textSecondary: string;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  productBaseColor?: string | null;
  onPhotosChange: (photos: string[]) => void;
  onPhotoSettingsChange: (settings: PhotoSettings[]) => void;
  onTextChange: (text: string) => void;
  onTextSecondaryChange: (text: string) => void;
  onFontChange: (font: string) => void;
  onTextColorChange: (color: string) => void;
  onBgColorChange: (color: string) => void;
}

export function PenEditor({
  photos,
  photoSettings,
  template,
  text,
  textSecondary,
  fontFamily,
  textColor,
  backgroundColor,
  productBaseColor,
  onPhotosChange,
  onPhotoSettingsChange,
  onTextChange,
  onTextSecondaryChange,
  onFontChange,
  onTextColorChange,
  onBgColorChange,
}: PenEditorProps) {
  const { t } = useLanguageStore();
  const maxPhotos = template.maxPhotos;

  const visibleTextColors = useMemo(
    () => filterPaletteByBase(TEXT_COLOR_OPTIONS, productBaseColor),
    [productBaseColor],
  );
  const visibleBgColors = useMemo(
    () => filterPaletteByBase(BG_COLOR_OPTIONS, productBaseColor),
    [productBaseColor],
  );

  useEffect(() => {
    if (
      !visibleTextColors.includes(textColor) &&
      visibleTextColors.length > 0
    ) {
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

  const handlePhotoAdd = (incoming: File[]) => {
    const remaining = maxPhotos - photos.length;
    const files = incoming.slice(0, remaining);
    if (files.length === 0) return;

    const load = (file: File): Promise<{ url: string; settings: PhotoSettings } | null> =>
      new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () =>
          resolve({
            url,
            settings: {
              ...DEFAULT_PHOTO_SETTINGS,
              fitMode: template.defaultFitMode ?? DEFAULT_PHOTO_SETTINGS.fitMode,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
            },
          });
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });

    void Promise.all(files.map(load)).then((results) => {
      const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);
      if (valid.length === 0) return;
      onPhotosChange([...photos, ...valid.map((r) => r.url)]);
      onPhotoSettingsChange([...photoSettings, ...valid.map((r) => r.settings)]);
    });
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
      {maxPhotos > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">{t.pen.uploadLogos}</h3>
          <div className="flex flex-col gap-2">
            {photos.map((url, i) => {
              const s = photoSettings[i] ?? DEFAULT_PHOTO_SETTINGS;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 p-2"
                >
                  <div className="relative w-14 h-14 flex-shrink-0 rounded-md overflow-hidden bg-gray-100">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col justify-center gap-2 flex-1 min-w-0">
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
                        {t.pen.fitCover}
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
                        {t.pen.fitContain}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            {photos.length < maxPhotos && (
              <FileDropzone
                onFiles={handlePhotoAdd}
                accept="image/*"
                multiple
              >
                <div className="flex items-center gap-2 text-gray-500">
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-sm">{t.pen.addLogo}</span>
                </div>
              </FileDropzone>
            )}
          </div>
        </div>
      )}

      {!template.noText && (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">{t.pen.textLabel}</h3>
            <Input
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder={t.pen.textPlaceholder}
              maxLength={100}
              className="text-base"
            />
          </div>

          {template.textSlotSecondary && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">
                {t.pen.textSecondaryLabel}
              </h3>
              <Input
                value={textSecondary}
                onChange={(e) => onTextSecondaryChange(e.target.value)}
                placeholder={t.pen.textSecondaryPlaceholder}
                maxLength={100}
                className="text-base"
              />
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">{t.pen.fontLabel}</h3>
            <div className="flex flex-wrap gap-2">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.family}
                  type="button"
                  onClick={() => onFontChange(f.family)}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    fontFamily === f.family
                      ? "border-gold bg-gold/5 text-gray-900"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                  style={{ fontFamily: f.family }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">{t.pen.textColorLabel}</h3>
            <div className="flex flex-wrap gap-2">
              {visibleTextColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onTextColorChange(color)}
                  className={`w-10 h-10 rounded-lg border-2 transition-all ${
                    textColor === color
                      ? "border-gold ring-2 ring-gold/30"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">{t.pen.backgroundColorLabel}</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onBgColorChange(TRANSPARENT_BACKGROUND)}
                className={`w-10 h-10 rounded-lg border-2 transition-all bg-[linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%,#ccc),linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%,#ccc)] bg-[length:8px_8px] bg-[position:0_0,4px_4px] ${
                  backgroundColor === TRANSPARENT_BACKGROUND
                    ? "border-gold ring-2 ring-gold/30"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                title="Transparent"
              />
              {visibleBgColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onBgColorChange(color)}
                  className={`w-10 h-10 rounded-lg border-2 transition-all ${
                    backgroundColor === color
                      ? "border-gold ring-2 ring-gold/30"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
