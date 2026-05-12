"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import CabinetHeaderBadge from "@/components/CabinetHeaderBadge";
import CabinetLoginCta from "@/components/CabinetLoginCta";
import { useCabinetSession } from "@/hooks/useCabinetSession";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  CheckCircle,
  ShieldCheck,
  Clock,
  ChevronRight,
  ChevronLeft,
  Copy,
  FileText,
  ArrowLeft,
} from "lucide-react";
import {
  buildNotebookTemplates,
  type NotebookTemplate,
  type PhotoSettings,
} from "@/lib/notebook/templates";
import { NOTEBOOK_DEFAULT_PRINT, cmToPx } from "@/lib/printDimensions";
import { NotebookTemplateSelector } from "./_components/NotebookTemplateSelector";
import { NotebookEditor, FONT_OPTIONS } from "./_components/NotebookEditor";
import {
  NotebookCanvasPreview,
  type NotebookCanvasPreviewHandle,
} from "./_components/NotebookCanvasPreview";
import { exportCanvasAsBlob, blobToFile } from "@/lib/mug/exportLayout";
import {
  NotebookProductPicker,
  colorsFromNotebookProduct,
  type NotebookProductOption,
  type NotebookProductSelection,
} from "./_components/NotebookProductPicker";
import dynamic from "next/dynamic";

const Notebook3DPreview = dynamic(
  () => import("./_components/Notebook3DPreview").then((m) => m.Notebook3DPreview),
  { ssr: false },
);

interface OrderResult {
  id: string;
  orderNumber: number;
  publicToken: string;
}

function NotebookStepProgress({
  current,
  labels,
  formatLine,
}: {
  current: number;
  labels: string[];
  formatLine: (step: number, total: number, stepName: string) => string;
}) {
  const total = labels.length;
  const stepName = labels[current - 1] ?? "";
  const pct = total > 0 ? (current / total) * 100 : 0;
  const line = formatLine(current, total, stepName);

  return (
    <div className="mb-4 space-y-2">
      <div
        className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={line}
      >
        <div
          className="h-full rounded-full bg-gold transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] sm:text-xs text-gray-600 text-center leading-snug px-1" aria-live="polite">
        {line}
      </p>
    </div>
  );
}

