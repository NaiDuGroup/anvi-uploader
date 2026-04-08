"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  Upload,
  Plus,
  Minus,
  Trash2,
  Copy,
  CheckCircle,
  ShieldCheck,
  Clock,
  X,
  Info,
  Palette,
  CircleOff,
  ChevronRight,
  ChevronLeft,
  FileText,
  Printer,
  Coffee,
} from "lucide-react";

type PaperType = "A0" | "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "other";

import { generatePreview } from "@/lib/generatePreview";

interface FileEntry {
  file: File;
  copies: number;
  color: "bw" | "color";
  paperType: PaperType;
  customWidth: string;
  customHeight: string;
  pageCount?: number;
  previewUrl?: string;
}

interface OrderResult {
  id: string;
  orderNumber: number;
  publicToken: string;
}

const PAPER_OPTIONS: PaperType[] = ["A6", "A5", "A4", "A3", "A2", "A1", "A0", "other"];

const COPY_QUICK_AMOUNTS = [10, 20, 50, 100] as const;

function CopyQuickPresets({
  value,
  onSelect,
  ariaLabel,
}: {
  value: number;
  onSelect: (n: number) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5" role="group" aria-label={ariaLabel}>
      {COPY_QUICK_AMOUNTS.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onSelect(n)}
          className={`h-8 min-w-[2.25rem] rounded-md border px-1.5 text-xs font-semibold tabular-nums transition-colors ${
            value === n
              ? "border-gold bg-gold-light text-gold-text"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="mb-5">
      <div className="grid grid-cols-3">
        {labels.map((label, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === current;
          const isCompleted = stepNum < current;
          const done = isActive || isCompleted;
          return (
            <div key={i} className="flex flex-col items-center gap-1 relative">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors z-10 ${
                  done ? "bg-gold text-white" : "bg-gray-200 text-gray-500"
                }`}
              >
                {isCompleted ? <CheckCircle className="w-3 h-3" /> : stepNum}
              </div>
              <span className={`text-[11px] font-medium ${done ? "text-gold" : "text-gray-400"}`}>
                {label}
              </span>
              {i < labels.length - 1 && (
                <div
                  className={`absolute top-3 left-[calc(50%+12px)] right-0 h-0.5 -translate-y-1/2 ${
                    stepNum < current ? "bg-gold" : "bg-gray-200"
                  }`}
                />
              )}
              {i > 0 && (
                <div
                  className={`absolute top-3 left-0 right-[calc(50%+12px)] h-0.5 -translate-y-1/2 ${
                    i < current ? "bg-gold" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PaperSizeSelect({
  value,
  onChange,
  labels,
}: {
  value: PaperType;
  onChange: (v: PaperType) => void;
  labels: Record<PaperType, string>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PaperType)}
      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-base font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-gold"
    >
      {PAPER_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {labels[opt]}
        </option>
      ))}
    </select>
  );
}

function PrivacyModal({ onClose }: { onClose: () => void }) {
  const { t } = useLanguageStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-gray-900">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="text-center mb-4">
          <ShieldCheck className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900">{t.privacy.modalTitle}</h2>
        </div>
        <p className="text-gray-600 text-sm leading-relaxed mb-6">{t.privacy.modalBody}</p>
        <div className="flex items-center gap-3 bg-gold-light rounded-lg p-3 mb-6">
          <Clock className="w-5 h-5 text-gold flex-shrink-0" />
          <p className="text-sm text-gold-text font-medium">24h</p>
        </div>
        <Button onClick={onClose} className="w-full" size="lg">
          {t.privacy.modalClose}
        </Button>
      </div>
    </div>
  );
}

export default function UploadPage() {
  const { t } = useLanguageStore();
  const [step, setStep] = useState(1);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const scrollToTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    scrollToTop();
    setTimeout(scrollToTop, 100);
  }, [step]);

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [settingsMode, setSettingsMode] = useState<"same" | "perFile">("same");
  const [sharedColor, setSharedColor] = useState<"bw" | "color">("bw");
  const [sharedPaper, setSharedPaper] = useState<PaperType>("A4");
  const [sharedCustomWidth, setSharedCustomWidth] = useState("");
  const [sharedCustomHeight, setSharedCustomHeight] = useState("");
  const [sharedCopies, setSharedCopies] = useState(1);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState(false);
  const [notes, setNotes] = useState("");
  const [gdprAccepted, setGdprAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const paperLabels: Record<PaperType, string> = {
    A0: t.upload.paperA0,
    A1: t.upload.paperA1,
    A2: t.upload.paperA2,
    A3: t.upload.paperA3,
    A4: t.upload.paperA4,
    A5: t.upload.paperA5,
    A6: t.upload.paperA6,
    other: t.upload.paperOther,
  };

  const addFiles = useCallback(async (newFiles: FileList | null) => {
    if (!newFiles) return;
    const entries: FileEntry[] = await Promise.all(
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
        return {
          file,
          copies: 1,
          color: "bw" as const,
          paperType: "A4" as const,
          customWidth: "",
          customHeight: "",
          pageCount,
          previewUrl,
        };
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

  const updateFile = (
    index: number,
    field: keyof Pick<FileEntry, "copies" | "color" | "paperType" | "customWidth" | "customHeight">,
    value: number | string,
  ) => {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  const resolveOtherPaper = (w: string, h: string): string => {
    const wn = w.trim();
    const hn = h.trim();
    if (wn && hn) return `other:${wn}x${hn}`;
    return "other";
  };

  const getResolvedFiles = (): FileEntry[] => {
    if (settingsMode === "same") {
      const paper = sharedPaper === "other"
        ? resolveOtherPaper(sharedCustomWidth, sharedCustomHeight)
        : sharedPaper;
      return files.map((f) => ({
        ...f,
        color: sharedColor,
        paperType: paper as PaperType,
        copies: sharedCopies,
      }));
    }
    return files.map((f) => ({
      ...f,
      paperType: (f.paperType === "other"
        ? resolveOtherPaper(f.customWidth, f.customHeight)
        : f.paperType) as PaperType,
    }));
  };

  const goToStep2 = () => {
    if (files.length > 0) setStep(2);
  };

  const goToStep3 = () => {
    if (phone.length < 8) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!gdprAccepted || files.length === 0) return;
    setSubmitting(true);

    try {
      const resolvedFiles = getResolvedFiles();
      const total = resolvedFiles.length;
      setUploadProgress({ current: 0, total });

      const fileData: {
        fileName: string;
        fileUrl: string;
        copies: number;
        color: string;
        paperType: string;
        pageCount?: number;
      }[] = [];

      for (let i = 0; i < resolvedFiles.length; i++) {
        const entry = resolvedFiles[i];
        setUploadProgress({ current: i + 1, total });

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

        fileData.push({
          fileName: entry.file.name,
          fileUrl: fileKey,
          copies: entry.copies,
          color: entry.color,
          paperType: entry.paperType,
          pageCount: entry.pageCount,
        });
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          notes: notes.trim() || undefined,
          files: fileData,
        }),
      });

      if (!res.ok) throw new Error("Failed to create order");
      const order = await res.json();
      setOrderResult({
        id: order.id,
        orderNumber: order.orderNumber,
        publicToken: order.publicToken,
      });
    } catch (err) {
      console.error("Submission error:", err);
    } finally {
      setSubmitting(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const copyTrackingLink = () => {
    if (!orderResult) return;
    const link = `${window.location.origin}/track/${orderResult.publicToken}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (orderResult) {
    return (
      <div
        className="min-h-dvh bg-gray-50 flex items-center justify-center px-4 py-4"
        data-testid="upload-success"
      >
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center text-gray-900">
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.success.title}</h1>
          <p className="text-gray-600 mb-6">{t.success.message}</p>
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-500 mb-1">{t.common.orderId}</p>
            <p className="text-2xl font-bold text-gray-900">
              #{String(orderResult.orderNumber).padStart(4, "0")}
            </p>
          </div>
          <Button onClick={copyTrackingLink} className="w-full" size="lg">
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4" /> {t.common.copied}
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" /> {t.success.copyLink}
              </>
            )}
          </Button>
          <a
            href={`/track/${orderResult.publicToken}`}
            className="block mt-4 text-sm text-gold hover:underline"
            data-testid="upload-track-link"
          >
            {t.success.viewStatus}
          </a>
          <div className="mt-6 flex items-center gap-2 justify-center text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            <span>{t.privacy.successReminder}</span>
          </div>
        </div>
      </div>
    );
  }

  const stepLabels = [t.upload.stepFiles, t.upload.stepDetails, t.upload.stepConfirm];

  return (
    <div className="min-h-dvh bg-gray-50 flex items-center justify-center px-4 py-4">
      <div ref={cardRef} className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 max-w-lg w-full text-gray-900">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-gray-900">{t.upload.title}</h1>
          <LanguageSwitcher />
        </div>
        {step === 2 && (
          <p className="text-sm text-gray-500 mb-3">{t.upload.subtitle}</p>
        )}

        {step === 2 && <StepIndicator current={step} labels={stepLabels} />}

        {/* Step 1: Files & Settings */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Product type picker */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-gold bg-gold-light p-4 cursor-default">
                <Printer className="w-7 h-7 text-gold" />
                <span className="text-sm font-semibold text-gold-text">{t.mug.productPaperPrint}</span>
              </div>
              <a
                href="/mug"
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-gray-200 p-4 hover:border-gold hover:bg-gold-light/30 transition-colors"
              >
                <Coffee className="w-7 h-7 text-gray-400" />
                <span className="text-sm font-semibold text-gray-600">{t.mug.productMug}</span>
              </a>
            </div>

            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl text-center transition-colors ${
                dragActive
                  ? "border-gold bg-gold-light"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              {/* Desktop: full drop zone */}
              <div className="hidden sm:block p-8">
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600 mb-2">{t.upload.dragDrop}</p>
                <label className="cursor-pointer">
                  <span className="text-gold hover:underline font-medium">
                    {t.upload.browseFiles}
                  </span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    data-testid="upload-file-input"
                    onChange={(e) => addFiles(e.target.files)}
                  />
                </label>
              </div>
              {/* Mobile: compact tap area */}
              <label className="sm:hidden flex items-center justify-center gap-2 px-4 py-3 cursor-pointer">
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">{t.upload.browseFiles}</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  data-testid="upload-file-input-mobile"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </label>
            </div>

            {files.length > 0 && (
              <>
                {/* File summary + add more */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    {files.length} {files.length === 1 ? t.common.file : t.common.files}
                  </p>
                  <label className="cursor-pointer flex items-center gap-1.5 text-sm text-gold hover:text-gold-text font-medium">
                    <Plus className="w-4 h-4" /> {t.upload.addMore}
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => addFiles(e.target.files)}
                    />
                  </label>
                </div>

                {/* Compact file list with remove buttons */}
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {files.map((entry, index) => (
                    <div key={index} className="flex items-center gap-3 px-3 py-2">
                      {entry.previewUrl ? (
                        <img
                          src={entry.previewUrl}
                          alt=""
                          className="w-10 h-10 rounded-md object-cover flex-shrink-0 bg-gray-100"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 truncate">{entry.file.name}</p>
                        <p className="text-xs text-gray-400">
                          {(entry.file.size / 1024).toFixed(1)} KB
                          {entry.pageCount !== undefined && ` · ${entry.pageCount} p.`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Settings mode toggle */}
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSettingsMode("same")}
                    className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
                      settingsMode === "same"
                        ? "bg-gold text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {t.upload.sameSettings}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsMode("perFile")}
                    className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
                      settingsMode === "perFile"
                        ? "bg-gold text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {t.upload.differentSettings}
                  </button>
                </div>

                {/* "Same" mode: single set of controls */}
                {settingsMode === "same" && (
                  <div className="border border-gray-200 rounded-xl p-4 space-y-4">
                    {/* Color */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{t.upload.colorModeLabel}</span>
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setSharedColor("color")}
                          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                            sharedColor === "color"
                              ? "bg-gold text-white"
                              : "bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          <Palette className="w-3.5 h-3.5" />
                          {t.upload.colorOption}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSharedColor("bw")}
                          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                            sharedColor === "bw"
                              ? "bg-gray-800 text-white"
                              : "bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          <CircleOff className="w-3.5 h-3.5" />
                          {t.upload.bwOption}
                        </button>
                      </div>
                    </div>

                    {/* Paper size */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{t.upload.paperSize}</span>
                      <PaperSizeSelect value={sharedPaper} onChange={setSharedPaper} labels={paperLabels} />
                    </div>

                    {sharedPaper === "other" && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder={t.upload.widthCm}
                          value={sharedCustomWidth}
                          onChange={(e) => setSharedCustomWidth(e.target.value.replace(/[^0-9.,]/g, ""))}
                          className="flex-1"
                        />
                        <X className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder={t.upload.heightCm}
                          value={sharedCustomHeight}
                          onChange={(e) => setSharedCustomHeight(e.target.value.replace(/[^0-9.,]/g, ""))}
                          className="flex-1"
                        />
                      </div>
                    )}

                    {/* Copies */}
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm text-gray-700 pt-2">{t.upload.copiesLabel}</span>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setSharedCopies(Math.max(1, sharedCopies - 1))}
                            className="px-3 py-2 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-30"
                            disabled={sharedCopies <= 1}
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-10 text-center text-sm font-medium text-gray-900 tabular-nums">
                            {sharedCopies}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSharedCopies(sharedCopies + 1)}
                            className="px-3 py-2 text-gray-500 hover:bg-gray-50 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <CopyQuickPresets
                          value={sharedCopies}
                          onSelect={setSharedCopies}
                          ariaLabel={t.upload.copiesQuickPresetsAria}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* "Per file" mode: individual controls per file */}
                {settingsMode === "perFile" && (
                  <div className="space-y-3">
                    {files.map((entry, index) => (
                      <div
                        key={index}
                        className="border border-gray-200 rounded-xl p-4 space-y-3"
                      >
                        <div className="flex items-center gap-3">
                          {entry.previewUrl ? (
                            <img
                              src={entry.previewUrl}
                              alt=""
                              className="w-10 h-10 rounded-md object-cover flex-shrink-0 bg-gray-100"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <p className="text-sm font-medium text-gray-900 truncate min-w-0">
                            {entry.file.name}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => updateFile(index, "color", "color")}
                              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                entry.color === "color"
                                  ? "bg-gold text-white"
                                  : "bg-white text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              <Palette className="w-3 h-3" />
                              {t.upload.colorOption}
                            </button>
                            <button
                              type="button"
                              onClick={() => updateFile(index, "color", "bw")}
                              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                entry.color === "bw"
                                  ? "bg-gray-800 text-white"
                                  : "bg-white text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              <CircleOff className="w-3 h-3" />
                              {t.upload.bwOption}
                            </button>
                          </div>

                          <PaperSizeSelect
                            value={entry.paperType}
                            onChange={(v) => updateFile(index, "paperType", v)}
                            labels={paperLabels}
                          />
                        </div>

                        {entry.paperType === "other" && (
                          <div className="flex items-center gap-2">
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder={t.upload.widthCm}
                              value={entry.customWidth}
                              onChange={(e) => updateFile(index, "customWidth", e.target.value.replace(/[^0-9.,]/g, ""))}
                              className="flex-1"
                            />
                            <X className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder={t.upload.heightCm}
                              value={entry.customHeight}
                              onChange={(e) => updateFile(index, "customHeight", e.target.value.replace(/[^0-9.,]/g, ""))}
                              className="flex-1"
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex flex-col items-end gap-1.5 ml-auto w-full sm:w-auto">
                            <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
                              <button
                                type="button"
                                onClick={() => updateFile(index, "copies", Math.max(1, entry.copies - 1))}
                                className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-30"
                                disabled={entry.copies <= 1}
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-7 text-center text-sm font-medium text-gray-900 tabular-nums">
                                {entry.copies}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateFile(index, "copies", entry.copies + 1)}
                                className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <CopyQuickPresets
                              value={entry.copies}
                              onSelect={(n) => updateFile(index, "copies", n)}
                              ariaLabel={t.upload.copiesQuickPresetsAria}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
              <ShieldCheck className="w-5 h-5 text-green-500 flex-shrink-0" />
              <p className="text-xs text-gray-500 leading-relaxed">
                {t.upload.dataNotice}
              </p>
            </div>

            <Button
              onClick={goToStep2}
              className="w-full"
              size="lg"
              disabled={files.length === 0}
              data-testid="upload-step1-next"
            >
              {t.upload.next} <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Step 2: Contact & Notes */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t.upload.phoneLabel}</label>
              <Input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (phoneError) setPhoneError(false);
                }}
                type="tel"
                placeholder={t.upload.phonePlaceholder}
                data-testid="upload-phone"
              />
              {phoneError && (
                <p className="text-sm text-red-500 mt-1">{t.upload.phoneError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                <FileText className="w-4 h-4 inline-block mr-1 -mt-0.5" />
                {t.upload.notesLabel}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.upload.notesPlaceholder}
                maxLength={500}
                rows={3}
                className="flex w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{notes.length}/500</p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1" size="lg">
                <ChevronLeft className="w-4 h-4" /> {t.upload.back}
              </Button>
              <Button onClick={goToStep3} className="flex-1" size="lg" data-testid="upload-step2-next">
                {t.upload.next} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm & Submit */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="text-center">
              <img src="/logo.png" alt="ANVI" className="w-16 h-16 rounded-full mx-auto mb-2" />
              <h2 className="text-lg font-bold text-gray-900">{t.upload.gdprTitle}</h2>
            </div>

            <p className="text-sm text-gray-600 text-center leading-relaxed">
              {t.upload.gdprBody}
            </p>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={gdprAccepted}
                onChange={(e) => setGdprAccepted(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-gray-300 cursor-pointer accent-gold"
                data-testid="upload-gdpr-checkbox"
              />
              <span className="text-sm text-gray-700 leading-snug">
                {t.upload.gdprConsent}
              </span>
            </label>

            {submitting && uploadProgress.total > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {t.upload.uploadingFile} {uploadProgress.current}/{uploadProgress.total}
                  </span>
                  <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold rounded-full transition-all duration-500"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1" size="lg" disabled={submitting}>
                <ChevronLeft className="w-4 h-4" /> {t.upload.back}
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1"
                size="lg"
                disabled={!gdprAccepted || submitting}
                data-testid="upload-submit"
              >
                {submitting
                  ? `${t.common.submitting} (${uploadProgress.current}/${uploadProgress.total})`
                  : t.upload.gdprSubmit}
              </Button>
            </div>
          </div>
        )}
      </div>

      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}
