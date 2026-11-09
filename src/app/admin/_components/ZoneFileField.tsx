"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Upload, X } from "lucide-react";
import { ArtworkSizeCheckLine } from "@/components/ArtworkSizeCheckLine";
import { FileDropzone } from "@/components/upload/FileDropzone";
import type { PrintSizeCm } from "@/lib/files/declaredPrintSize";
import type { TranslationDictionary } from "@/lib/i18n/types";

/** Another DTF / UV row's only file, offered for this zone. */
export interface ZoneFileCandidate {
  slotId: string;
  /** 1-based row number in the order. */
  position: number;
  fileName: string;
  file: File | null;
  fileId: string | null;
}

/**
 * File control inside a DTF / UV zone row: the zone's artwork (name, size line,
 * check against the zone size, ×) or, while it has none, a calm hint with
 * «Загрузить» and «Из загруженных ▾» (another row's file moves here).
 */
export function ZoneFileField({
  fileName,
  file,
  fileId,
  metaText,
  declared,
  metaEndpoint,
  candidates,
  onUpload,
  onPick,
  onClear,
  t,
}: {
  fileName: string | null;
  file: File | null;
  fileId: string | null;
  /** Library / repeat reuse: «12 МБ · 300 dpi · 9×5 см» when known. */
  metaText?: string | null;
  declared: PrintSizeCm | null;
  metaEndpoint?: string;
  candidates: readonly ZoneFileCandidate[];
  onUpload: (file: File) => void;
  onPick: (slotId: string) => void;
  onClear: () => void;
  t: TranslationDictionary;
}) {
  // Texts shared by DTF and UV zone files.
  const zt = t.dtf.editor.zoneFile;
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (ev: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(ev.target as Node)) setOpen(false);
    };
    const esc = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (fileName !== null) {
    return (
      <div className="basis-full pl-1" data-testid="zone-file">
        <div className="flex min-w-0 items-center gap-1.5 text-[12px]">
          <span className="shrink-0 text-gray-500">{zt.label}:</span>
          <span className="min-w-0 truncate text-gray-800" title={fileName}>
            {fileName}
          </span>
          <button
            type="button"
            aria-label={zt.remove}
            title={zt.remove}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
            onClick={onClear}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {file || fileId ? (
          <ArtworkSizeCheckLine file={file} fileId={fileId} declared={declared} metaEndpoint={metaEndpoint} />
        ) : metaText ? (
          <p className="text-[11px] tabular-nums text-gray-500">{metaText}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex basis-full flex-wrap items-center gap-x-2 gap-y-1 pl-1 text-[12px]" data-testid="zone-file-empty">
      <span className="inline-flex items-center gap-1 text-amber-700">
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
        {zt.missing}
      </span>
      <FileDropzone
        onFiles={(files) => {
          const f = files[0];
          if (f) onUpload(f);
        }}
        ariaLabel={zt.upload}
        className="inline-flex cursor-pointer items-center gap-1 rounded font-medium text-gold-text hover:text-gold-dark"
        dragActiveClassName="bg-gold-light/50 outline-2 outline-dashed outline-gold"
      >
        <Upload className="h-3 w-3" aria-hidden />
        <span>{zt.upload}</span>
      </FileDropzone>
      {candidates.length > 0 && (
        <div ref={boxRef} className="relative">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            className="inline-flex items-center gap-0.5 font-medium text-gold-text hover:text-gold-dark"
            onClick={() => setOpen((v) => !v)}
          >
            {zt.fromUploaded}
            <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
          {open && (
            <div
              role="listbox"
              className="absolute left-0 z-30 mt-1 w-72 max-w-[80vw] rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
            >
              <p className="px-2 pb-1 pt-0.5 text-[11px] text-gray-500">{zt.fromUploadedHint}</p>
              {candidates.map((c) => (
                <button
                  key={c.slotId}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-gray-50"
                  onClick={() => {
                    setOpen(false);
                    onPick(c.slotId);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-[12px]">
                    <span className="shrink-0 text-gray-400">{zt.row(c.position)}</span>
                    <span className="min-w-0 truncate text-gray-800" title={c.fileName}>
                      {c.fileName}
                    </span>
                  </span>
                  {c.file || c.fileId ? (
                    <ArtworkSizeCheckLine file={c.file} fileId={c.fileId} metaEndpoint={metaEndpoint} />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
