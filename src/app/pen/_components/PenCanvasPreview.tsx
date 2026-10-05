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
import type { PenTemplate, PhotoSettings } from "@/lib/pen/templates";
import { renderPenLayout } from "@/lib/pen/canvasRenderer";
import { FONT_OPTIONS } from "./PenEditor";

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

export interface PenCanvasPreviewHandle {
  getCanvas(): HTMLCanvasElement | null;
}

interface PenCanvasPreviewProps {
  template: PenTemplate;
  photoUrls: string[];
  photoSettings?: PhotoSettings[];
  text: string;
  textSecondary?: string;
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

export const PenCanvasPreview = forwardRef<
  PenCanvasPreviewHandle,
  PenCanvasPreviewProps
>(function PenCanvasPreview(
  {
    template,
    photoUrls,
    photoSettings,
    text,
    textSecondary,
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
    renderPenLayout(canvasRef.current, {
      template,
      photos: images,
      photoSettings,
      text,
      textSecondary,
      fontFamily: resolvedFont,
      textColor,
      backgroundColor,
    });
  }, [
    template,
    images,
    photoSettings,
    text,
    textSecondary,
    resolvedFont,
    textColor,
    backgroundColor,
    fontsReady,
  ]);

  useEffect(() => {
    render();
  }, [render]);

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
