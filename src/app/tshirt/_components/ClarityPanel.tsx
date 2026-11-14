"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Layer, Measure } from "@/lib/tshirt/tshirtLayers";
import { TSHIRT_SIDES, printClarity, printedDpi, type TshirtSide } from "@/lib/tshirt/tshirtRules";
import { renderCloseUp, type FontResolver } from "@/lib/tshirt/renderSide";
import { layersBounds } from "@/lib/tshirt/tshirtRegion";

export type ClarityLabels = {
  realSizeTitle: string;
  realSizeHint: string;
  front: string;
  back: string;
  sleeveLeft: string;
  sleeveRight: string;
  dragToSee: string;
};

/** CSS px per cm on a normal screen (96 px per inch). */
const SCREEN_PX_PER_CM = 96 / 2.54;

/**
 * Previzualizare: a close-up of the design at about its real size, enlarged the
 * same way as the print file (opens on the least sharp picture).
 */
export function ClarityPanel({
  layers,
  shirtColor,
  resolveFont,
  measure,
  labels: s,
}: {
  layers: Record<TshirtSide, Layer[]>;
  shirtColor: string;
  resolveFont: FontResolver;
  measure: Measure;
  labels: ClarityLabels;
}) {
  const items = useMemo(
    () =>
      TSHIRT_SIDES.flatMap((side) =>
        layers[side].map((l) => {
          const dpi = l.kind === "image" && !l.vector ? printedDpi(l.naturalW, l.widthCm) : null;
          return { side, layer: l, dpi, clarity: dpi === null ? null : printClarity(dpi) };
        }),
      ),
    [layers],
  );
  // look first at the least clear picture
  const worst = useMemo(
    () => [...items].filter((i) => i.dpi !== null).sort((a, b) => a.dpi! - b.dpi!)[0] ?? items[0] ?? null,
    [items],
  );
  const [focusId, setFocusId] = useState<string | null>(null);
  const focus = items.find((i) => i.layer.id === focusId) ?? worst;

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Drag to look around the whole design at real size: `pan` (cm) moves the middle of the view;
  // while dragging the picture just slides (`slide`, px), it is redrawn when the finger lifts.
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [slide, setSlide] = useState<{ x: number; y: number } | null>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const focusKey = focus ? focus.layer.id : "";
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [focusKey]);
  /** Keep the middle of the view on the side's design (plus a little air). */
  const clampPan = (p: { x: number; y: number }) => {
    if (!focus) return p;
    const b = layersBounds(layers[focus.side], measure);
    if (!b) return p;
    const cx = focus.layer.cx + p.x;
    const cy = focus.layer.cy + p.y;
    const x = Math.min(Math.max(cx, b.x - 2), b.x + b.w + 2) - focus.layer.cx;
    const y = Math.min(Math.max(cy, b.y - 2), b.y + b.h + 2) - focus.layer.cy;
    return { x, y };
  };
  const onDown = (e: React.PointerEvent) => {
    dragFrom.current = { x: e.clientX, y: e.clientY };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic pointer
    }
    setSlide({ x: 0, y: 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragFrom.current;
    if (!d) return;
    setSlide({ x: e.clientX - d.x, y: e.clientY - d.y });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragFrom.current;
    dragFrom.current = null;
    if (!d) return;
    const dx = (e.clientX - d.x) / SCREEN_PX_PER_CM;
    const dy = (e.clientY - d.y) / SCREEN_PX_PER_CM;
    setPan((p) => clampPan({ x: p.x - dx, y: p.y - dy }));
    setSlide(null);
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box || !focus) return;
    const dpr = window.devicePixelRatio || 1;
    // draw off-screen, show only the latest finished drawing (pictures load asynchronously)
    let current = true;
    const off = document.createElement("canvas");
    off.width = Math.round(box.clientWidth * dpr);
    off.height = Math.round(box.clientHeight * dpr);
    renderCloseUp(off, layers[focus.side], { x: focus.layer.cx + pan.x, y: focus.layer.cy + pan.y }, SCREEN_PX_PER_CM * dpr, shirtColor, resolveFont, measure)
      .then(() => {
        if (!current) return;
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext("2d")?.drawImage(off, 0, 0);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [focus, layers, shirtColor, resolveFont, measure, pan]);

  if (items.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3 text-left">
      {focus && (
        <>
          <p className="text-sm font-semibold text-gray-900">{s.realSizeTitle}</p>
          <div
            ref={boxRef}
            className="relative mt-1 h-80 w-full cursor-grab touch-none select-none overflow-hidden rounded-lg border border-gray-200 active:cursor-grabbing"
            style={{ backgroundColor: shirtColor }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            data-closeup
          >
            <canvas
              ref={canvasRef}
              className="h-full w-full"
              style={slide ? { transform: `translate(${slide.x}px, ${slide.y}px)` } : undefined}
            />
            <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-gray-600 shadow-sm">
              {s.dragToSee}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-gray-400">{s.realSizeHint}</p>
          {items.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {items.map((i) => (
                <button
                  key={i.layer.id}
                  type="button"
                  onClick={() => setFocusId(i.layer.id)}
                  className={cn(
                    "max-w-[12rem] truncate rounded-full border px-2.5 py-0.5 text-[11px]",
                    focus?.layer.id === i.layer.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700",
                  )}
                >
                  {({ front: s.front, back: s.back, sleeve_left: s.sleeveLeft, sleeve_right: s.sleeveRight })[i.side] + " · "}
                  {i.layer.kind === "image" ? i.layer.fileName : i.layer.text.replace(/\n/g, " ")}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
