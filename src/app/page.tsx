"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
} from "lucide-react";

const uploadFormSchema = z.object({
  phone: z.string().min(8),
});

type UploadFormData = z.infer<typeof uploadFormSchema>;

interface FileEntry {
  file: File;
  copies: number;
  color: "bw" | "color";
}

interface OrderResult {
  id: string;
  publicToken: string;
}

function PrivacyModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const { t } = useLanguageStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
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

        <p className="text-gray-600 text-sm leading-relaxed mb-6">
          {t.privacy.modalBody}
        </p>

        <div className="flex items-center gap-3 bg-blue-50 rounded-lg p-3 mb-6">
          <Clock className="w-5 h-5 text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-700 font-medium">
            24h
          </p>
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
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UploadFormData>({
    resolver: zodResolver(uploadFormSchema),
  });

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const entries: FileEntry[] = Array.from(newFiles).map((file) => ({
      file,
      copies: 1,
      color: "color" as const,
    }));
    setFiles((prev) => [...prev, ...entries]);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFile = (
    index: number,
    field: keyof Pick<FileEntry, "copies" | "color">,
    value: number | string
  ) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, [field]: value } : f))
    );
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

  const onSubmit = async (data: UploadFormData) => {
    if (files.length === 0) return;
    setSubmitting(true);

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

          return {
            fileName: entry.file.name,
            fileUrl: fileKey,
            copies: entry.copies,
            color: entry.color,
          };
        })
      );

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: data.phone,
          files: fileData,
        }),
      });

      if (!res.ok) throw new Error("Failed to create order");
      const order = await res.json();
      setOrderResult({ id: order.id, publicToken: order.publicToken });
    } catch (err) {
      console.error("Submission error:", err);
    } finally {
      setSubmitting(false);
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
      <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center pt-4 px-4 pb-4 sm:p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center text-gray-900">
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.success.title}</h1>
          <p className="text-gray-600 mb-6">{t.success.message}</p>

          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-500 mb-1">{t.common.orderId}</p>
            <p className="font-mono text-sm">{orderResult.id}</p>
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
            className="block mt-4 text-sm text-blue-600 hover:underline"
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

  return (
    <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center pt-4 px-4 pb-4 sm:p-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 max-w-lg w-full text-gray-900">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.upload.title}</h1>
          <p className="text-gray-600">{t.upload.subtitle}</p>
        </div>

        <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-lg p-3 mb-6">
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-blue-800">{t.privacy.bannerText}</p>
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="text-sm text-blue-600 hover:underline font-medium mt-1"
            >
              {t.privacy.learnMore}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 mb-2">{t.upload.dragDrop}</p>
            <label className="cursor-pointer">
              <span className="text-blue-600 hover:underline font-medium">
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
            <div className="space-y-3">
              {files.map((entry, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {entry.file.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {(entry.file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-1">
                      <button
                        type="button"
                        onClick={() => updateFile(index, "color", "color")}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium flex-1 transition-colors ${
                          entry.color === "color"
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <Palette className="w-3.5 h-3.5" />
                        {t.upload.colorOption}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateFile(index, "color", "bw")}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium flex-1 transition-colors ${
                          entry.color === "bw"
                            ? "bg-gray-800 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <CircleOff className="w-3.5 h-3.5" />
                        {t.upload.bwOption}
                      </button>
                    </div>

                    <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          updateFile(index, "copies", Math.max(1, entry.copies - 1))
                        }
                        className="px-2.5 py-2 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-30"
                        disabled={entry.copies <= 1}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium text-gray-900 tabular-nums">
                        {entry.copies}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateFile(index, "copies", entry.copies + 1)
                        }
                        className="px-2.5 py-2 text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <label className="cursor-pointer flex items-center justify-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium py-2 border border-dashed border-blue-200 rounded-xl hover:bg-blue-50 transition-colors">
                <Plus className="w-4 h-4" /> {t.upload.addMore}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </label>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t.upload.phoneLabel}
            </label>
            <Input
              {...register("phone")}
              type="tel"
              placeholder={t.upload.phonePlaceholder}
            />
            {errors.phone && (
              <p className="text-sm text-red-500 mt-1">
                {t.upload.phoneError}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={files.length === 0 || submitting}
          >
            {submitting ? t.common.submitting : t.upload.submitOrder}
          </Button>
        </form>
      </div>

      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}
