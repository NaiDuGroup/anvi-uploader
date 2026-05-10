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

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ aspectRatio, display: "block" }}
      />
    </div>
  );
});
