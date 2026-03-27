"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Upload, Plus, Trash2, Copy, CheckCircle } from "lucide-react";

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

export default function UploadPage() {
  const { t } = useLanguageStore();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragActive, setDragActive] = useState(false);

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
            body: JSON.stringify({ fileName: entry.file.name }),
          });
          const { fileUrl } = await res.json();
          return {
            fileName: entry.file.name,
            fileUrl,
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">{t.success.title}</h1>
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 max-w-lg w-full">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{t.upload.title}</h1>
          <p className="text-gray-600">{t.upload.subtitle}</p>
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
                  className="border rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {entry.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(entry.file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={entry.color}
                      onChange={(e) =>
                        updateFile(index, "color", e.target.value)
                      }
                      className="text-sm border rounded px-2 py-1"
                    >
                      <option value="color">{t.upload.colorOption}</option>
                      <option value="bw">{t.upload.bwOption}</option>
                    </select>

                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">x</span>
                      <Input
                        type="number"
                        min={1}
                        value={entry.copies}
                        onChange={(e) =>
                          updateFile(
                            index,
                            "copies",
                            parseInt(e.target.value) || 1
                          )
                        }
                        className="w-16 h-8 text-sm"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFile(index)}
                      className="h-8 w-8 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <label className="cursor-pointer flex items-center gap-2 text-sm text-blue-600 hover:underline">
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
    </div>
  );
}
