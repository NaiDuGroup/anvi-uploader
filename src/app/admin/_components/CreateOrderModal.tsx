"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { generatePreview } from "@/lib/generatePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X, Plus, Upload, FileText, Trash2, Palette, CircleOff, Printer, Coffee,
  Image as ImageIcon, Box, Pencil, Loader2,
} from "lucide-react";
import type { PaperType } from "../_lib/constants";
import { PAPER_OPTIONS } from "../_lib/constants";
import { cn } from "@/lib/utils";
import ClientPicker, { type ClientPickerValue } from "./ClientPicker";
import type { ProductType, MugLayoutData } from "@/lib/validations";

import { TemplateSelector } from "@/app/mug/_components/TemplateSelector";
import { MugEditor } from "@/app/mug/_components/MugEditor";
import { MugCanvasPreview, type MugCanvasPreviewHandle } from "@/app/mug/_components/MugCanvasPreview";
import { MUG_TEMPLATES, getTemplateById, type MugTemplate, type PhotoSettings } from "@/lib/mug/templates";
import { exportCanvasAsBlob, blobToFile } from "@/lib/mug/exportLayout";
import MugFontLoader from "./MugFontLoader";
import dynamic from "next/dynamic";

const Preview3DLoading = () => (
  <div
    className="rounded-xl border border-gray-200 overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100 flex flex-col items-center justify-center gap-3"
    style={{ height: 340 }}
  >
    <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
  </div>
);

const Mug3DPreview = dynamic(
  () => import("@/app/mug/_components/Mug3DPreview").then((m) => m.Mug3DPreview),
  { ssr: false, loading: Preview3DLoading },
);

const Mug3DPreviewFromUrl = dynamic(
  () => import("@/app/mug/_components/Mug3DPreviewFromUrl").then((m) => m.Mug3DPreviewFromUrl),
  { ssr: false, loading: Preview3DLoading },
);

const ADMIN_FILE_PREFIX = "/api/admin/file-by-key?key=";

function resolveR2Key(key: string): string {
  if (key.startsWith("blob:") || key.startsWith("http") || key.startsWith("/")) return key;
  return `${ADMIN_FILE_PREFIX}${encodeURIComponent(key)}`;
}

function extractR2Key(url: string): string | null {
  if (url.startsWith(ADMIN_FILE_PREFIX)) {
    return decodeURIComponent(url.slice(ADMIN_FILE_PREFIX.length));
  }
  return null;
}

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

export interface EditingMugOrder {
  orderId: string;
  mugLayoutData: MugLayoutData;
  phone?: string;
  clientName?: string | null;
  clientId?: string | null;
  studioClient?: { id: string; kind: string; phone: string | null; personName: string | null; companyName: string | null; companyIdno: string | null } | null;
  notes?: string | null;
  price?: number | null;
}

