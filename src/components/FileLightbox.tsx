"use client";

import { useEffect, useCallback, useRef } from "react";
import { X, Download, Printer } from "lucide-react";

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

function isPrintable(fileName: string): boolean {
  return isImage(fileName) || isPdf(fileName);
}

export function FileLightbox({ fileId, fileName, onClose }: FileLightboxProps) {
  const previewUrl = `/api/preview/${fileId}`;
  const downloadUrl = `/api/download/${fileId}`;
  const pdfIframeRef = useRef<HTMLIFrameElement>(null);

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

  const handlePrint = useCallback(() => {
    if (isPdf(fileName)) {
      const iframe = pdfIframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.print();
      }
      return;
    }

    if (isImage(fileName)) {
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${fileName}</title>
            <style>
              @media print {
                @page { margin: 0; }
                body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
                img { max-width: 100%; max-height: 100vh; object-fit: contain; }
              }
              body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff; }
              img { max-width: 100%; max-height: 100vh; object-fit: contain; }
            </style>
          </head>
          <body>
            <img src="${previewUrl}" onload="window.print(); window.close();" />
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  }, [fileName, previewUrl]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className="relative z-10 flex flex-col max-w-[90vw] max-h-[90vh]">
        <div className="flex items-center justify-between bg-gray-900 text-white px-4 py-2 rounded-t-lg">
          <span className="text-sm font-medium truncate mr-4">{fileName}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isPrintable(fileName) && (
              <button
                onClick={handlePrint}
                className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                title="Print"
              >
                <Printer className="w-4 h-4" />
              </button>
            )}
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
              ref={pdfIframeRef}
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

const EXT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pdf: { bg: "bg-red-50", text: "text-red-500", label: "PDF" },
  doc: { bg: "bg-blue-50", text: "text-blue-500", label: "DOC" },
  docx: { bg: "bg-blue-50", text: "text-blue-500", label: "DOC" },
  psd: { bg: "bg-purple-50", text: "text-purple-500", label: "PSD" },
  rar: { bg: "bg-amber-50", text: "text-amber-600", label: "RAR" },
  zip: { bg: "bg-amber-50", text: "text-amber-600", label: "ZIP" },
};

export function FileThumb({
  fileName,
  onClick,
}: {
  fileId: string;
  fileName: string;
  onClick: () => void;
}) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const style = EXT_STYLES[ext];

  if (isImage(fileName)) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-8 h-8 rounded border border-gray-200 flex items-center justify-center flex-shrink-0 hover:ring-2 hover:ring-blue-300 transition-all cursor-pointer bg-emerald-50 text-emerald-500"
      >
        <span className="text-[9px] font-bold">IMG</span>
      </button>
    );
  }

  if (style) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-8 h-8 rounded border border-gray-200 flex items-center justify-center flex-shrink-0 hover:ring-2 hover:ring-blue-300 transition-all cursor-pointer ${style.bg} ${style.text}`}
      >
        <span className="text-[9px] font-bold">{style.label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-8 h-8 rounded border border-gray-200 flex items-center justify-center flex-shrink-0 hover:ring-2 hover:ring-blue-300 transition-all cursor-pointer bg-gray-50 text-gray-400"
    >
      <span className="text-[8px] font-bold uppercase">{ext.slice(0, 3) || "?"}</span>
    </button>
  );
}
