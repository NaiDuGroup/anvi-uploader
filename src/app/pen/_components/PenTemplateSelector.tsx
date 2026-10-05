"use client";

import { useEffect, useMemo, useRef } from "react";
import { buildPenTemplates, PEN_DEFAULT_CANVAS, type PenTemplate } from "@/lib/pen/templates";
import { renderThumbnail } from "@/lib/pen/canvasRenderer";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Check } from "lucide-react";

interface PenTemplateSelectorProps {
  selected: string | null;
  onSelect: (template: PenTemplate) => void;
  canvasWidth?: number;
  canvasHeight?: number;
}

function TemplateThumbnail({
  template,
  isSelected,
  onClick,
}: {
  template: PenTemplate;
  isSelected: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      renderThumbnail(canvasRef.current, template);
    }
  }, [template]);

  const aspectRatio = `${template.canvasWidth} / ${template.canvasHeight}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-lg border-2 transition-all shadow-sm hover:shadow-md ${
        isSelected
          ? "border-gold ring-1 ring-gold/30"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <canvas
        ref={canvasRef}
        className="w-full block"
        style={{ aspectRatio, imageRendering: "auto" }}
      />
      {isSelected && (
        <div className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-gold">
          <Check className="h-3.5 w-3.5 text-white" />
        </div>
      )}
    </button>
  );
}

type Translations = ReturnType<typeof useLanguageStore.getState>["t"];

const TEMPLATE_LABELS: Record<string, (t: Translations) => string> = {
  text_only: (t) => t.pen.templateTextOnly,
  logo_text: (t) => t.pen.templateLogoText,
  text_logo: (t) => t.pen.templateTextLogo,
  logo_only: (t) => t.pen.templateLogoOnly,
  photo_only: (t) => t.pen.templatePhotoOnly,
};

export function PenTemplateSelector({
  selected,
  onSelect,
  canvasWidth = PEN_DEFAULT_CANVAS.width,
  canvasHeight = PEN_DEFAULT_CANVAS.height,
}: PenTemplateSelectorProps) {
  const { t } = useLanguageStore();

  const templates = useMemo(
    () => buildPenTemplates(canvasWidth, canvasHeight),
    [canvasWidth, canvasHeight],
  );

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700">
        {t.pen.chooseTemplate}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {templates.map((tmpl) => {
          const getLabel = TEMPLATE_LABELS[tmpl.id];
          const label = getLabel ? getLabel(t) : tmpl.id;
          return (
            <div key={tmpl.id} className="space-y-1">
              <TemplateThumbnail
                template={tmpl}
                isSelected={selected === tmpl.id}
                onClick={() => onSelect(tmpl)}
              />
              <p className="text-center text-xs text-gray-600">{label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
