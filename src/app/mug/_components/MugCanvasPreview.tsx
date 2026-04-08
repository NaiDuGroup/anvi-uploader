"use client";

import { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import type { MugTemplate, PhotoSettings } from "@/lib/mug/templates";
import { renderMugLayout } from "@/lib/mug/canvasRenderer";
import { FONT_OPTIONS } from "./MugEditor";

const FONT_VAR_MAP = new Map<string, string>(FONT_OPTIONS.map((f) => [f.family, f.cssVar]));

/**
 * Resolve the font family name for Canvas 2D usage.
 * next/font generates hashed names via CSS vars (e.g. "__Lobster_abc123").
 * MugFontLoader in admin sets vars like "'Lobster', cursive" — we extract
 * just the primary name and strip quotes so Canvas ctx.font stays valid.
 */
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

/** Re-render trigger: returns a counter that increments once document fonts are ready. */
function useFontsReady(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    document.fonts.ready.then(() => setTick((t) => t + 1));
  }, []);
  return tick;
}

export interface MugCanvasPreviewHandle {
  getCanvas(): HTMLCanvasElement | null;
}

interface MugCanvasPreviewProps {
  template: MugTemplate;
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

export const MugCanvasPreview = forwardRef<MugCanvasPreviewHandle, MugCanvasPreviewProps>(
  function MugCanvasPreview({ template, photoUrls, photoSettings, text, fontFamily, textColor, backgroundColor, onCanvasReady }, ref) {
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
      return () => { cancelled = true; };
    }, [photoUrls]);

    const resolvedFont = useResolvedFont(fontFamily);
    const fontsReady = useFontsReady();

    const render = useCallback(() => {
      if (!canvasRef.current) return;
      renderMugLayout(canvasRef.current, {
        template,
        photos: images,
        photoSettings,
        text,
        fontFamily: resolvedFont,
        textColor,
        backgroundColor,
      });
    }, [template, images, photoSettings, text, resolvedFont, textColor, backgroundColor, fontsReady]);

    useEffect(() => {
      render();
    }, [render]);

    return (
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ aspectRatio: "2480 / 1134", display: "block" }}
        />
      </div>
    );
  },
);
