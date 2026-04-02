"use client";

import { useState, useCallback } from "react";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { generatePreview } from "@/lib/generatePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X, Plus, Upload, FileText, Trash2, Palette, CircleOff,
} from "lucide-react";
import type { PaperType } from "../_lib/constants";
import { PAPER_OPTIONS } from "../_lib/constants";

/** Prisma `Int` safe upper bound for admin-entered copy counts. */
const MAX_ADMIN_COPIES = 1_000_000;

function parseAdminCopiesInput(s: string): number | null {
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  if (n < 1 || n > MAX_ADMIN_COPIES) return null;
  return n;
}

interface AdminFileEntry {
  file: File;
  copies: number;
  color: "bw" | "color";
  paperType: PaperType;
  pageCount?: number;
  previewUrl?: string;
}

export default function CreateOrderModal({
  t,
  onClose,
  onCreated,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { createAdminOrder } = useOrdersStore();
  const [files, setFiles] = useState<AdminFileEntry[]>([]);
  const [phone, setPhone] = useState("");
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [color, setColor] = useState<"bw" | "color">("bw");
  const [paperType, setPaperType] = useState<PaperType>("A4");
  const [customWidth, setCustomWidth] = useState("");
  const [customHeight, setCustomHeight] = useState("");
  const [copiesStr, setCopiesStr] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");

  const paperLabels: Record<PaperType, string> = {
    A0: t.upload.paperA0, A1: t.upload.paperA1, A2: t.upload.paperA2,
    A3: t.upload.paperA3, A4: t.upload.paperA4, A5: t.upload.paperA5,
    A6: t.upload.paperA6, other: t.upload.paperOther,
  };

  const addFiles = useCallback(async (newFiles: FileList | null) => {
    if (!newFiles) return;
    const entries: AdminFileEntry[] = await Promise.all(
      Array.from(newFiles).map(async (file) => {
        let pageCount: number | undefined;
        if (file.type === "application/pdf") {
          try {
            const { PDFDocument } = await import("pdf-lib");
            const buf = await file.arrayBuffer();
            const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
            pageCount = doc.getPageCount();
          } catch { /* non-countable PDF */ }
        }
        const previewUrl = await generatePreview(file);
        return { file, copies: 1, color: "bw" as const, paperType: "A4" as const, pageCount, previewUrl };
      }),
    );
    setFiles((prev) => [...prev, ...entries]);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const entry = prev[index];
      if (entry?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(entry.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  const handleSubmit = async () => {
    const copies = parseAdminCopiesInput(copiesStr);
    if (files.length === 0 || phone.length < 8 || copies === null) return;
    setSubmitting(true);
    setError("");

    try {
      const fileData = await Promise.all(
        files.map(async (entry) => {
          const res = await fetch("/api/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: entry.file.name,
              contentType: entry.file.type || "application/octet-stream",
            }),
          });
          if (!res.ok) throw new Error("Failed to get upload URL");
          const { uploadUrl, fileKey } = await res.json();

          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": entry.file.type || "application/octet-stream" },
            body: entry.file,
          });
          if (!uploadRes.ok) throw new Error("Failed to upload file");

          const resolvedPaper = paperType === "other" && customWidth.trim() && customHeight.trim()
            ? `other:${customWidth.trim()}x${customHeight.trim()}`
            : paperType;
          return {
            fileName: entry.file.name,
            fileUrl: fileKey,
            copies,
            color,
            paperType: resolvedPaper,
            pageCount: entry.pageCount,
          };
        }),
      );

      const priceVal = priceStr.trim() ? parseInt(priceStr, 10) : null;
      await createAdminOrder({
        phone,
        clientName: clientName.trim() || undefined,
        notes: notes.trim() || undefined,
        price: Number.isFinite(priceVal) && priceVal! >= 0 ? priceVal : undefined,
        files: fileData,
      });

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  };

  const copiesValid = parseAdminCopiesInput(copiesStr) !== null;
  const canSubmit =
    files.length > 0 && phone.length >= 8 && copiesValid && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 text-gray-900 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-6">
          <Plus className="w-5 h-5 text-gold" />
          <h2 className="text-lg font-bold">{t.admin.newOrder}</h2>
        </div>

        <div className="space-y-5">
          {/* File upload */}
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

            {files.length > 0 && (
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 mt-3">
                {files.map((entry, index) => (
                  <div key={index} className="flex items-start gap-3 px-3 py-2.5">
                    {entry.previewUrl ? (
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
                      <p className="text-sm text-gray-900 truncate">{entry.file.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {(entry.file.size / 1024).toFixed(1)} KB
                        {entry.pageCount !== undefined && ` · ${t.admin.pagesCount(entry.pageCount)}`}
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

          {/* Print settings */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">
                {t.upload.colorModeLabel}
              </span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setColor("color")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                    color === "color"
                      ? "bg-gold text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Palette className="w-3.5 h-3.5" />
                  {t.upload.colorOption}
                </button>
                <button
                  type="button"
                  onClick={() => setColor("bw")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                    color === "bw"
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
              <select
                value={paperType}
                onChange={(e) => setPaperType(e.target.value as PaperType)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-base sm:text-sm font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-gold"
              >
                {PAPER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{paperLabels[opt]}</option>
                ))}
              </select>
            </div>

            {paperType === "other" && (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder={t.upload.widthCm}
                  value={customWidth}
                  onChange={(e) => setCustomWidth(e.target.value.replace(/[^0-9.,]/g, ""))}
                  className="flex-1"
                />
                <X className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder={t.upload.heightCm}
                  value={customHeight}
                  onChange={(e) => setCustomHeight(e.target.value.replace(/[^0-9.,]/g, ""))}
                  className="flex-1"
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700 shrink-0">{t.upload.copiesLabel}</span>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder={t.admin.copiesInputPlaceholder}
                value={copiesStr}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "").slice(0, 7);
                  setCopiesStr(next);
                }}
                onBlur={() => {
                  const digits = copiesStr.replace(/\D/g, "");
                  if (digits === "") {
                    setCopiesStr("1");
                    return;
                  }
                  let n = parseInt(digits, 10);
                  if (!Number.isFinite(n) || n < 1) n = 1;
                  if (n > MAX_ADMIN_COPIES) n = MAX_ADMIN_COPIES;
                  setCopiesStr(String(n));
                }}
                className="w-28 text-right tabular-nums"
                aria-invalid={!copiesValid}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t.common.phone} *</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              placeholder={t.admin.clientPhonePlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t.admin.clientName}</label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder={t.admin.clientNamePlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t.admin.price} ({t.admin.currency})
            </label>
            <Input
              value={priceStr}
              onChange={(e) =>
                setPriceStr(e.target.value.replace(/\D/g, "").slice(0, 7))
              }
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={t.admin.pricePlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t.upload.notesLabel}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.upload.notesPlaceholder}
              maxLength={500}
              rows={2}
              className="flex w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-base sm:text-sm shadow-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}

          <Button
            onClick={handleSubmit}
            className="w-full"
            size="lg"
            disabled={!canSubmit}
          >
            {submitting ? t.admin.creatingOrder : t.admin.createOrder}
          </Button>
        </div>
      </div>
    </div>
  );
}
