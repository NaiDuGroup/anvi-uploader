"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  buildNotebookTemplates,
  NOTEBOOK_DEFAULT_CANVAS,
  type NotebookTemplate,
} from "@/lib/notebook/templates";
import { renderNotebookThumbnail } from "@/lib/notebook/canvasRenderer";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Check } from "lucide-react";

interface TemplateSelectorProps {
  selected: string | null;
  onSelect: (template: NotebookTemplate) => void;
  /**
   * Pixel canvas to render thumbnails for. Optional — when omitted, falls back
   * to the legacy A5 hardcover canvas (1654 × 2528).
   */
  canvasWidth?: number;
  canvasHeight?: number;
  /**
   * `true` renders the tiny 4-up strip used inside the cabinet / admin order
   * forms. `false` (the default) keeps the comfortable 2-col layout with
   * captions — used by the public `/notebook` mobile wizard.
   */
  compact?: boolean;
}

function TemplateThumbnail({
  template,
  isSelected,
  onClick,
  compact,
}: {
  template: NotebookTemplate;
  isSelected: boolean;
  onClick: () => void;
  compact: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      renderNotebookThumbnail(canvasRef.current, template);
    }
  }, [template]);

  // Aspect ratio mirrors the template's actual canvas so thumbnails look
  // correct for non-A5 hardcovers too.
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
              ? "top-0.5 right-0.5 h-4 w-4"
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
  classic: (t) => t.notebook.templateClassic,
  photo_text_photo: (t) => t.notebook.templatePhotoTextPhoto,
  photo_text: (t) => t.notebook.templatePhotoText,
  text_photo: (t) => t.notebook.templateTextPhoto,
  panorama: (t) => t.notebook.templatePanorama,
  three_photos: (t) => t.notebook.templateThreePhotos,
  polaroid_trio: (t) => t.notebook.templatePolaroidTrio,
  big_quote: (t) => t.notebook.templateBigQuote,
  heart_love: (t) => t.notebook.templateHeartLove,
  collage: (t) => t.notebook.templateCollage,
  split_horizontal: (t) => t.notebook.templateSplitHorizontal,
  grid_quad: (t) => t.notebook.templateGridQuad,
};

export function NotebookTemplateSelector({
  selected,
  onSelect,
  canvasWidth = NOTEBOOK_DEFAULT_CANVAS.width,
  canvasHeight = NOTEBOOK_DEFAULT_CANVAS.height,
  compact = false,
}: TemplateSelectorProps) {
  const { t } = useLanguageStore();
  const templates = useMemo(
    () => buildNotebookTemplates(canvasWidth, canvasHeight),
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
          {t.notebook.chooseTemplate}
        </h3>
        {/*
          Compact: portrait thumbnails capped at ~64px wide. Labels live in
          `title` / `aria-label` — the layout pattern is visually obvious
          from the rendered canvas alone.
        */}
        {overflows ? (
          <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
            {templates.map((tmpl) => {
              const getLabel = TEMPLATE_LABELS[tmpl.id];
              const label = getLabel ? getLabel(t) : tmpl.id;
              return (
                <div
                  key={tmpl.id}
                  className="w-14 shrink-0 snap-start sm:w-16"
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
          <div className="grid w-fit max-w-full grid-cols-4 gap-1.5 sm:gap-2">
            {templates.map((tmpl) => {
              const getLabel = TEMPLATE_LABELS[tmpl.id];
              const label = getLabel ? getLabel(t) : tmpl.id;
              return (
                <div
                  key={tmpl.id}
                  className="w-14 sm:w-16"
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

  // Comfortable layout: 3-up grid for the public `/notebook` step 1 wizard.
  // Notebook thumbnails are tall portraits (~0.65 aspect), so 3-col keeps
  // the whole picker on one screen instead of letting each thumb dominate
  // half the viewport.
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">
        {t.notebook.chooseTemplate}
      </h3>
      <div className="grid grid-cols-3 gap-2.5">
        {templates.map((tmpl) => {
          const getLabel = TEMPLATE_LABELS[tmpl.id];
          const label = getLabel ? getLabel(t) : tmpl.id;
          return (
            <div key={tmpl.id} className="space-y-1">
              <TemplateThumbnail
                template={tmpl}
                isSelected={selected === tmpl.id}
                compact={false}
                onClick={() => onSelect(tmpl)}
              />
              <p
                className="text-[11px] font-medium text-center text-gray-700 leading-tight line-clamp-2"
                title={label}
              >
                {label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
