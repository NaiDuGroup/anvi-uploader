"use client";

import { AlertTriangle } from "lucide-react";
import { checkArtworkSize, type ArtworkSizeIssue } from "@/lib/files/artworkSizeCheck";
import type { PrintSizeCm } from "@/lib/files/declaredPrintSize";
import { formatFileMeta, sizeCm, type FileMetaJson } from "@/lib/files/fileMetaFormat";
import { useFileMeta } from "@/lib/files/useFileMeta";
import { useLocalFileMeta } from "@/lib/files/useLocalFileMeta";
import { useLanguageStore } from "@/stores/useLanguageStore";

/**
 * Under a file in an order form: what the file really is
 * («30×40 см · 300 dpi · 3543×4724 px · 4,1 МБ») and, when the line declares a
 * print size, whether the artwork matches it. A picked file is read in the
 * browser before upload; an attached one comes from the server.
 */
export function ArtworkSizeCheckLine({
  file,
  fileId,
  declared,
  className,
}: {
  file?: File | null;
  fileId?: string | null;
  declared?: PrintSizeCm | null;
  className?: string;
}) {
  const { t, locale } = useLanguageStore();
  const local = useLocalFileMeta(file ?? null);
  const stored = useFileMeta(file ? null : (fileId ?? null));
  const meta: FileMetaJson | null | undefined = file ? local : stored;
  const text = t.fileMeta;

  if (meta === undefined) {
    return file ? <p className={`text-[11px] text-gray-400 ${className ?? ""}`}>{text.check.reading}</p> : null;
  }
  if (!meta || meta.metaStatus === "missing") return null;

  const line = formatFileMeta(meta, text, locale);
  const check = checkArtworkSize(meta, declared);
  const declaredText = declared ? sizeCm(declared.widthCm * 10, declared.heightCm * 10, text, locale) : "";
  const fileText =
    check?.fileWidthCm && check.fileHeightCm
      ? sizeCm(check.fileWidthCm * 10, check.fileHeightCm * 10, text, locale)
      : "";
  const message = (issue: ArtworkSizeIssue): string => {
    if (issue === "larger") return text.check.larger(fileText, declaredText);
    if (issue === "aspect") return text.check.aspect(declaredText);
    if (issue === "lowres") return text.check.lowres(check?.effectiveDpi ?? 0);
    return text.check.nodpi;
  };
  const issues = check?.issues ?? [];

  return (
    <div className={`text-[11px] leading-tight ${className ?? ""}`}>
      {line && <p className="tabular-nums text-gray-500">{line}</p>}
      {issues.map((issue) => (
        <p
          key={issue}
          className={`mt-0.5 flex items-start gap-1 ${issue === "larger" ? "font-semibold text-red-600" : "text-amber-700"}`}
        >
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
          {message(issue)}
        </p>
      ))}
    </div>
  );
}
