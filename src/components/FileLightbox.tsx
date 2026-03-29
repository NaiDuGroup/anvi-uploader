"use client";

import { useEffect, useCallback } from "react";
import { X, Download } from "lucide-react";

interface FileLightboxProps {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);

function isImage(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
}

function isPdf(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".pdf");
}

export function FileLightbox({ fileId, fileName, onClose }: FileLightboxProps) {
  const previewUrl = `/api/preview/${fileId}`;
  const downloadUrl = `/api/download/${fileId}`;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className="relative z-10 flex flex-col max-w-[90vw] max-h-[90vh]">
        <div className="flex items-center justify-between bg-gray-900 text-white px-4 py-2 rounded-t-lg">
          <span className="text-sm font-medium truncate mr-4">{fileName}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={downloadUrl}
              className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-gray-800 rounded-b-lg overflow-auto flex items-center justify-center min-h-[300px]">
          {isImage(fileName) && (
            <img
              src={previewUrl}
              alt={fileName}
              className="max-w-full max-h-[80vh] object-contain"
            />
          )}
          {isPdf(fileName) && (
            <iframe
              src={previewUrl}
              title={fileName}
              className="w-[80vw] h-[80vh] max-w-[900px] bg-white"
            />
          )}
          {!isImage(fileName) && !isPdf(fileName) && (
            <div className="text-gray-400 text-center p-8">
              <p className="text-sm mb-3">Preview not available</p>
              <a
                href={downloadUrl}
                className="text-sm text-blue-400 hover:text-blue-300 underline"
              >
                Download file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FileThumb({
  fileId,
  fileName,
  onClick,
}: {
  fileId: string;
  fileName: string;
  onClick: () => void;
}) {
  if (isImage(fileName)) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-8 h-8 rounded border border-gray-200 overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-blue-300 transition-all cursor-pointer bg-gray-50"
      >
        <img
          src={`/api/preview/${fileId}`}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </button>
    );
  }

  if (isPdf(fileName)) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-8 h-8 rounded border border-gray-200 flex items-center justify-center flex-shrink-0 hover:ring-2 hover:ring-blue-300 transition-all cursor-pointer bg-red-50 text-red-400"
      >
        <span className="text-[9px] font-bold">PDF</span>
      </button>
    );
  }

  return null;
}
