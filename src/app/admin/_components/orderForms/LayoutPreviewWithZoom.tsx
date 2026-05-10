"use client";

import { useEffect, useState } from "react";
import { Maximize2, Trash2, X } from "lucide-react";
import type { TranslationDictionary } from "@/lib/i18n/types";

export interface LayoutPreviewWithZoomProps {
  /** `blob:` URL or remote image URL of the uploaded layout. */
  imageUrl: string;
  /** Removes the file and returns to the upload zone. */
  onRemove: () => void;
  /** Localised label for the "remove" action (e.g. `t.mug.removeLayout`). */
  removeLabel: string;
  /** Translation dictionary — only the `admin.*` zoom strings are read. */
  t: TranslationDictionary;
}

/**
 * Compact uploaded-layout preview that opens a zoomed modal on click.
 *
 * Why: dealers upload tall A5/A4 layouts; rendering them at the column's
 * full width pushed the rest of the form (validation hints, submit button,
 * 3D preview) below the fold. We keep a fixed-height thumbnail in the form
 * and let users tap it to inspect the file at native resolution.
 *
 * The modal closes on backdrop click, on the dedicated close button, and
 * on the `Escape` key. We also lock the page scroll while it's open so the
 * underlying form doesn't move when users use trackpad inertia.
 */
export function LayoutPreviewWithZoom({
  imageUrl,
  onRemove,
  removeLabel,
  t,
}: LayoutPreviewWithZoomProps) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!zoomed) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setZoomed(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [zoomed]);

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label={t.admin.layoutPreviewOpen}
          className="group relative block w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50/40"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="mx-auto block max-h-72 w-auto max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.01]"
          />
          <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/55 via-black/0 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="m-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-gray-800 shadow-sm">
              <Maximize2 className="h-3.5 w-3.5" />
              {t.admin.layoutPreviewZoomHint}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-2 right-2 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-red-600 shadow-sm backdrop-blur-sm transition-colors hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {removeLabel}
        </button>
      </div>

      {zoomed ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setZoomed(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t.admin.layoutPreviewOpen}
            className="relative flex max-h-[min(95vh,1100px)] w-full max-w-[min(95vw,1200px)] items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="max-h-[min(95vh,1100px)] max-w-full rounded-lg object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setZoomed(false)}
              aria-label={t.admin.layoutPreviewClose}
              className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/60 text-white transition-colors hover:bg-black/80"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
