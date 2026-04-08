"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
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
import { MUG_TEMPLATES, type MugTemplate, type PhotoSettings } from "@/lib/mug/templates";
import { TemplateSelector } from "./_components/TemplateSelector";
import { MugEditor, FONT_OPTIONS } from "./_components/MugEditor";
import { MugCanvasPreview, type MugCanvasPreviewHandle } from "./_components/MugCanvasPreview";
import { exportCanvasAsBlob, blobToFile } from "@/lib/mug/exportLayout";
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

function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="mb-5">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${labels.length}, 1fr)` }}>
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
              <span className={`text-[11px] font-medium text-center ${done ? "text-gold" : "text-gray-400"}`}>
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

export default function MugPage() {
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

  const canvasPreviewRef = useRef<MugCanvasPreviewHandle>(null);
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  }, [step]);

  const goToStep2 = () => {
    if (selectedTemplate) setStep(2);
  };

  const goToStep3 = () => {
    setStep(3);
  };

  const goToStep4 = () => {
    setStep(4);
  };

  const goToStep5 = () => {
    if (phone.length < 8) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    setStep(5);
  };

  const handleSubmit = useCallback(async () => {
    if (!gdprAccepted || !selectedTemplate) return;
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
  }, [gdprAccepted, selectedTemplate, phone, notes, photoUrls, photoSettings, text, fontFamily, textColor, backgroundColor]);

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
    t.mug.stepCustomize,
    t.mug.stepPreview,
    t.mug.stepDetails,
    t.upload.stepConfirm,
  ];

  return (
    <div className="min-h-dvh bg-gray-50 flex items-center justify-center px-4 py-4">
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
          <LanguageSwitcher />
        </div>

        <StepIndicator current={step} labels={stepLabels} />

        {/* Step 1: Choose template */}
        {step === 1 && (
          <div className="space-y-4">
            <TemplateSelector
              selected={selectedTemplate?.id ?? null}
              onSelect={setSelectedTemplate}
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

        {/* Step 2: Upload photos + text */}
        {step === 2 && selectedTemplate && (
          <div className="space-y-4">
            <MugEditor
              photos={photoUrls}
              photoSettings={photoSettings}
              template={selectedTemplate}
              text={text}
              fontFamily={fontFamily}
              textColor={textColor}
              backgroundColor={backgroundColor}
              onPhotosChange={setPhotoUrls}
              onPhotoSettingsChange={setPhotoSettings}
              onTextChange={setText}
              onFontChange={setFontFamily}
              onTextColorChange={setTextColor}
              onBgColorChange={setBackgroundColor}
            />

            {/* Sticky live preview at the bottom of controls */}
            <div className="sticky bottom-2 z-10">
              <MugCanvasPreview
                ref={canvasPreviewRef}
                template={selectedTemplate}
                photoUrls={photoUrls}
                photoSettings={photoSettings}
                text={text}
                fontFamily={fontFamily}
                textColor={textColor}
                backgroundColor={backgroundColor}
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1" size="lg">
                <ChevronLeft className="w-4 h-4" /> {t.upload.back}
              </Button>
              <Button onClick={goToStep3} className="flex-1" size="lg">
                {t.upload.next} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: 3D Preview */}
        {step === 3 && selectedTemplate && (
          <div className="space-y-4">
            <MugCanvasPreview
              ref={canvasPreviewRef}
              template={selectedTemplate}
              photoUrls={photoUrls}
              photoSettings={photoSettings}
              text={text}
              fontFamily={fontFamily}
              textColor={textColor}
              backgroundColor={backgroundColor}
              onCanvasReady={setPreviewCanvas}
            />

            <Mug3DPreview canvasElement={previewCanvas} />

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1" size="lg">
                <ChevronLeft className="w-4 h-4" /> {t.upload.back}
              </Button>
              <Button onClick={goToStep4} className="flex-1" size="lg">
                {t.mug.confirmLayout} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Phone + Notes */}
        {step === 4 && (
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
              <Button variant="outline" onClick={() => setStep(3)} className="flex-1" size="lg">
                <ChevronLeft className="w-4 h-4" /> {t.upload.back}
              </Button>
              <Button onClick={goToStep5} className="flex-1" size="lg">
                {t.upload.next} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Confirm & Submit */}
        {step === 5 && (
          <div className="space-y-4">
            {selectedTemplate && (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <MugCanvasPreview
                  ref={canvasPreviewRef}
                  template={selectedTemplate}
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
              <Button variant="outline" onClick={() => setStep(4)} className="flex-1" size="lg" disabled={submitting}>
                <ChevronLeft className="w-4 h-4" /> {t.upload.back}
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1"
                size="lg"
                disabled={!gdprAccepted || submitting}
              >
                {submitting ? t.common.submitting : t.upload.gdprSubmit}
              </Button>
            </div>
          </div>
        )}

        {step !== 5 && (
          <div className="mt-4 flex items-center gap-3 bg-gray-50 rounded-lg p-3">
            <ShieldCheck className="w-5 h-5 text-green-500 flex-shrink-0" />
            <p className="text-xs text-gray-500 leading-relaxed">
              {t.upload.dataNotice}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
