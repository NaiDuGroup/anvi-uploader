"use client";

import { useRef, useState } from "react";
import { DownloadCloud, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { StockItemJson } from "@/lib/stock/unified/adminTypes";
import type { StockItemDescription } from "@/lib/stock/unified/itemDescription";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { stockFetch, uploadStockPhoto } from "./stockApi";

export const EMPTY_DESCRIPTION: StockItemDescription = { ru: "", ro: "", en: "" };

/**
 * Stock item card: client-facing description (ru / ro / en), extra photos and
 * the «pull from the supplier» button for Stamina / ROLY goods.
 */
export function StockItemMediaSection({
  item,
  gallery,
  onGalleryChange,
  description,
  onDescriptionChange,
  onSupplierSynced,
  disabled,
  t,
}: {
  /** Saved item (null while creating — the supplier button needs an id). */
  item: StockItemJson | null;
  gallery: string[];
  onGalleryChange: (keys: string[]) => void;
  description: StockItemDescription;
  onDescriptionChange: (d: StockItemDescription) => void;
  /** The supplier sync saved the item: main photo, gallery and description changed. */
  onSupplierSynced: (item: StockItemJson) => void;
  disabled: boolean;
  t: TranslationDictionary;
}) {
  const m = t.stock.media;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [pulling, setPulling] = useState<boolean>(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const hasSupplierCode: boolean = !!item?.variants.some((v) => !!v.supplierCode);

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const keys: string[] = [];
      for (const f of Array.from(files)) keys.push(await uploadStockPhoto(f));
      onGalleryChange([...gallery, ...keys]);
    } catch {
      setNote({ ok: false, text: t.stock.errorUpload });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const pull = async (): Promise<void> => {
    if (!item) return;
    setPulling(true);
    setNote(null);
    try {
      const res = await stockFetch<{
        result: { photos: number; description: boolean; error?: string };
        item: StockItemJson;
      }>("/api/admin/stock/supplier-media", { method: "POST", body: { itemId: item.id } });
      onSupplierSynced(res.item);
      setNote(
        res.result.error
          ? { ok: false, text: m.pullFailed }
          : { ok: true, text: m.pulled(res.result.photos, res.result.description) },
      );
    } catch {
      setNote({ ok: false, text: m.pullFailed });
    } finally {
      setPulling(false);
    }
  };

  const busy: boolean = disabled || uploading || pulling;

  return (
    <section className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{m.section}</h3>
        {hasSupplierCode && (
          <div className="flex flex-col items-start gap-0.5 sm:items-end">
            <Button type="button" variant="outline" size="sm" onClick={() => void pull()} disabled={busy}>
              {pulling ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
              {m.pullSupplier}
            </Button>
            <span className="text-[11px] text-gray-400">{m.pullSupplierHint}</span>
          </div>
        )}
      </div>
      {note && <p className={cn("text-xs", note.ok ? "text-emerald-700" : "text-red-600")}>{note.text}</p>}

      <div>
        <p className="text-xs font-medium text-gray-700">{m.gallery}</p>
        <p className="mb-2 text-[11px] text-gray-400">{m.galleryHint}</p>
        <div className="flex flex-wrap gap-2">
          {gallery.map((key, i) => (
            <span
              key={key}
              className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- catalog bucket URLs, sized by CSS */}
              <img
                src={publicAssetUrlFromStorageKey(key) ?? ""}
                alt=""
                className="h-full w-full object-contain"
                loading="lazy"
              />
              <button
                type="button"
                aria-label={m.removePhoto}
                title={m.removePhoto}
                disabled={busy}
                onClick={() => onGalleryChange(gallery.filter((_, j) => j !== i))}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 bg-white text-[11px] text-gray-500 hover:border-gray-400"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {m.addPhoto}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void addFiles(e.target.files)}
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-700">{m.descriptionLabel}</p>
        <p className="mb-2 text-[11px] text-gray-400">{m.descriptionHint}</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {(
            [
              ["ru", t.stock.nameRu],
              ["ro", t.stock.nameRo],
              ["en", t.stock.nameEn],
            ] as const
          ).map(([lang, label]) => (
            <label key={lang} className="block text-[11px] font-medium text-gray-500">
              {label}
              <textarea
                value={description[lang]}
                onChange={(e) => onDescriptionChange({ ...description, [lang]: e.target.value })}
                rows={4}
                disabled={busy}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
