"use client";

import { createContext, useContext } from "react";
import { FileThumb } from "@/components/FileThumb";
import { FileMetaLine } from "@/components/FileMetaLine";
import type { WorkshopBoardFile } from "@/lib/workshopBoard/types";

export interface LightboxFile {
  id: string;
  name: string;
}

/** Opens a board file in the shared viewer; provided by `WorkshopBoardClient`. */
export const OpenFileContext = createContext<(file: LightboxFile) => void>(() => {});

// ─── File Thumbnail strip ─────────────────────────────────────────────────────

const THUMBNAILS_SHOWN = 4;

function isExternalUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export function FileThumbnailStrip({ files }: { files: WorkshopBoardFile[] }) {
  const openFile = useContext(OpenFileContext);
  const shown = files.slice(0, THUMBNAILS_SHOWN);
  const firstHidden = files[THUMBNAILS_SHOWN];
  // Link files point outside our storage, so the viewer can't show them: open the link itself.
  const open = (f: WorkshopBoardFile): void => {
    if (isExternalUrl(f.fileUrl)) window.open(f.fileUrl, "_blank", "noopener,noreferrer");
    else openFile({ id: f.id, name: f.fileName });
  };
  const stored = shown.filter((f) => !isExternalUrl(f.fileUrl));
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {shown.map((f) => (
          <div key={f.id} title={f.fileName}>
            <FileThumb fileId={f.id} fileName={f.fileName} onClick={() => open(f)} />
          </div>
        ))}
        {firstHidden && (
          <button
            type="button"
            onClick={() => open(firstHidden)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 text-[10px] font-semibold text-gray-500 transition-colors hover:bg-gray-100"
          >
            +{files.length - THUMBNAILS_SHOWN}
          </button>
        )}
      </div>
      {stored.length > 0 && (
        <ul className="space-y-0.5 text-[10px] leading-tight">
          {stored.map((f) => (
            <li key={f.id} className="flex min-w-0 gap-1">
              {stored.length > 1 && <span className="max-w-[7rem] shrink-0 truncate text-gray-400">{f.fileName}</span>}
              <FileMetaLine fileId={f.id} className="min-w-0 truncate" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
