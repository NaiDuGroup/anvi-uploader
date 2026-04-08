"use client";

import { useEffect, useRef } from "react";
import { MUG_TEMPLATES, type MugTemplate } from "@/lib/mug/templates";
import { renderThumbnail } from "@/lib/mug/canvasRenderer";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Check } from "lucide-react";

interface TemplateSelectorProps {
  selected: string | null;
  onSelect: (template: MugTemplate) => void;
}

function TemplateThumbnail({
  template,
  isSelected,
  label,
  onClick,
}: {
  template: MugTemplate;
  isSelected: boolean;
  label: string;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      renderThumbnail(canvasRef.current, template);
    }
  }, [template]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-xl border-2 overflow-hidden transition-all ${
        isSelected
          ? "border-gold ring-2 ring-gold/30 shadow-md"
          : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      <canvas
        ref={canvasRef}
        className="w-full aspect-[2.19/1] block"
        style={{ imageRendering: "auto" }}
      />
      {isSelected && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gold flex items-center justify-center">
          <Check className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div className="px-2 py-1.5 bg-white">
        <p className={`text-xs font-medium ${isSelected ? "text-gold-text" : "text-gray-600"}`}>
          {label}
        </p>
      </div>
    </button>
  );
}

const TEMPLATE_LABELS: Record<string, (t: ReturnType<typeof useLanguageStore.getState>["t"]) => string> = {
  classic: (t) => t.mug.templateClassic,
  photo_text_photo: (t) => t.mug.templatePhotoTextPhoto,
  photo_text: (t) => t.mug.templatePhotoText,
  text_photo: (t) => t.mug.templateTextPhoto,
};

export function TemplateSelector({ selected, onSelect }: TemplateSelectorProps) {
  const { t } = useLanguageStore();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">{t.mug.chooseTemplate}</h3>
      <div className="grid grid-cols-2 gap-3">
        {MUG_TEMPLATES.map((tmpl) => {
          const getLabel = TEMPLATE_LABELS[tmpl.id];
          const label = getLabel ? getLabel(t) : tmpl.id;
          return (
            <TemplateThumbnail
              key={tmpl.id}
              template={tmpl}
              isSelected={selected === tmpl.id}
              label={label}
              onClick={() => onSelect(tmpl)}
            />
          );
        })}
      </div>
    </div>
  );
}
