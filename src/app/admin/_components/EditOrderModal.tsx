"use client";

import { useState, useCallback } from "react";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { generatePreview } from "@/lib/generatePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X, FileText, Upload, Trash2, Palette, CircleOff,
} from "lucide-react";
import type { PaperType } from "../_lib/constants";
import { PAPER_OPTIONS } from "../_lib/constants";

const MAX_ADMIN_COPIES = 1_000_000;

function parseAdminCopiesInput(s: string): number | null {
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  if (n < 1 || n > MAX_ADMIN_COPIES) return null;
  return n;
}

interface ExistingFile {
  id: string;
  fileName: string;
  fileUrl: string;
  copies: number;
  color: string;
  paperType: string | null;
  pageCount: number | null;
}

interface NewFileEntry {
  file: File;
  pageCount?: number;
  previewUrl?: string;
}

interface EditableFileState {
  copies: string;
  color: "bw" | "color";
  paperType: PaperType;
}

export default function EditOrderModal({
  order,
  t,
  onClose,
  onSaved,
}: {
  order: {
    id: string;
    phone: string;
    clientName: string | null;
    notes: string | null;
    price: number | null;
    files: ExistingFile[];
  };
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { updateOrder } = useOrdersStore();
  const [phone, setPhone] = useState(order.phone);
  const [clientName, setClientName] = useState(order.clientName ?? "");
  const [notes, setNotes] = useState(order.notes ?? "");
  const [priceStr, setPriceStr] = useState(
    order.price != null ? String(order.price) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [existingFiles, setExistingFiles] = useState<ExistingFile[]>(order.files);
  const [removedFileIds, setRemovedFileIds] = useState<string[]>([]);
  const [fileEdits, setFileEdits] = useState<Record<string, EditableFileState>>(() => {
    const map: Record<string, EditableFileState> = {};
    for (const f of order.files) {
      map[f.id] = {
        copies: String(f.copies),
        color: f.color === "color" ? "color" : "bw",
        paperType: (PAPER_OPTIONS.includes(f.paperType as PaperType) ? f.paperType : "A4") as PaperType,
      };
    }
    return map;
  });

  const [newFiles, setNewFiles] = useState<NewFileEntry[]>([]);
  const [newFileColor, setNewFileColor] = useState<"bw" | "color">("bw");
  const [newFilePaper, setNewFilePaper] = useState<PaperType>("A4");
  const [newFileCopiesStr, setNewFileCopiesStr] = useState("1");

  const [dragActive, setDragActive] = useState(false);

  const paperLabels: Record<PaperType, string> = {
    A0: t.upload.paperA0, A1: t.upload.paperA1, A2: t.upload.paperA2,
    A3: t.upload.paperA3, A4: t.upload.paperA4, A5: t.upload.paperA5,
    A6: t.upload.paperA6, other: t.upload.paperOther,
  };

  const removeExistingFile = (fileId: string) => {
    setExistingFiles((prev) => prev.filter((f) => f.id !== fileId));
    setRemovedFileIds((prev) => [...prev, fileId]);
    setFileEdits((prev) => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
  };

  const updateFileEdit = (fileId: string, patch: Partial<EditableFileState>) => {
    setFileEdits((prev) => ({
      ...prev,
      [fileId]: { ...prev[fileId], ...patch },
    }));
  };

  const addFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;
    const entries: NewFileEntry[] = await Promise.all(
      Array.from(fileList).map(async (file) => {
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
        return { file, pageCount, previewUrl };
      }),
    );
    setNewFiles((prev) => [...prev, ...entries]);
  }, []);

  const removeNewFile = (index: number) => {
    setNewFiles((prev) => {
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

  const handleSave = async () => {
    const totalFiles = existingFiles.length + newFiles.length;
    if (phone.length < 8 || totalFiles === 0) return;
    setSaving(true);
    setError("");

    try {
      const priceVal = priceStr.trim() ? parseInt(priceStr, 10) : null;

      const updateFiles = existingFiles
        .filter((f) => {
          const ed = fileEdits[f.id];
          if (!ed) return false;
          const origColor = f.color === "color" ? "color" : "bw";
          const origPaper = (PAPER_OPTIONS.includes(f.paperType as PaperType) ? f.paperType : "A4") as string;
          return (
            String(f.copies) !== ed.copies ||
            origColor !== ed.color ||
            origPaper !== ed.paperType
          );
        })
        .map((f) => {
          const ed = fileEdits[f.id];
          const copies = parseAdminCopiesInput(ed.copies);
          return {
            id: f.id,
            copies: copies ?? f.copies,
            color: ed.color as "bw" | "color",
            paperType: ed.paperType,
          };
        });

      let addFilesPayload: Array<{
        fileName: string;
        fileUrl: string;
        copies: number;
        color: "bw" | "color";
        paperType: string;
        pageCount?: number;
      }> | undefined;

      if (newFiles.length > 0) {
        const newCopies = parseAdminCopiesInput(newFileCopiesStr) ?? 1;
        addFilesPayload = await Promise.all(
          newFiles.map(async (entry) => {
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

            return {
              fileName: entry.file.name,
              fileUrl: fileKey,
              copies: newCopies,
              color: newFileColor,
              paperType: newFilePaper,
              pageCount: entry.pageCount,
            };
          }),
        );
      }

      await updateOrder(order.id, {
        phone,
        clientName: clientName.trim() || null,
        notes: notes.trim() || null,
        price: Number.isFinite(priceVal) && priceVal! >= 0 ? priceVal : null,
        ...(removedFileIds.length > 0 && { removeFileIds: removedFileIds }),
        ...(updateFiles.length > 0 && { updateFiles }),
        ...(addFilesPayload && addFilesPayload.length > 0 && { addFiles: addFilesPayload }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const totalFiles = existingFiles.length + newFiles.length;
  const canSave = phone.length >= 8 && totalFiles > 0 && !saving;

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
          <FileText className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-bold">{t.admin.editOrder}</h2>
        </div>

        <div className="space-y-5">
          {/* Existing files */}
          {existingFiles.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1.5">{t.common.files}</label>
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
                {existingFiles.map((f) => {
                  const ed = fileEdits[f.id];
                  return (
                    <div key={f.id} className="px-3 py-2.5 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-gray-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900 truncate">{f.fileName}</p>
                          {f.pageCount != null && (
                            <p className="text-xs text-gray-400">
                              {t.admin.pagesCount(f.pageCount)}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeExistingFile(f.id)}
                          className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {ed && (
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <div className="flex rounded-md border border-gray-200 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => updateFileEdit(f.id, { color: "color" })}
                              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
                                ed.color === "color"
                                  ? "bg-gold text-white"
                                  : "bg-white text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              <Palette className="w-3 h-3" />
                              {t.upload.colorOption}
                            </button>
                            <button
                              type="button"
                              onClick={() => updateFileEdit(f.id, { color: "bw" })}
                              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
                                ed.color === "bw"
                                  ? "bg-gray-800 text-white"
                                  : "bg-white text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              <CircleOff className="w-3 h-3" />
                              {t.upload.bwOption}
                            </button>
                          </div>
                          <select
                            value={ed.paperType}
                            onChange={(e) => updateFileEdit(f.id, { paperType: e.target.value as PaperType })}
                            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-gold"
                          >
                            {PAPER_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{paperLabels[opt]}</option>
                            ))}
                          </select>
                          <Input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={ed.copies}
                            onChange={(e) => {
                              const next = e.target.value.replace(/\D/g, "").slice(0, 7);
                              updateFileEdit(f.id, { copies: next });
                            }}
                            onBlur={() => {
                              const digits = ed.copies.replace(/\D/g, "");
                              if (digits === "") {
                                updateFileEdit(f.id, { copies: "1" });
                                return;
                              }
                              let n = parseInt(digits, 10);
                              if (!Number.isFinite(n) || n < 1) n = 1;
                              if (n > MAX_ADMIN_COPIES) n = MAX_ADMIN_COPIES;
                              updateFileEdit(f.id, { copies: String(n) });
                            }}
                            className="w-16 text-right tabular-nums h-7 text-xs"
                            placeholder={t.upload.copiesLabel}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add new files */}
          <div>
            <label className="block text-sm font-medium mb-1.5">{t.upload.addMore}</label>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
                dragActive
                  ? "border-gold bg-gold-light"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
              <p className="text-xs text-gray-600 mb-0.5">{t.upload.dragDrop}</p>
              <label className="cursor-pointer">
                <span className="text-gold hover:underline font-medium text-xs">
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

            {newFiles.length > 0 && (
              <>
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 mt-3">
                  {newFiles.map((entry, index) => (
                    <div key={index} className="flex items-start gap-3 px-3 py-2.5">
                      {entry.previewUrl ? (
                        <img
                          src={entry.previewUrl}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100 border border-gray-200"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-sm text-gray-900 truncate">{entry.file.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {(entry.file.size / 1024).toFixed(1)} KB
                          {entry.pageCount !== undefined && ` · ${t.admin.pagesCount(entry.pageCount)}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeNewFile(index)}
                        className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 mt-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Print settings for new files */}
                <div className="border border-gray-200 rounded-xl p-3 space-y-3 mt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-700">{t.upload.colorModeLabel}</span>
                    <div className="flex rounded-md border border-gray-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setNewFileColor("color")}
                        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
                          newFileColor === "color"
                            ? "bg-gold text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <Palette className="w-3 h-3" />
                        {t.upload.colorOption}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewFileColor("bw")}
                        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
                          newFileColor === "bw"
                            ? "bg-gray-800 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <CircleOff className="w-3 h-3" />
                        {t.upload.bwOption}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-700">{t.upload.paperSize}</span>
                    <select
                      value={newFilePaper}
                      onChange={(e) => setNewFilePaper(e.target.value as PaperType)}
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-gold"
                    >
                      {PAPER_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{paperLabels[opt]}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-700 shrink-0">{t.upload.copiesLabel}</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={newFileCopiesStr}
                      onChange={(e) => {
                        const next = e.target.value.replace(/\D/g, "").slice(0, 7);
                        setNewFileCopiesStr(next);
                      }}
                      onBlur={() => {
                        const digits = newFileCopiesStr.replace(/\D/g, "");
                        if (digits === "") {
                          setNewFileCopiesStr("1");
                          return;
                        }
                        let n = parseInt(digits, 10);
                        if (!Number.isFinite(n) || n < 1) n = 1;
                        if (n > MAX_ADMIN_COPIES) n = MAX_ADMIN_COPIES;
                        setNewFileCopiesStr(String(n));
                      }}
                      className="w-20 text-right tabular-nums h-7 text-xs"
                    />
                  </div>
                </div>
              </>
            )}
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
              className="flex w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              {t.admin.cancel}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={!canSave}
            >
              {saving ? t.admin.saving : t.admin.save}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
