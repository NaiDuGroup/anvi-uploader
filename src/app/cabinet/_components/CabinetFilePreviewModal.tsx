"use client";

import { useCallback, useEffect } from "react";
import {
  Download as DownloadIcon,
  FileText,
  Image as ImageIcon,
  X,
} from "lucide-react";
import type { TranslationDictionary } from "@/lib/i18n";
import { FileMetaLine } from "@/components/FileMetaLine";
import { CABINET_FILE_META_ENDPOINT } from "@/lib/files/useFileMeta";

/**
 * Full-screen preview of a file on one of the customer's own orders. Always
 * goes through the cabinet-scoped `/api/cabinet/files/:id/(preview|download)`
 * endpoints, never the staff ones. Used by the order detail and the orders list.
 */

export type CabinetFileKind = "image" | "pdf" | "other";

export function cabinetFileKind(fileName: string): CabinetFileKind {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext))
    return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

export function CabinetFilePreviewModal({
  file,
  t,
  onClose,
}: {
  file: { id: string; fileName: string };
  t: TranslationDictionary;
  onClose: () => void;
}) {
  const kind = cabinetFileKind(file.fileName);
  const previewUrl = `/api/cabinet/files/${file.id}/preview`;
  const downloadUrl = `/api/cabinet/files/${file.id}/download`;

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prev;
    };
  }, [handleKey]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.fileName}
      className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm"
    >
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 text-white sm:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
          {kind === "image" ? (
            <ImageIcon className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.fileName}>
            {file.fileName}
          </p>
          <FileMetaLine
            fileId={file.id}
            tone="dark"
            endpoint={CABINET_FILE_META_ENDPOINT}
            className="block truncate text-[11px]"
          />
        </div>
        <a
          href={downloadUrl}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/20"
        >
          <DownloadIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t.cabinet.orderFileDownload}</span>
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.cabinet.orderFileClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div
        className="flex flex-1 cursor-zoom-out items-center justify-center overflow-hidden p-3 sm:p-6"
        onClick={onClose}
      >
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={file.fileName}
            className="max-h-full max-w-full cursor-default rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        ) : kind === "pdf" ? (
          <iframe
            src={previewUrl}
            title={file.fileName}
            className="h-full w-full max-w-5xl cursor-default rounded-lg bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className="max-w-sm cursor-default rounded-2xl bg-white p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <FileText className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-3 text-sm text-gray-700">
              {t.cabinet.orderFilePreviewUnavailable}
            </p>
            <a
              href={downloadUrl}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gold-dark"
            >
              <DownloadIcon className="h-4 w-4" />
              {t.cabinet.orderFileDownload}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