export default function CreateOrderModal({
  t,
  onClose,
  onCreated,
  editingMug,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onClose: () => void;
  onCreated: () => void;
  editingMug?: EditingMugOrder;
}) {
  const { createAdminOrder, updateOrder } = useOrdersStore();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const isEditing = !!editingMug;
  const initTemplate = editingMug
    ? getTemplateById(editingMug.mugLayoutData.templateId) ?? MUG_TEMPLATES[0]
    : MUG_TEMPLATES[0];

  // ---------- Product type ----------
  const [productType, setProductType] = useState<ProductType>(
    editingMug ? "mug" : "paper_print",
  );

  // ---------- Paper print state ----------
  const [files, setFiles] = useState<AdminFileEntry[]>([]);
  const [color, setColor] = useState<"bw" | "color">("bw");
  const [paperType, setPaperType] = useState<PaperType>("A4");
  const [customWidth, setCustomWidth] = useState("");
  const [customHeight, setCustomHeight] = useState("");
  const [copiesStr, setCopiesStr] = useState("1");

  // ---------- Mug mode ----------
  type MugMode = "editor" | "upload";
  const [mugMode, setMugMode] = useState<MugMode>("editor");
  const [customLayoutFile, setCustomLayoutFile] = useState<File | null>(null);
  const [customLayoutUrl, setCustomLayoutUrl] = useState<string | null>(null);

  // ---------- Mug state ----------
  const [mugTemplate, setMugTemplate] = useState<MugTemplate>(initTemplate);
  const [mugPhotos, setMugPhotos] = useState<string[]>(
    () => (editingMug?.mugLayoutData.photoUrls ?? []).map(resolveR2Key),
  );
  const [mugPhotoSettings, setMugPhotoSettings] = useState<PhotoSettings[]>(
    editingMug?.mugLayoutData.photoSettings ?? [],
  );
  const [mugText, setMugText] = useState(editingMug?.mugLayoutData.text ?? "");
  const [mugFont, setMugFont] = useState(editingMug?.mugLayoutData.fontFamily ?? "Roboto");
  const [mugTextColor, setMugTextColor] = useState(editingMug?.mugLayoutData.textColor ?? "#000000");
  const [mugBgColor, setMugBgColor] = useState(editingMug?.mugLayoutData.backgroundColor ?? "transparent");
  const mugCanvasRef = useRef<MugCanvasPreviewHandle>(null);
  const [mugCanvasEl, setMugCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [previewMode, setPreviewMode] = useState<"2d" | "3d">("2d");

  // ---------- Shared state ----------
  const [phone, setPhone] = useState(editingMug?.phone ?? "");
  const [clientName, setClientName] = useState(editingMug?.clientName ?? "");
  const [notes, setNotes] = useState(editingMug?.notes ?? "");
  const [priceStr, setPriceStr] = useState(
    editingMug?.price != null ? String(editingMug.price) : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientPickerValue | null>(
    editingMug?.studioClient ?? null,
  );

  const onClientPicked = (c: ClientPickerValue | null) => {
    setSelectedClient(c);
    if (!c) return;
    if (c.kind === "INDIVIDUAL") {
      if (c.phone) setPhone(c.phone);
      if (c.personName) setClientName(c.personName);
    } else {
      if (c.phone) setPhone(c.phone);
      const nm =
        c.companyName && c.personName
          ? `${c.companyName} — ${c.personName}`
          : c.companyName || c.personName || "";
      setClientName(nm);
    }
  };

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

  const handleCustomLayoutFile = useCallback((file: File | null) => {
    if (customLayoutUrl) URL.revokeObjectURL(customLayoutUrl);
    if (!file) {
      setCustomLayoutFile(null);
      setCustomLayoutUrl(null);
      return;
    }
    setCustomLayoutFile(file);
    setCustomLayoutUrl(URL.createObjectURL(file));
  }, [customLayoutUrl]);

  // ---------- Upload helpers ----------
  async function uploadFile(file: File): Promise<{ fileName: string; fileUrl: string }> {
    const res = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
      }),
    });
    if (!res.ok) throw new Error("Failed to get upload URL");
    const { uploadUrl, fileKey } = await res.json();

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!uploadRes.ok) throw new Error("Failed to upload file");

    return { fileName: file.name, fileUrl: fileKey };
  }

  /** Upload a blob URL, or extract the original R2 key from a resolved admin URL. */
  async function uploadPhotoUrl(url: string): Promise<string> {
    const existingKey = extractR2Key(url);
    if (existingKey) return existingKey;
    if (!url.startsWith("blob:")) return url;
    const resp = await fetch(url);
    const blob = await resp.blob();
    const file = new File([blob], `mug-photo-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
    const { fileUrl } = await uploadFile(file);
    return fileUrl;
  }

  // ---------- Submit ----------
  const handleSubmit = async () => {
    if (phone.length < 8 && !isEditing) return;
    setSubmitting(true);
    setError("");

    try {
      const priceVal = priceStr.trim() ? parseInt(priceStr, 10) : null;
      const priceField = Number.isFinite(priceVal) && priceVal! >= 0 ? priceVal : undefined;

      if (productType === "mug") {
        let mugFile: File;
        let mugLayoutData: MugLayoutData | undefined;

        if (mugMode === "upload") {
          if (!customLayoutFile) throw new Error("No layout file");
          mugFile = customLayoutFile;
        } else {
          const canvas = mugCanvasRef.current?.getCanvas();
          if (!canvas) throw new Error("Canvas not available");

          const photoFileKeys = await Promise.all(mugPhotos.map(uploadPhotoUrl));

          mugLayoutData = {
            templateId: mugTemplate.id,
            text: mugText,
            fontFamily: mugFont,
            textColor: mugTextColor,
            backgroundColor: mugBgColor,
            photoUrls: photoFileKeys,
            photoSettings: mugPhotoSettings,
          };

          const blob = await exportCanvasAsBlob(canvas);
          mugFile = blobToFile(blob, `mug-layout-${Date.now()}.png`);
        }

        const { fileName, fileUrl } = await uploadFile(mugFile);

        if (isEditing && editingMug) {
          const layoutRes = await fetch(`/api/admin/orders/${editingMug.orderId}/mug-layout`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mugLayoutData: mugLayoutData ?? null,
              fileUrl,
              fileName,
            }),
          });
          if (!layoutRes.ok) throw new Error("Failed to update layout");

          const priceVal = priceStr.trim() ? parseInt(priceStr, 10) : null;
          await updateOrder(editingMug.orderId, {
            phone,
            clientName: clientName.trim() || null,
            clientId: selectedClient?.id ?? null,
            notes: notes.trim() || null,
            price: Number.isFinite(priceVal) && priceVal! >= 0 ? priceVal : null,
          });
        } else {
          await createAdminOrder({
            phone,
            clientName: clientName.trim() || undefined,
            clientId: selectedClient?.id,
            notes: notes.trim() || undefined,
            price: priceField,
            productType: "mug",
            mugLayoutData,
            files: [{ fileName, fileUrl, copies: 1, color: "color" }],
          });
        }
      } else {
        const copies = parseAdminCopiesInput(copiesStr);
        if (files.length === 0 || copies === null) return;

        const fileData = await Promise.all(
          files.map(async (entry) => {
            const { fileName, fileUrl } = await uploadFile(entry.file);
            const resolvedPaper = paperType === "other" && customWidth.trim() && customHeight.trim()
              ? `other:${customWidth.trim()}x${customHeight.trim()}`
              : paperType;
            return {
              fileName,
              fileUrl,
              copies,
              color,
              paperType: resolvedPaper,
              pageCount: entry.pageCount,
            };
          }),
        );

        await createAdminOrder({
          phone,
          clientName: clientName.trim() || undefined,
          clientId: selectedClient?.id,
          notes: notes.trim() || undefined,
          price: priceField,
          productType: "paper_print",
          files: fileData,
        });
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  };

  const copiesValid = parseAdminCopiesInput(copiesStr) !== null;
  const canSubmitPaper = files.length > 0 && phone.length >= 8 && copiesValid && !submitting;
  const canSubmitMugEditor = mugPhotos.length > 0 && phone.length >= 8 && !submitting;
  const canSubmitMugUpload = !!customLayoutFile && phone.length >= 8 && !submitting;
  const canSubmitMug = mugMode === "upload" ? canSubmitMugUpload : canSubmitMugEditor;
  const canSubmit = productType === "mug" ? canSubmitMug : canSubmitPaper;
  const registryClientLocked = selectedClient != null;
  const isMug = productType === "mug";

  const sharedFields = (
    <div className="space-y-5">
      <ClientPicker value={selectedClient} onChange={onClientPicked} t={t.admin} />

      {registryClientLocked && (
        <p className="text-xs text-gray-600 leading-snug">
          {t.admin.orderClientFromRegistryLockedHint}
        </p>
      )}

      <div>
        <label className="block text-sm font-medium mb-1.5">{t.common.phone} *</label>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          readOnly={registryClientLocked}
          type="tel"
          placeholder={t.admin.clientPhonePlaceholder}
          className={cn(registryClientLocked && "cursor-not-allowed bg-gray-50 text-gray-800")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">{t.admin.clientName}</label>
        <Input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          readOnly={registryClientLocked}
          placeholder={t.admin.clientNamePlaceholder}
          className={cn(registryClientLocked && "cursor-not-allowed bg-gray-50 text-gray-800")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">
          {t.admin.price} ({t.admin.currency})
        </label>
        <Input
          value={priceStr}
          onChange={(e) => setPriceStr(e.target.value.replace(/\D/g, "").slice(0, 7))}
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
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-5xl p-6 text-gray-900 max-h-[90vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-6">
          <Plus className="w-5 h-5 text-gold" />
          <h2 className="text-lg font-bold">
            {isEditing ? t.approve.editMugLayout : t.admin.newOrder}
          </h2>
        </div>

        {/* Mode cards: Paper Print / Mug Designer / Mug Upload */}
        {!isEditing && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {([
              {
                key: "paper" as const,
                active: productType === "paper_print",
                onClick: () => { setProductType("paper_print"); },
                Icon: Printer,
                label: t.mug.productPaperPrint,
                hint: t.mug.productPaperPrintHint,
              },
              {
                key: "mug_editor" as const,
                active: productType === "mug" && mugMode === "editor",
                onClick: () => { setProductType("mug"); setMugMode("editor"); },
                Icon: Pencil,
                label: `${t.mug.productMug} — ${t.mug.mugModeEditor}`,
                hint: t.mug.mugDesignerHint,
              },
              {
                key: "mug_upload" as const,
                active: productType === "mug" && mugMode === "upload",
                onClick: () => { setProductType("mug"); setMugMode("upload"); },
                Icon: Upload,
                label: `${t.mug.productMug} — ${t.mug.mugModeUpload}`,
                hint: t.mug.mugUploadHint,
              },
            ] as const).map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={card.onClick}
                className={cn(
                  "relative flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 text-center transition-all",
                  card.active
                    ? "border-gold bg-gold-light shadow-md ring-1 ring-gold/20"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm",
                )}
              >
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                  card.active ? "bg-gold text-white" : "bg-gray-100 text-gray-500",
                )}>
                  <card.Icon className="w-5 h-5" />
                </div>
                <span className={cn(
                  "text-sm font-semibold leading-tight",
                  card.active ? "text-gold-text" : "text-gray-700",
                )}>
                  {card.label}
                </span>
                <span className="text-[11px] leading-snug text-gray-400">
                  {card.hint}
                </span>
              </button>
            ))}
          </div>
        )}

        {!isMug ? (
          <div className="space-y-5">
            {/* Paper print: file upload */}
            <div>
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                  dragActive ? "border-gold bg-gold-light" : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 mb-1">{t.upload.dragDrop}</p>
                <label className="cursor-pointer">
                  <span className="text-gold hover:underline font-medium text-sm">{t.upload.browseFiles}</span>
                  <input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
                </label>
              </div>

              {files.length > 0 && (
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 mt-3">
                  {files.map((entry, index) => (
                    <div key={index} className="flex items-start gap-3 px-3 py-2.5">
                      {entry.previewUrl ? (
                        <img src={entry.previewUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-gray-100 border border-gray-200" />
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
                      <button type="button" onClick={() => removeFile(index)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 mt-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Paper print: settings */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{t.upload.colorModeLabel}</span>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  <button type="button" onClick={() => setColor("color")} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${color === "color" ? "bg-gold text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                    <Palette className="w-3.5 h-3.5" />{t.upload.colorOption}
                  </button>
                  <button type="button" onClick={() => setColor("bw")} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${color === "bw" ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                    <CircleOff className="w-3.5 h-3.5" />{t.upload.bwOption}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{t.upload.paperSize}</span>
                <select value={paperType} onChange={(e) => setPaperType(e.target.value as PaperType)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-base sm:text-sm font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-gold">
                  {PAPER_OPTIONS.map((opt) => <option key={opt} value={opt}>{paperLabels[opt]}</option>)}
                </select>
              </div>
              {paperType === "other" && (
                <div className="flex items-center gap-2">
                  <Input type="text" inputMode="decimal" placeholder={t.upload.widthCm} value={customWidth} onChange={(e) => setCustomWidth(e.target.value.replace(/[^0-9.,]/g, ""))} className="flex-1" />
                  <X className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <Input type="text" inputMode="decimal" placeholder={t.upload.heightCm} value={customHeight} onChange={(e) => setCustomHeight(e.target.value.replace(/[^0-9.,]/g, ""))} className="flex-1" />
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-700 shrink-0">{t.upload.copiesLabel}</span>
                <Input
                  type="text" inputMode="numeric" autoComplete="off" placeholder={t.admin.copiesInputPlaceholder}
                  value={copiesStr}
                  onChange={(e) => setCopiesStr(e.target.value.replace(/\D/g, "").slice(0, 7))}
                  onBlur={() => {
                    const digits = copiesStr.replace(/\D/g, "");
                    if (digits === "") { setCopiesStr("1"); return; }
                    let n = parseInt(digits, 10);
                    if (!Number.isFinite(n) || n < 1) n = 1;
                    if (n > MAX_ADMIN_COPIES) n = MAX_ADMIN_COPIES;
                    setCopiesStr(String(n));
                  }}
                  className="w-28 text-right tabular-nums" aria-invalid={!copiesValid}
                />
              </div>
            </div>

            {sharedFields}

            {error && <p className="text-sm text-red-500 text-center">{error}</p>}

            <Button onClick={handleSubmit} className="w-full" size="lg" disabled={!canSubmit}>
              {submitting ? t.admin.creatingOrder : t.admin.createOrder}
            </Button>
          </div>
        ) : (
          /* ---- Mug: two-column layout ---- */
          <>
            {mugMode === "editor" && <MugFontLoader />}

            {/* Editor/Upload mode is now selected via the mode cards above */}

            {mugMode === "upload" ? (
              /* ---- Upload ready layout mode ---- */
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
                <div className="space-y-5 min-w-0">
                  {!customLayoutUrl ? (
                    <label
                      className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-300 rounded-xl p-10 cursor-pointer hover:border-gold hover:bg-gold/5 transition-colors"
                    >
                      <Upload className="w-10 h-10 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">
                        {t.mug.uploadReadyLayout}
                      </span>
                      <span className="text-xs text-gray-400">
                        {t.mug.uploadLayoutHint}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          handleCustomLayoutFile(f);
                        }}
                      />
                    </label>
                  ) : (
                    <div className="relative">
                      <img
                        src={customLayoutUrl}
                        alt="Layout"
                        className="w-full rounded-xl border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleCustomLayoutFile(null)}
                        className="absolute top-2 right-2 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors shadow-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t.mug.removeLayout}
                      </button>
                    </div>
                  )}

                  {sharedFields}

                  {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                  <Button onClick={handleSubmit} className="w-full" size="lg" disabled={!canSubmit}>
                    {submitting ? t.admin.creatingOrder : t.admin.createOrder}
                  </Button>
                </div>

                {/* Right column: 3D preview from uploaded image */}
                {customLayoutUrl && (
                  <div className="lg:sticky lg:top-0 lg:self-start space-y-3">
                    <Mug3DPreviewFromUrl imageUrl={customLayoutUrl} />
                  </div>
                )}
              </div>
            ) : (
              /* ---- Editor mode ---- */
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
                {/* Left column: controls */}
                <div className="space-y-5 min-w-0">
                  <TemplateSelector selected={mugTemplate.id} onSelect={setMugTemplate} />

                  <MugEditor
                    photos={mugPhotos}
                    photoSettings={mugPhotoSettings}
                    template={mugTemplate}
                    text={mugText}
                    fontFamily={mugFont}
                    textColor={mugTextColor}
                    backgroundColor={mugBgColor}
                    onPhotosChange={setMugPhotos}
                    onPhotoSettingsChange={setMugPhotoSettings}
                    onTextChange={setMugText}
                    onFontChange={setMugFont}
                    onTextColorChange={setMugTextColor}
                    onBgColorChange={setMugBgColor}
                  />

                  {sharedFields}

                  {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                  <Button onClick={handleSubmit} className="w-full" size="lg" disabled={!canSubmit}>
                    {submitting
                      ? t.admin.creatingOrder
                      : isEditing
                        ? t.admin.save
                        : t.admin.createOrder}
                  </Button>
                </div>

                {/* Right column: preview (sticky) */}
                <div className="lg:sticky lg:top-0 lg:self-start space-y-3">
                  <div className="relative">
                    <MugCanvasPreview
                      ref={mugCanvasRef}
                      template={mugTemplate}
                      photoUrls={mugPhotos}
                      photoSettings={mugPhotoSettings}
                      text={mugText}
                      fontFamily={mugFont}
                      textColor={mugTextColor}
                      backgroundColor={mugBgColor}
                      onCanvasReady={setMugCanvasEl}
                    />
                    <button
                      type="button"
                      onClick={() => setPreviewMode(previewMode === "2d" ? "3d" : "2d")}
                      className={cn(
                        "absolute top-2 right-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-md backdrop-blur-sm transition-colors",
                        previewMode === "3d"
                          ? "bg-gold text-white hover:bg-gold-dark"
                          : "bg-white/90 text-gray-600 hover:bg-white border border-gray-200",
                      )}
                      title={previewMode === "2d" ? t.approve.preview3d : t.approve.preview2d}
                    >
                      {previewMode === "2d" ? <Box className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                      {previewMode === "2d" ? "3D" : "2D"}
                    </button>
                  </div>

                  {previewMode === "3d" && (
                    <Mug3DPreview canvasElement={mugCanvasEl} />
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
