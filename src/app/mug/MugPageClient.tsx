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
  buildMugTemplates,
  type MugTemplate,
  type PhotoSettings,
} from "@/lib/mug/templates";
import { MUG_DEFAULT_PRINT, cmToPx } from "@/lib/printDimensions";
import { TemplateSelector } from "./_components/TemplateSelector";
import { MugEditor, FONT_OPTIONS } from "./_components/MugEditor";
import { MugCanvasPreview, type MugCanvasPreviewHandle } from "./_components/MugCanvasPreview";
import { exportCanvasAsBlob, blobToFile } from "@/lib/mug/exportLayout";
import {
  MugProductPicker,
  colorsFromProduct,
  type MugProductOption,
  type MugProductSelection,
} from "./_components/MugProductPicker";
import dynamic from "next/dynamic";

const Mug3DPreview = dynamic(
  () => import("./_components/Mug3DPreview").then((m) => m.Mug3DPreview),
  { ssr: false },
);

interface OrderResult {
  id: string;
  orderNumber: number;
  publicToken: string;
}

function MugStepProgress({
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

export default function MugPageClient({
  showPublicCabinetLoginCta,
}: {
  showPublicCabinetLoginCta: boolean;
}) {
  const { t } = useLanguageStore();
  const [step, setStep] = useState(1);

  const [selectedTemplate, setSelectedTemplate] = useState<MugTemplate | null>(null);
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

  const [mugProductItems, setMugProductItems] = useState<MugProductOption[]>([]);
  const [mugSelection, setMugSelection] = useState<MugProductSelection | null>(null);

  const canvasPreviewRef = useRef<MugCanvasPreviewHandle>(null);
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mug-products")
      .then((res) => res.json())
      .then((data: { items?: MugProductOption[] }) => {
        if (!cancelled) setMugProductItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setMugProductItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mugProductItems.length === 0) {
      setMugSelection({ type: "other" });
      return;
    }
    setMugSelection((prev) => {
      if (!prev || prev.type === "other") {
        return { type: "catalog", productId: mugProductItems[0]!.id };
      }
      const still = mugProductItems.some((i) => i.id === prev.productId);
      if (!still) return { type: "catalog", productId: mugProductItems[0]!.id };
      return prev;
    });
  }, [mugProductItems]);

  const selectedMug = useMemo(() => {
    if (mugSelection?.type !== "catalog") return undefined;
    return mugProductItems.find((p) => p.id === mugSelection.productId);
  }, [mugProductItems, mugSelection]);
  const previewMugColors = useMemo(
    () => colorsFromProduct(selectedMug),
    [selectedMug],
  );

  // Per-product print area drives the editor canvas. Falls back to the legacy
  // mug canvas (21 × 9.6 cm @ 300 DPI) when the client picked "Other".
  const mugCanvasSize = useMemo(() => {
    if (selectedMug) {
      return {
        width: cmToPx(selectedMug.printWidthCm, selectedMug.printDpi),
        height: cmToPx(selectedMug.printHeightCm, selectedMug.printDpi),
      };
    }
    return {
      width: cmToPx(MUG_DEFAULT_PRINT.widthCm, MUG_DEFAULT_PRINT.dpi),
      height: cmToPx(MUG_DEFAULT_PRINT.heightCm, MUG_DEFAULT_PRINT.dpi),
    };
  }, [selectedMug]);

  // Re-instantiate the picked template against the selected canvas size whenever
  // the product (or template id) changes, so editing always uses the right slots.
  const sizedMugTemplate = useMemo<MugTemplate | null>(() => {
    if (!selectedTemplate) return null;
    const built = buildMugTemplates(mugCanvasSize.width, mugCanvasSize.height);
    return built.find((t) => t.id === selectedTemplate.id) ?? built[0]!;
  }, [selectedTemplate, mugCanvasSize.width, mugCanvasSize.height]);

  // Per-product 3D toggle. "Other" mugs default to true (legacy GLB applies).
  const mugHas3dPreview = selectedMug?.has3dPreview ?? true;

  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  }, [step]);

  const goToStep2 = () => {
    if (selectedTemplate) setStep(2);
  };

  /** Customize → 3D preview */
  const goTo3DStep = () => {
    setStep(4);
  };

  /** 3D → phone */
  const goToPhoneStep = () => {
    setStep(5);
  };

  /** Phone → confirm (validates) */
  const goToConfirmStep = () => {
    if (phone.length < 8) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    setStep(6);
  };

  const handleSubmit = useCallback(async () => {
    if (!gdprAccepted || !selectedTemplate || !mugSelection) return;
    if (mugSelection.type === "catalog" && !mugSelection.productId) return;
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
        photoUrls.map((url, i) => uploadBlob(url, `mug-photo-${Date.now()}-${i}.jpg`, "image/jpeg")),
      );

      const blob = await exportCanvasAsBlob(canvas);
      const file = blobToFile(blob, `mug-layout-${Date.now()}.png`);

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
          productType: "mug",
          mugOther: mugSelection.type === "other",
          mugProductId:
            mugSelection.type === "catalog" ? mugSelection.productId : undefined,
          mugLayoutData: {
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
              paperType: "mug_layout",
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
      console.error("Mug submission error:", err);
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
    mugSelection,
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
    t.mug.stepTemplate,
    t.mug.stepMug,
    t.mug.stepCustomize,
    t.mug.stepPreview,
    t.mug.stepDetails,
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
            <h1 className="text-2xl font-bold text-gray-900">{t.mug.productMug}</h1>
          </div>
          <div className="flex items-center gap-2">
            <CabinetHeaderBadge />
            <LanguageSwitcher />
          </div>
        </div>

        <MugStepProgress current={step} labels={stepLabels} formatLine={t.mug.stepProgressLine} />

        {/* Step 1: Choose template */}
        {step === 1 && (
          <div className="space-y-4">
            <TemplateSelector
              selected={selectedTemplate?.id ?? null}
              onSelect={setSelectedTemplate}
              canvasWidth={mugCanvasSize.width}
              canvasHeight={mugCanvasSize.height}
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

        {/* Step 2: Mug from stock (compact horizontal strip on mobile) */}
        {step === 2 && selectedTemplate && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200/90 p-3 sm:p-4 bg-gradient-to-b from-gray-50/90 to-white">
              <MugProductPicker
                variant="strip"
                items={mugProductItems}
                value={mugSelection}
                onChange={setMugSelection}
                label={t.mug.mugProductPickLabel}
                hint={t.mug.mugProductPickHint}
                emptyMessage={t.mug.mugProductCatalogEmpty}
                otherLabel={t.mug.mugProductOtherLabel}
                otherHint={t.mug.mugProductOtherHint}
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
                disabled={!mugSelection}
              >
                {t.upload.next} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Upload photos + text + live preview */}
        {step === 3 && sizedMugTemplate && (
          <div className="space-y-4">
            <MugEditor
              photos={photoUrls}
              photoSettings={photoSettings}
              template={sizedMugTemplate}
              text={text}
              fontFamily={fontFamily}
              textColor={textColor}
              backgroundColor={backgroundColor}
              productBaseColor={selectedMug?.bodyColorHex ?? null}
              onPhotosChange={setPhotoUrls}
              onPhotoSettingsChange={setPhotoSettings}
              onTextChange={setText}
              onFontChange={setFontFamily}
              onTextColorChange={setTextColor}
              onBgColorChange={setBackgroundColor}
            />

            <div className="sticky bottom-2 z-10">
              <MugCanvasPreview
                ref={canvasPreviewRef}
                template={sizedMugTemplate}
                photoUrls={photoUrls}
                photoSettings={photoSettings}
                text={text}
                fontFamily={fontFamily}
                textColor={textColor}
                backgroundColor={backgroundColor}
              />
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

        {/* Step 4: 3D Preview */}
        {step === 4 && sizedMugTemplate && (
          <div className="space-y-4">
            <MugCanvasPreview
              ref={canvasPreviewRef}
              template={sizedMugTemplate}
              photoUrls={photoUrls}
              photoSettings={photoSettings}
              text={text}
              fontFamily={fontFamily}
              textColor={textColor}
              backgroundColor={backgroundColor}
              onCanvasReady={setPreviewCanvas}
            />

            {mugHas3dPreview && (
              <Mug3DPreview
                canvasElement={previewCanvas}
                bodyColorHex={previewMugColors.bodyColorHex}
                handleColorHex={previewMugColors.handleColorHex}
                innerColorHex={previewMugColors.innerColorHex}
                rimColorHex={previewMugColors.rimColorHex}
              />
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(3)} className="flex-1" size="lg">
                <ChevronLeft className="w-4 h-4" /> {t.upload.back}
              </Button>
              <Button onClick={goToPhoneStep} className="flex-1" size="lg">
                {t.mug.confirmLayout} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Phone + Notes */}
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

        {/* Step 6: Confirm & Submit */}
        {step === 6 && (
          <div className="space-y-4">
            {sizedMugTemplate && (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <MugCanvasPreview
                  ref={canvasPreviewRef}
                  template={sizedMugTemplate}
                  photoUrls={photoUrls}
                  photoSettings={photoSettings}
                  text={text}
                  fontFamily={fontFamily}
                  textColor={textColor}
                  backgroundColor={backgroundColor}
                />
              </div>
            )}

            <p className="text-sm text-gray-600 text-center leading-relaxed">
              {t.mug.confirmHint}
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
                {t.mug.generating}
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
                disabled={!gdprAccepted || submitting || !mugSelection}
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
