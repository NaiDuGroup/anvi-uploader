"use client";

import { useEffect, useMemo, useRef } from "react";
import { buildMugTemplates, MUG_DEFAULT_CANVAS, type MugTemplate } from "@/lib/mug/templates";
import { renderThumbnail } from "@/lib/mug/canvasRenderer";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Check } from "lucide-react";

interface TemplateSelectorProps {
  selected: string | null;
  onSelect: (template: MugTemplate) => void;
  /**
   * Pixel canvas to render thumbnails for. Optional — when omitted, falls back
   * to the legacy mug canvas (2480 × 1134) so existing call sites keep working.
   */
  canvasWidth?: number;
  canvasHeight?: number;
  /**
   * `true` renders the ultra-compact 4-up strip used inside the cabinet /
   * admin order forms (no captions, tiny check). `false` (the default) keeps
   * the comfortable 2-col layout with text labels — used on the public
   * `/mug` mobile wizard where the selector is the centerpiece of step 1.
   */
  compact?: boolean;
}

function TemplateThumbnail({
  template,
  isSelected,
  onClick,
  compact,
}: {
  template: MugTemplate;
  isSelected: boolean;
  onClick: () => void;
  compact: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      renderThumbnail(canvasRef.current, template);
    }
  }, [template]);

  // Aspect ratio mirrors the template's actual canvas so thumbnails look
  // correct for non-default mug sizes too.
  const aspectRatio = `${template.canvasWidth} / ${template.canvasHeight}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden border-2 transition-all ${
        compact ? "rounded-md" : "rounded-xl shadow-sm hover:shadow-md"
      } ${
        isSelected
          ? "border-gold ring-1 ring-gold/30 shadow-sm"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <canvas
        ref={canvasRef}
        className="w-full block"
        style={{ aspectRatio, imageRendering: "auto" }}
      />
      {isSelected && (
        <div
          className={`absolute flex items-center justify-center rounded-full bg-gold ${
            compact
              ? "top-1 right-1 h-4 w-4"
              : "top-2 right-2 h-6 w-6"
          }`}
        >
          <Check
            className={compact ? "h-2.5 w-2.5 text-white" : "h-3.5 w-3.5 text-white"}
          />
        </div>
      )}
    </button>
  );
}

const TEMPLATE_LABELS: Record<string, (t: ReturnType<typeof useLanguageStore.getState>["t"]) => string> = {
  classic: (t) => t.mug.templateClassic,
  photo_text_photo: (t) => t.mug.templatePhotoTextPhoto,
  photo_text: (t) => t.mug.templatePhotoText,
  text_photo: (t) => t.mug.templateTextPhoto,
  panorama: (t) => t.mug.templatePanorama,
  panorama_no_text: (t) => t.mug.templatePanoramaNoText,
  three_photos: (t) => t.mug.templateThreePhotos,
  polaroid_trio: (t) => t.mug.templatePolaroidTrio,
  big_quote: (t) => t.mug.templateBigQuote,
  heart_love: (t) => t.mug.templateHeartLove,
  collage: (t) => t.mug.templateCollage,
};

export function TemplateSelector({
  selected,
  onSelect,
  canvasWidth = MUG_DEFAULT_CANVAS.width,
  canvasHeight = MUG_DEFAULT_CANVAS.height,
  compact = false,
}: TemplateSelectorProps) {
  const { t } = useLanguageStore();
  // Recompute templates when the product canvas changes so thumbnails reflect
  // the selected SKU's print area.
  const templates = useMemo(
    () => buildMugTemplates(canvasWidth, canvasHeight),
    [canvasWidth, canvasHeight],
  );

  if (compact) {
    // With >4 templates a wrapping grid grows tall enough to dominate the
    // admin form, so switch to a single-row horizontal scroller with snap
    // points. ≤4 still fits the original tidy grid.
    const overflows = templates.length > 4;
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t.mug.chooseTemplate}
        </h3>
        {/*
          Compact: each landscape thumbnail capped at ~9rem wide. Labels
          live in `title` / `aria-label` — the layout pattern is visually
          obvious from the rendered canvas alone.
        */}
        {overflows ? (
          <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
            {templates.map((tmpl) => {
              const getLabel = TEMPLATE_LABELS[tmpl.id];
              const label = getLabel ? getLabel(t) : tmpl.id;
              return (
                <div
                  key={tmpl.id}
                  className="w-32 shrink-0 snap-start sm:w-36"
                  title={label}
                  aria-label={label}
                >
                  <TemplateThumbnail
                    template={tmpl}
                    isSelected={selected === tmpl.id}
                    compact
                    onClick={() => onSelect(tmpl)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid w-fit max-w-full grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
            {templates.map((tmpl) => {
              const getLabel = TEMPLATE_LABELS[tmpl.id];
              const label = getLabel ? getLabel(t) : tmpl.id;
              return (
                <div
                  key={tmpl.id}
                  className="w-32 sm:w-36"
                  title={label}
                  aria-label={label}
                >
                  <TemplateThumbnail
                    template={tmpl}
                    isSelected={selected === tmpl.id}
                    compact
                    onClick={() => onSelect(tmpl)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Comfortable layout: 2-up grid, full-width thumbs with captions. This is
  // what the public `/mug` step 1 wizard uses — the selector is the only
  // thing on screen there, so we let it breathe.
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">
        {t.mug.chooseTemplate}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {templates.map((tmpl) => {
          const getLabel = TEMPLATE_LABELS[tmpl.id];
          const label = getLabel ? getLabel(t) : tmpl.id;
          return (
            <div key={tmpl.id} className="space-y-1.5">
              <TemplateThumbnail
                template={tmpl}
                isSelected={selected === tmpl.id}
                compact={false}
                onClick={() => onSelect(tmpl)}
              />
              <p className="text-xs font-medium text-center text-gray-700">
                {label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
