"use client";

import { useId, useRef } from "react";
import { artworkQuality, readImageSize, ShopUploadError, uploadArtwork, type ArtworkQuality } from "@/lib/storefront/upload";
import type { ShopFileRef } from "@/lib/storefront/types";
import { UploadIcon } from "./ShopIcons";
import { useShopLang } from "./ShopLangProvider";

export type ArtworkState =
  | { status: "uploading"; name: string; pct: number }
  | { status: "done"; ref: ShopFileRef; px: { width: number; height: number } | null }
  | { status: "error"; name: string; message: string };

const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf,.tif,.tiff,.svg";

/**
 * «Încarcă fișierul tău»: uploads right away (so the cart only keeps the
 * key) and shows a print-quality hint for the chosen print size.
 */
export function ArtworkUpload({
  label,
  value,
  onChange,
  printCm,
  printLabel,
}: {
  label: string;
  value: ArtworkState | null;
  onChange: (next: ArtworkState | null) => void;
  printCm: { widthCm: number; heightCm: number } | null;
  printLabel: string;
}) {
  const { t } = useShopLang();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const token = useRef(0);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const my = ++token.current;
    onChange({ status: "uploading", name: file.name, pct: 0 });
    const pxPromise = readImageSize(file);
    try {
      const ref = await uploadArtwork(file, (pct) => {
        if (token.current === my) onChange({ status: "uploading", name: file.name, pct });
      });
      const px = await pxPromise;
      if (token.current !== my) return;
      const q = artworkQuality(px, printCm);
      onChange({ status: "done", ref: { ...ref, ...(q?.low ? { lowRes: true } : {}) }, px });
    } catch (e) {
      if (token.current !== my) return;
      onChange({
        status: "error",
        name: file.name,
        message: e instanceof ShopUploadError && e.code === "too_big" ? t("uploadTooBig") : t("uploadFailed"),
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const quality: ArtworkQuality | null = value?.status === "done" ? artworkQuality(value.px, printCm) : null;

  return (
    <div className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-(--line2) p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-(--muted)">
          <UploadIcon size={22} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <b>{label}</b>
          {value == null ? <span className="text-sm leading-snug text-(--muted)">{t("uploadOwnText")}</span> : null}
          {value?.status === "uploading" ? (
            <span className="text-sm text-(--muted)" aria-live="polite">
              <span className="block truncate">{value.name}</span>
              {t("uploading", { pct: value.pct })}
            </span>
          ) : null}
          {value?.status === "done" ? (
            <span className="truncate text-sm font-semibold text-(--ok)">✓ {value.ref.fileName}</span>
          ) : null}
          {value?.status === "error" ? (
            <span role="alert" className="text-sm text-(--err)">
              {value.message}
            </span>
          ) : null}
          {quality ? (
            <span className={`text-sm ${quality.low ? "text-(--warn)" : "text-(--muted)"}`}>
              {t(quality.low ? "fileLowRes" : "fileGoodRes", { size: printLabel, dpi: quality.dpi })}
            </span>
          ) : null}
        </div>
      </div>
      {value?.status === "uploading" ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-(--soft)" aria-hidden>
          <div className="h-full bg-(--gold) transition-[width]" style={{ width: `${value.pct}%` }} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={inputId}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-[10px] bg-(--soft) px-4 text-sm font-bold focus-within:outline-2 focus-within:outline-(--ink)"
        >
          {value?.status === "done" ? t("uploadReplace") : t("uploadChoose")}
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        {value && value.status !== "uploading" ? (
          <button
            type="button"
            onClick={() => {
              token.current++;
              onChange(null);
            }}
            className="min-h-11 rounded-[10px] px-3 text-sm font-semibold text-(--muted) underline"
          >
            {t("uploadRemove")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
