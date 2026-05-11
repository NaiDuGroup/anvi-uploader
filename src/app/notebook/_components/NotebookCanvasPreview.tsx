"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { NotebookTemplate, PhotoSettings } from "@/lib/notebook/templates";
import { renderNotebookLayout } from "@/lib/notebook/canvasRenderer";
import { FONT_OPTIONS } from "./NotebookEditor";

const FONT_VAR_MAP = new Map<string, string>(FONT_OPTIONS.map((f) => [f.family, f.cssVar]));

function useResolvedFont(fontFamily: string): string {
  return useMemo(() => {
    if (typeof window === "undefined") return fontFamily;
    const cssVar = FONT_VAR_MAP.get(fontFamily);
    if (!cssVar) return fontFamily;
    const varName = cssVar.replace("var(", "").replace(")", "");
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!resolved) return fontFamily;
    const primary = resolved.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
    return primary || fontFamily;
  }, [fontFamily]);
}

function useFontsReady(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    document.fonts.ready.then(() => setTick((t) => t + 1));
  }, []);
  return tick;
}

export interface NotebookCanvasPreviewHandle {
  getCanvas(): HTMLCanvasElement | null;
}

interface NotebookCanvasPreviewProps {
  template: NotebookTemplate;
  photoUrls: string[];
  photoSettings?: PhotoSettings[];
  text: string;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  /**
   * Optional className applied to the canvas itself. Use this to add a
   * `max-h-[...]` cap on the rendered preview. Without a cap, A5 notebooks
   * (portrait) blow up to ~140% of the viewport height when the preview
   * sits in a wide editor column, forcing the user to scroll. Combined
   * with `aspect-ratio` + `width: auto`, the browser shrinks both axes
   * proportionally to honour the height cap.
   */
  canvasClassName?: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export const NotebookCanvasPreview = forwardRef<
  NotebookCanvasPreviewHandle,
  NotebookCanvasPreviewProps
>(function NotebookCanvasPreview(
  {
    template,
    photoUrls,
    photoSettings,
    text,
    fontFamily,
    textColor,
    backgroundColor,
    onCanvasReady,
    canvasClassName,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<HTMLImageElement[]>([]);

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
  }));

  useEffect(() => {
    if (canvasRef.current && onCanvasReady) {
      onCanvasReady(canvasRef.current);
    }
  }, [onCanvasReady]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(photoUrls.map(loadImage))
      .then((loaded) => {
        if (!cancelled) setImages(loaded);
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [photoUrls]);

  const resolvedFont = useResolvedFont(fontFamily);
  const fontsReady = useFontsReady();

  const render = useCallback(() => {
    if (!canvasRef.current) return;
    renderNotebookLayout(canvasRef.current, {
      template,
      photos: images,
      photoSettings,
      text,
      fontFamily: resolvedFont,
      textColor,
      backgroundColor,
    });
  }, [
    template,
    images,
    photoSettings,
    text,
    resolvedFont,
    textColor,
    backgroundColor,
    fontsReady,
  ]);

  useEffect(() => {
    render();
  }, [render]);

  // The template carries its instantiated canvas size; CSS aspect ratio
  // must follow it so non-A5 hardcovers don't get squished.
  const aspectRatio = `${template.canvasWidth} / ${template.canvasHeight}`;

  // When a max-height cap is passed via `canvasClassName`, switch the canvas
  // from "fill width" to "fit either axis": set `width: auto` so the canvas
  // can shrink horizontally as the `max-height` kicks in, and let
  // `aspect-ratio` keep both axes in sync. Without a cap, fall back to the
  // legacy "fill parent width" layout used by all small thumbnails.
  const capped = Boolean(canvasClassName);

  return (
    <div
      className={`rounded-xl border border-gray-200 overflow-hidden bg-gray-50 ${
        capped ? "flex items-center justify-center" : ""
      }`}
    >
      <canvas
        ref={canvasRef}
        className={capped ? `block mx-auto ${canvasClassName}` : "w-full"}
        style={
          capped
            ? { aspectRatio, width: "auto", maxWidth: "100%" }
            : { aspectRatio, display: "block" }
        }
      />
    </div>
  );
});
