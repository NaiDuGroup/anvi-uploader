"use client";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);

function isImage(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
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
