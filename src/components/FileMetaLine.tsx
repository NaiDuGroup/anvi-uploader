"use client";

import { formatFileMeta } from "@/lib/files/fileMetaFormat";
import { useFileMeta } from "@/lib/files/useFileMeta";
import { useLanguageStore } from "@/stores/useLanguageStore";

/** «21×29,7 см · 300 dpi · 2480×3508 px · 4,1 МБ» under an uploaded file; nothing while loading. */
export function FileMetaLine({
  fileId,
  className,
  tone = "light",
  hideMissing = false,
}: {
  fileId: string;
  className?: string;
  /** "dark" for dark headers (file viewer). */
  tone?: "light" | "dark";
  /** Where a «file deleted» badge is already shown. */
  hideMissing?: boolean;
}) {
  const { t, locale } = useLanguageStore();
  const meta = useFileMeta(fileId);
  if (!meta || (hideMissing && meta.metaStatus === "missing")) return null;
  const text = formatFileMeta(meta, t.fileMeta, locale);
  if (!text) return null;
  const warn = meta.metaStatus === "missing" || (meta.pixelWidth != null && meta.dpi == null);
  return (
    <span
      className={`${warn ? (tone === "dark" ? "text-amber-300" : "text-amber-700") : tone === "dark" ? "text-gray-300" : "text-gray-500"} tabular-nums ${className ?? ""}`}
      title={text}
    >
      {text}
    </span>
  );
}
