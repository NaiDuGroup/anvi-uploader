"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CircleOff,
  FileText,
  Palette,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  MenuSelect,
  type MenuSelectOption,
} from "@/components/ui/MenuSelect";
import { generatePreview } from "@/lib/generatePreview";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { PaperType } from "../../_lib/constants";
import { PAPER_OPTIONS } from "../../_lib/constants";

export interface AdminPaperFileEntry {
  file: File;
  copies: number;
  color: "bw" | "color";
  paperType: PaperType;
  pageCount?: number;
  previewUrl?: string;
}

export const MAX_ADMIN_COPIES = 1_000_000;

export function parseAdminCopiesInput(s: string): number | null {
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  if (n < 1 || n > MAX_ADMIN_COPIES) return null;
  return n;
}

export interface PaperFormValue {
  files: AdminPaperFileEntry[];
  color: "bw" | "color";
  paperType: PaperType;
  customWidth: string;
  customHeight: string;
  copiesStr: string;
}

export const EMPTY_PAPER_VALUE: PaperFormValue = {
  files: [],
  color: "bw",
  paperType: "A4",
  customWidth: "",
  customHeight: "",
  copiesStr: "1",
};

export interface PaperOrderFormProps {
  value: PaperFormValue;
  onChange: (next: PaperFormValue) => void;
  t: TranslationDictionary;
}

/**
 * Paper-print order form: drag-and-drop file list + color/size/copies settings.
 * Pure controlled component over `PaperFormValue`. Drag-active is purely UI
 * state (no need to lift it).
 */
export function PaperOrderForm({ value, onChange, t }: PaperOrderFormProps) {
  const [dragActive, setDragActive] = useState(false);

  const paperLabels = useMemo(
    (): Record<PaperType, string> => ({
      A0: t.upload.paperA0,
      A1: t.upload.paperA1,
      A2: t.upload.paperA2,
      A3: t.upload.paperA3,
      A4: t.upload.paperA4,
      A5: t.upload.paperA5,
      A6: t.upload.paperA6,
      other: t.upload.paperOther,
    }),
    [t],
  );

  const paperOptions = useMemo(
    (): MenuSelectOption<PaperType>[] =>
      PAPER_OPTIONS.map((opt) => ({
        value: opt,
        label: paperLabels[opt],
      })),
    [paperLabels],
  );

  function patch(p: Partial<PaperFormValue>): void {
    onChange({ ...value, ...p });
  }

  const addFiles = useCallback(
    async (newFiles: FileList | null) => {
      if (!newFiles) return;
      const entries: AdminPaperFileEntry[] = await Promise.all(
        Array.from(newFiles).map(async (file) => {
          let pageCount: number | undefined;
          if (file.type === "application/pdf") {
            try {
              const { PDFDocument } = await import("pdf-lib");
              const buf = await file.arrayBuffer();
              const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
              pageCount = doc.getPageCount();
            } catch {
              /* non-countable PDF */
            }
          }
          const previewUrl = await generatePreview(file);
          return {
            file,
            copies: 1,
            color: "bw" as const,
            paperType: "A4" as const,
            pageCount,
            previewUrl,
          };
        }),
      );
      onChange({ ...value, files: [...value.files, ...entries] });
    },
    [value, onChange],
  );

  function removeFile(index: number): void {
    const entry = value.files[index];
    if (entry?.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(entry.previewUrl);
    }
    onChange({ ...value, files: value.files.filter((_, i) => i !== index) });
  }

  function handleDrag(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }

  function handleDrop(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }

  const copiesValid = parseAdminCopiesInput(value.copiesStr) !== null;

  return (
    <div className="space-y-5">
      <div>
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
            dragActive
              ? "border-gold bg-gold-light"
              : "border-gray-300 hover:border-gray-400"
          }`}
        >
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 mb-1">{t.upload.dragDrop}</p>
          <label className="cursor-pointer">
            <span className="text-gold hover:underline font-medium text-sm">
              {t.upload.browseFiles}
            </span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </label>
        </div>

        {value.files.length > 0 && (
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 mt-3">
            {value.files.map((entry, index) => (
              <div key={index} className="flex items-start gap-3 px-3 py-2.5">
                {entry.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.previewUrl}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-gray-100 border border-gray-200"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-gray-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-sm text-gray-900 truncate">
                    {entry.file.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {(entry.file.size / 1024).toFixed(1)} KB
                    {entry.pageCount !== undefined &&
                      ` · ${t.admin.pagesCount(entry.pageCount)}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 mt-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">
            {t.upload.colorModeLabel}
          </span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => patch({ color: "color" })}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                value.color === "color"
                  ? "bg-gold text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              {t.upload.colorOption}
            </button>
            <button
              type="button"
              onClick={() => patch({ color: "bw" })}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                value.color === "bw"
                  ? "bg-gray-800 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <CircleOff className="w-3.5 h-3.5" />
              {t.upload.bwOption}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">{t.upload.paperSize}</span>
          <MenuSelect<PaperType>
            className="min-w-[6.5rem] max-w-[9rem]"
            value={value.paperType}
            options={paperOptions}
            onChange={(pt) => patch({ paperType: pt })}
            ariaLabel={t.upload.paperSize}
            buttonClassName="h-9 min-h-9 justify-between px-2.5 text-sm font-medium text-gray-700 shadow-none"
          />
        </div>

        {value.paperType === "other" && (
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="decimal"
              placeholder={t.upload.widthCm}
              value={value.customWidth}
              onChange={(e) =>
                patch({
                  customWidth: e.target.value.replace(/[^0-9.,]/g, ""),
                })
              }
              className="flex-1"
            />
            <X className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <Input
              type="text"
              inputMode="decimal"
              placeholder={t.upload.heightCm}
              value={value.customHeight}
              onChange={(e) =>
                patch({
                  customHeight: e.target.value.replace(/[^0-9.,]/g, ""),
                })
              }
              className="flex-1"
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-gray-700 shrink-0">
            {t.upload.copiesLabel}
          </span>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t.admin.copiesInputPlaceholder}
            value={value.copiesStr}
            onChange={(e) =>
              patch({
                copiesStr: e.target.value.replace(/\D/g, "").slice(0, 7),
              })
            }
            onBlur={() => {
              const digits = value.copiesStr.replace(/\D/g, "");
              if (digits === "") {
                patch({ copiesStr: "1" });
                return;
              }
              let n = parseInt(digits, 10);
              if (!Number.isFinite(n) || n < 1) n = 1;
              if (n > MAX_ADMIN_COPIES) n = MAX_ADMIN_COPIES;
              patch({ copiesStr: String(n) });
            }}
            className="w-28 text-right tabular-nums"
            aria-invalid={!copiesValid}
          />
        </div>
      </div>
    </div>
  );
}
