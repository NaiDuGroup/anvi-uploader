"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Images, Loader2, Upload, X } from "lucide-react";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";
import { uploadStockPhoto } from "./stockApi";

/**
 * Photo of one variant row in «Редактировать позицию»: its own photo (colour
 * shot) or, faded, the item photo it falls back to. Upload a file or pick one
 * of the item's already uploaded photos (main + «Доп. фото»).
 */
export function VariantPhotoCell({
  imageKey,
  fallbackUrl,
  choices,
  disabled,
  onChange,
  onUploadError,
  s,
}: {
  /** The variant's own photo (storage key); null = none. */
  imageKey: string | null;
  /** Item photo shown when the variant has none (public URL). */
  fallbackUrl: string | null;
  /** Item photos (storage keys) offered by «Взять из фото позиции». */
  choices: readonly string[];
  disabled: boolean;
  onChange: (key: string | null) => void;
  onUploadError: () => void;
  s: TranslationDictionary["stock"];
}) {
  const [busy, setBusy] = useState<boolean>(false);
  // Fixed position: the variants table scrolls horizontally and would clip an absolute popover.
  const [pickerAt, setPickerAt] = useState<{ left: number; top: number } | null>(null);
  const pickerOpen: boolean = pickerAt != null;
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const own: string | null = imageKey ? publicAssetUrlFromStorageKey(imageKey) : null;
  const shown: string | null = own ?? fallbackUrl;
  const off: boolean = disabled || busy;

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPickerAt(null);
    };
    const closeOnScroll = (): void => setPickerAt(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [pickerOpen]);

  async function upload(file: File | undefined): Promise<void> {
    if (!file || !file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      onChange(await uploadStockPhoto(file));
    } catch {
      onUploadError();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const iconBtn = "rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40";

  return (
    <div ref={rootRef} className="relative flex items-center gap-1">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white",
          own ? "border-gray-300" : "border-dashed border-gray-200",
        )}
        title={own ? undefined : s.variantPhotoInherited}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-hidden />
        ) : shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- catalog bucket URLs, sized by CSS
          <img src={shown} alt="" className={cn("h-full w-full object-contain", !own && "opacity-40")} loading="lazy" />
        ) : (
          <ImageIcon className="h-4 w-4 text-gray-300" aria-hidden />
        )}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={off}
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <button
        type="button"
        className={iconBtn}
        aria-label={s.variantPhotoUpload}
        title={s.variantPhotoUpload}
        disabled={off}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={iconBtn}
        aria-label={s.variantPhotoFromGallery}
        title={s.variantPhotoFromGallery}
        aria-expanded={pickerOpen}
        disabled={off}
        onClick={(e) => {
          if (pickerAt) return setPickerAt(null);
          const r: DOMRect = e.currentTarget.getBoundingClientRect();
          setPickerAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - 272)), top: r.bottom + 4 });
        }}
      >
        <Images className="h-3.5 w-3.5" />
      </button>
      {imageKey ? (
        <button
          type="button"
          className={cn(iconBtn, "hover:text-red-600")}
          aria-label={s.variantPhotoRemove}
          title={s.variantPhotoRemove}
          disabled={off}
          onClick={() => onChange(null)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {pickerAt ? (
        <div
          role="dialog"
          aria-label={s.variantPhotoFromGallery}
          style={{ left: pickerAt.left, top: pickerAt.top }}
          className="fixed z-[70] w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
        >
          <p className="mb-1.5 text-[11px] font-medium text-gray-600">{s.variantPhotoFromGallery}</p>
          {choices.length === 0 ? (
            <p className="text-[11px] text-gray-400">{s.variantPhotoNoGallery}</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {choices.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "h-14 w-14 overflow-hidden rounded-md border bg-white hover:border-amber-400",
                    key === imageKey ? "border-amber-500 ring-1 ring-amber-400" : "border-gray-200",
                  )}
                  onClick={() => {
                    onChange(key);
                    setPickerAt(null);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- catalog bucket URLs, sized by CSS */}
                  <img src={publicAssetUrlFromStorageKey(key) ?? ""} alt="" className="h-full w-full object-contain" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
