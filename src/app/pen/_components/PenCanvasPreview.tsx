"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { PenTemplate, PhotoSettings } from "@/lib/pen/templates";
import { renderPenLayout } from "@/lib/pen/canvasRenderer";
import { useCanvasFonts } from "@/lib/editor/useEditorFonts";

export interface PenCanvasPreviewHandle {
  getCanvas(): HTMLCanvasElement | null;
  /** Wait for the layout's font (with a timeout) and redraw: call before exporting. */
  prepareForExport(): Promise<void>;
}

interface PenCanvasPreviewProps {
  template: PenTemplate;
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

export const PenCanvasPreview = forwardRef<
  PenCanvasPreviewHandle,
  PenCanvasPreviewProps
>(function PenCanvasPreview(
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

  const { resolvedFont, fontsTick, prepare } = useCanvasFonts(fontFamily, text);

  const render = useCallback(() => {
    if (!canvasRef.current) return;
    renderPenLayout(canvasRef.current, {
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
    fontsTick,
  ]);

  const renderRef = useRef(render);
  useEffect(() => {
    renderRef.current = render;
    render();
  }, [render]);

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    // Export draws the latest state with its font loaded (never the fallback).
    prepareForExport: async () => {
      await prepare();
      renderRef.current();
    },
  }), [prepare]);

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
