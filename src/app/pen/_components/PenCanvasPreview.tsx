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
import type { DrawablePhoto } from "@/lib/design/canvasPrimitives";
import { loadWorkingPhoto } from "@/lib/design/workingImage";

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


function closeBitmaps(imgs: readonly DrawablePhoto[]): void {
  for (const b of imgs) if (typeof ImageBitmap !== "undefined" && b instanceof ImageBitmap) b.close();
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
  const [images, setImages] = useState<DrawablePhoto[]>([]);

  useEffect(() => {
    if (canvasRef.current && onCanvasReady) {
      onCanvasReady(canvasRef.current);
    }
  }, [onCanvasReady]);

  // Photos as working copies sized for the print canvas (decoded off the main thread):
  // the print file is this canvas, so nothing is lost; the photo URLs stay the originals.
  const canvasW: number = template.canvasWidth;
  const canvasH: number = template.canvasHeight;
  const shown = useRef<DrawablePhoto[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(photoUrls.map((u) => loadWorkingPhoto(u, canvasW, canvasH)))
      .then((imgs) => {
        if (cancelled) {
          closeBitmaps(imgs);
          return;
        }
        const prev = shown.current;
        shown.current = imgs;
        setImages(imgs);
        // Released once the canvas has redrawn from the new set.
        setTimeout(() => closeBitmaps(prev), 1000);
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [photoUrls, canvasW, canvasH]);

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