export default function NotebookPageClient({
  showPublicCabinetLoginCta,
}: {
  showPublicCabinetLoginCta: boolean;
}) {
  const { t } = useLanguageStore();
  const [step, setStep] = useState(1);

  const [selectedTemplate, setSelectedTemplate] = useState<NotebookTemplate | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoSettings, setPhotoSettings] = useState<PhotoSettings[]>([]);
  const [text, setText] = useState("");
  const [fontFamily, setFontFamily] = useState<string>(FONT_OPTIONS[0].family);
  const [textColor, setTextColor] = useState("#000000");
  const [backgroundColor, setBackgroundColor] = useState("transparent");

  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState(false);
  const [notes, setNotes] = useState("");
  const [gdprAccepted, setGdprAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [copied, setCopied] = useState(false);
  // See `src/app/page.tsx` for rationale: pre-fill + lock the phone field
  // when a customer is signed in. The server source-of-truth is the session.
  const cabinetSession = useCabinetSession();
  const cabinetPhone = cabinetSession.session?.studioCustomer?.phone ?? null;
  useEffect(() => {
    if (cabinetSession.status === "authenticated" && cabinetPhone) {
      setPhone(cabinetPhone);
      setPhoneError(false);
    }
  }, [cabinetSession.status, cabinetPhone]);

  const [notebookProductItems, setNotebookProductItems] = useState<NotebookProductOption[]>([]);
  const [notebookSelection, setNotebookSelection] = useState<NotebookProductSelection | null>(null);

  const canvasPreviewRef = useRef<NotebookCanvasPreviewHandle>(null);
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notebook-products")
      .then((res) => res.json())
      .then((data: { items?: NotebookProductOption[] }) => {
        if (!cancelled) setNotebookProductItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setNotebookProductItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (notebookProductItems.length === 0) {
      setNotebookSelection({ type: "other" });
      return;
    }
    setNotebookSelection((prev) => {
      if (!prev || prev.type === "other") {
        return { type: "catalog", productId: notebookProductItems[0]!.id };
      }
      const still = notebookProductItems.some((i) => i.id === prev.productId);
      if (!still) return { type: "catalog", productId: notebookProductItems[0]!.id };
      return prev;
    });
  }, [notebookProductItems]);

  const selectedNotebook = useMemo(() => {
    if (notebookSelection?.type !== "catalog") return undefined;
    return notebookProductItems.find((p) => p.id === notebookSelection.productId);
  }, [notebookProductItems, notebookSelection]);
  const previewNotebookColors = useMemo(
    () => colorsFromNotebookProduct(selectedNotebook),
    [selectedNotebook],
  );

  // Per-product print area drives the editor canvas. Falls back to the legacy
  // A5 hardcover canvas (14 × 21.4 cm @ 300 DPI) when "Other" is picked.
  const notebookCanvasSize = useMemo(() => {
    if (selectedNotebook) {
      return {
        width: cmToPx(selectedNotebook.printWidthCm, selectedNotebook.printDpi),
        height: cmToPx(selectedNotebook.printHeightCm, selectedNotebook.printDpi),
      };
    }
    return {
      width: cmToPx(NOTEBOOK_DEFAULT_PRINT.widthCm, NOTEBOOK_DEFAULT_PRINT.dpi),
      height: cmToPx(NOTEBOOK_DEFAULT_PRINT.heightCm, NOTEBOOK_DEFAULT_PRINT.dpi),
    };
  }, [selectedNotebook]);

  const sizedNotebookTemplate = useMemo<NotebookTemplate | null>(() => {
    if (!selectedTemplate) return null;
    const built = buildNotebookTemplates(notebookCanvasSize.width, notebookCanvasSize.height);
    return built.find((t) => t.id === selectedTemplate.id) ?? built[0]!;
  }, [selectedTemplate, notebookCanvasSize.width, notebookCanvasSize.height]);

  const notebookHas3dPreview = selectedNotebook?.has3dPreview ?? true;

  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  }, [step]);

  const goToStep2 = () => {
    if (selectedTemplate) setStep(2);
  };

  const goTo3DStep = () => {
    setStep(4);
  };

  const goToPhoneStep = () => {
    setStep(5);
  };

  const goToConfirmStep = () => {
    if (phone.length < 8) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    setStep(6);
  };

  const handleSubmit = useCallback(async () => {
    if (!gdprAccepted || !selectedTemplate || !notebookSelection) return;
    if (notebookSelection.type === "catalog" && !notebookSelection.productId) return;
    setSubmitting(true);

    try {
      const canvas = canvasPreviewRef.current?.getCanvas();
      if (!canvas) throw new Error("Canvas not available");

      async function uploadBlob(blobUrl: string, name: string, mime: string): Promise<string> {
        const resp = await fetch(blobUrl);
        const blob = await resp.blob();
        const f = new File([blob], name, { type: mime });
        const urlRes = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: f.name, contentType: f.type }),
        });
        if (!urlRes.ok) throw new Error("Failed to get upload URL");
        const { uploadUrl, fileKey } = await urlRes.json();
        const up = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
        if (!up.ok) throw new Error("Failed to upload");
        return fileKey;
      }

      const photoFileKeys = await Promise.all(
        photoUrls.map((url, i) =>
          uploadBlob(url, `notebook-photo-${Date.now()}-${i}.jpg`, "image/jpeg"),
        ),
      );

      const blob = await exportCanvasAsBlob(canvas);
      const file = blobToFile(blob, `notebook-layout-${Date.now()}.png`);

      const urlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: "image/png" }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, fileKey } = await urlRes.json();

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload file");

      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          notes: notes.trim() || undefined,
          productType: "notebook",
          notebookOther: notebookSelection.type === "other",
          notebookProductId:
            notebookSelection.type === "catalog" ? notebookSelection.productId : undefined,
          notebookLayoutData: {
            templateId: selectedTemplate.id,
            text,
            fontFamily,
            textColor,
            backgroundColor,
            photoUrls: photoFileKeys,
            photoSettings,
          },
          files: [
            {
              fileName: file.name,
              fileUrl: fileKey,
              copies: 1,
              color: "color",
              paperType: "notebook_layout",
            },
          ],
        }),
      });

      if (!orderRes.ok) throw new Error("Failed to create order");
      const order = await orderRes.json();
      setOrderResult({
        id: order.id,
        orderNumber: order.orderNumber,
        publicToken: order.publicToken,
      });
    } catch (err) {
      console.error("Notebook submission error:", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    gdprAccepted,
    selectedTemplate,
    phone,
    notes,
    photoUrls,
    photoSettings,
    text,
    fontFamily,
    textColor,
    backgroundColor,
    notebookSelection,
  ]);

  const copyTrackingLink = () => {
    if (!orderResult) return;
    const link = `${window.location.origin}/track/${orderResult.publicToken}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (orderResult) {
    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center px-4 py-4">
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

  const stepLabels = [
    t.notebook.stepTemplate,
    t.notebook.stepNotebook,
    t.notebook.stepCustomize,
    t.notebook.stepPreview,
    t.notebook.stepDetails,
    t.upload.stepConfirm,
  ];

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col items-center justify-center gap-4 px-4 py-4">
      <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 max-w-lg w-full text-gray-900">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (step > 1 ? setStep(step - 1) : window.location.assign("/"))}
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{t.notebook.productNotebook}</h1>
          </div>
          <div className="flex items-center gap-2">
            <CabinetHeaderBadge />
            <LanguageSwitcher />
          </div>
        </div>

        <NotebookStepProgress current={step} labels={stepLabels} formatLine={t.notebook.stepProgressLine} />

        {step === 1 && (
          <div className="space-y-4">
            <NotebookTemplateSelector
              selected={selectedTemplate?.id ?? null}
              onSelect={setSelectedTemplate}
              canvasWidth={notebookCanvasSize.width}
              canvasHeight={notebookCanvasSize.height}
            />
            <Button
              onClick={goToStep2}
              className="w-full"
              size="lg"
              disabled={!selectedTemplate}
            >
              {t.upload.next} <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {step === 2 && selectedTemplate && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200/90 p-3 sm:p-4 bg-gradient-to-b from-gray-50/90 to-white">
              <NotebookProductPicker
                variant="strip"
                items={notebookProductItems}
                value={notebookSelection}
                onChange={setNotebookSelection}
                label={t.notebook.notebookProductPickLabel}
                hint={t.notebook.notebookProductPickHint}
                emptyMessage={t.notebook.notebookProductCatalogEmpty}
                otherLabel={t.notebook.notebookProductOtherLabel}
                otherHint={t.notebook.notebookProductOtherHint}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1" size="lg">
                <ChevronLeft className="w-4 h-4" /> {t.upload.back}
              </Button>
              <Button
                onClick={() => setStep(3)}
                className="flex-1"
                size="lg"
                disabled={!notebookSelection}
              >
                {t.upload.next} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && sizedNotebookTemplate && (
          <div className="space-y-4">
            <NotebookEditor
              photos={photoUrls}
              photoSettings={photoSettings}
              template={sizedNotebookTemplate}
              text={text}
              fontFamily={fontFamily}
              textColor={textColor}
              backgroundColor={backgroundColor}
              productBaseColor={selectedNotebook?.coverColorHex ?? null}
              onPhotosChange={setPhotoUrls}
              onPhotoSettingsChange={setPhotoSettings}
              onTextChange={setText}
              onFontChange={setFontFamily}
              onTextColorChange={setTextColor}
              onBgColorChange={setBackgroundColor}
            />

            <div className="sticky bottom-2 z-10 flex justify-center">
              <div className="w-32 sm:w-40">
                <NotebookCanvasPreview
                  ref={canvasPreviewRef}
                  template={sizedNotebookTemplate}
                  photoUrls={photoUrls}
                  photoSettings={photoSettings}
                  text={text}
                  fontFamily={fontFamily}
                  textColor={textColor}
                  backgroundColor={backgroundColor}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1" size="lg">
                <ChevronLeft className="w-4 h-4" /> {t.upload.back}
              </Button>
              <Button onClick={goTo3DStep} className="flex-1" size="lg">
                {t.upload.next} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 4 && sizedNotebookTemplate && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="w-40 sm:w-48">
                <NotebookCanvasPreview
                  ref={canvasPreviewRef}
                  template={sizedNotebookTemplate}
                  photoUrls={photoUrls}
                  photoSettings={photoSettings}
                  text={text}
                  fontFamily={fontFamily}
                  textColor={textColor}
                  backgroundColor={backgroundColor}
                  onCanvasReady={setPreviewCanvas}
                />
              </div>
            </div>

            {notebookHas3dPreview && (
              <Notebook3DPreview
                canvasElement={previewCanvas}
                coverColorHex={previewNotebookColors.coverColorHex}
                strapColorHex={previewNotebookColors.strapColorHex}
                bookmarkColorHex={previewNotebookColors.bookmarkColorHex}
              />
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(3)} className="flex-1" size="lg">
                <ChevronLeft className="w-4 h-4" /> {t.upload.back}
              </Button>
              <Button onClick={goToPhoneStep} className="flex-1" size="lg">
                {t.notebook.confirmLayout} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 5 && (
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
                readOnly={cabinetSession.status === "authenticated"}
                disabled={cabinetSession.status === "authenticated"}
                className={
                  cabinetSession.status === "authenticated"
                    ? "bg-gray-100 text-gray-700"
                    : undefined
                }
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
              <Button variant="outline" onClick={() => setStep(4)} className="flex-1" size="lg">
                <ChevronLeft className="w-4 h-4" /> {t.upload.back}
              </Button>
              <Button onClick={goToConfirmStep} className="flex-1" size="lg">
                {t.upload.next} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            {sizedNotebookTemplate && (
              <div className="flex justify-center">
                <div className="w-44 sm:w-56">
                  <NotebookCanvasPreview
                    ref={canvasPreviewRef}
                    template={sizedNotebookTemplate}
                    photoUrls={photoUrls}
                    photoSettings={photoSettings}
                    text={text}
                    fontFamily={fontFamily}
                    textColor={textColor}
                    backgroundColor={backgroundColor}
                  />
                </div>
              </div>
            )}

            <p className="text-sm text-gray-600 text-center leading-relaxed">
              {t.notebook.confirmHint}
            </p>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={gdprAccepted}
                onChange={(e) => setGdprAccepted(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-gray-300 cursor-pointer accent-gold"
              />
              <span className="text-sm text-gray-700 leading-snug">
                {t.upload.gdprConsent}
              </span>
            </label>

            {submitting && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                {t.notebook.generating}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(5)} className="flex-1" size="lg" disabled={submitting}>
                <ChevronLeft className="w-4 h-4" /> {t.upload.back}
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1"
                size="lg"
                disabled={!gdprAccepted || submitting || !notebookSelection}
              >
                {submitting ? t.common.submitting : t.upload.gdprSubmit}
              </Button>
            </div>
          </div>
        )}

        {step !== 6 && (
          <div className="mt-4 flex items-center gap-3 bg-gray-50 rounded-lg p-3">
            <ShieldCheck className="w-5 h-5 text-green-500 flex-shrink-0" />
            <p className="text-xs text-gray-500 leading-relaxed">
              {t.upload.dataNotice}
            </p>
          </div>
        )}
      </div>

      <CabinetLoginCta enabled={showPublicCabinetLoginCta} />
    </div>
  );
}
