"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderDesignDoc } from "@/lib/design/renderer";
import { ensureDesignFontsLoaded, resolveDesignFontFamily } from "@/lib/design/fonts";
import { useDesignImages } from "@/lib/design/useDesignImages";
import { useDesignEditor } from "@/lib/design/editorStore";
import type { DesignElement } from "@/lib/design/doc";
import {
  pointInRotatedRect,
  rectAxisStops,
  resizeRotatedRect,
  rotationFromPointer,
  snapAxis,
  RESIZE_HANDLES,
  type Point,
  type Rect,
  type ResizeHandle,
} from "@/lib/design/geometry";

/** Snap distance in screen pixels, converted to doc units per zoom level. */
const SNAP_SCREEN_PX = 6;
const ROTATE_HANDLE_OFFSET_SCREEN_PX = 28;

type Interaction =
  | { kind: "none" }
  | { kind: "move"; id: string; startPointer: Point; startRect: Rect }
  | {
      kind: "resize";
      id: string;
      handle: ResizeHandle;
      rotation: number;
      startRect: Rect;
    }
  | { kind: "rotate"; id: string; rect: Rect };

interface Guides {
  x: number | null;
  y: number | null;
}

interface DesignCanvasProps {
  docWidth: number;
  docHeight: number;
  /** Canvas pixels per doc pixel, chosen by the parent from available space. */
  scale: number;
  /** Exposes the offscreen full-resolution export canvas to the parent. */
  onExportCanvasReady?: (getCanvas: () => HTMLCanvasElement | null) => void;
}

export default function DesignCanvas({
  docWidth,
  docHeight,
  scale,
  onExportCanvasReady,
}: DesignCanvasProps) {
  const doc = useDesignEditor((s) => s.doc);
  const selectedId = useDesignEditor((s) => s.selectedId);
  const editingTextId = useDesignEditor((s) => s.editingTextId);
  const select = useDesignEditor((s) => s.select);
  const setEditingText = useDesignEditor((s) => s.setEditingText);
  const updateElement = useDesignEditor((s) => s.updateElement);
  const beginInteraction = useDesignEditor((s) => s.beginInteraction);
  const removeElement = useDesignEditor((s) => s.removeElement);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction>({ kind: "none" });
  const [guides, setGuides] = useState<Guides>({ x: null, y: null });
  const [fontsReady, setFontsReady] = useState(false);

  const { images } = useDesignImages(doc);

  useEffect(() => {
    let cancelled = false;
    void ensureDesignFontsLoaded(doc).then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  // ---- rendering ---------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderDesignDoc(canvas, {
      doc,
      docWidth,
      docHeight,
      scale,
      images,
      resolveFontFamily: resolveDesignFontFamily,
      showPlaceholders: true,
    });
    // `fontsReady` is a render trigger: once webfonts finish loading the same
    // document must be painted again with the real glyphs.
  }, [doc, docWidth, docHeight, scale, images, fontsReady]);

  const getExportCanvas = useCallback((): HTMLCanvasElement | null => {
    const offscreen = document.createElement("canvas");
    renderDesignDoc(offscreen, {
      doc,
      docWidth,
      docHeight,
      scale: 1,
      images,
      resolveFontFamily: resolveDesignFontFamily,
      showPlaceholders: false,
    });
    return offscreen;
  }, [doc, docWidth, docHeight, images]);

  useEffect(() => {
    onExportCanvasReady?.(getExportCanvas);
  }, [onExportCanvasReady, getExportCanvas]);

  // ---- pointer helpers ---------------------------------------------------

  const toDocPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const surface = surfaceRef.current;
      if (!surface) return { x: 0, y: 0 };
      const box = surface.getBoundingClientRect();
      return {
        x: (clientX - box.left) / scale,
        y: (clientY - box.top) / scale,
      };
    },
    [scale],
  );

  const hitTest = useCallback(
    (p: Point): DesignElement | null => {
      for (let i = doc.elements.length - 1; i >= 0; i--) {
        const el = doc.elements[i];
        if (el.locked) continue;
        if (pointInRotatedRect(p, el, el.rotation)) return el;
      }
      return null;
    },
    [doc.elements],
  );

  const selectedElement = useMemo(
    () => doc.elements.find((el) => el.id === selectedId) ?? null,
    [doc.elements, selectedId],
  );

  /** Guide coordinates from the canvas edges/centre and all other elements. */
  const snapTargets = useMemo(() => {
    const xs = [0, docWidth / 2, docWidth];
    const ys = [0, docHeight / 2, docHeight];
    for (const el of doc.elements) {
      if (el.id === selectedId) continue;
      xs.push(...rectAxisStops(el, "x"));
      ys.push(...rectAxisStops(el, "y"));
    }
    return { xs, ys };
  }, [doc.elements, selectedId, docWidth, docHeight]);

  // ---- interaction -------------------------------------------------------

  const handleSurfacePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const p = toDocPoint(event.clientX, event.clientY);
      const hit = hitTest(p);

      if (!hit) {
        select(null);
        return;
      }

      select(hit.id);
      beginInteraction();
      interactionRef.current = {
        kind: "move",
        id: hit.id,
        startPointer: p,
        startRect: { x: hit.x, y: hit.y, width: hit.width, height: hit.height },
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [toDocPoint, hitTest, select, beginInteraction],
  );

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, handle: ResizeHandle) => {
      if (!selectedElement) return;
      event.stopPropagation();
      beginInteraction();
      interactionRef.current = {
        kind: "resize",
        id: selectedElement.id,
        handle,
        rotation: selectedElement.rotation,
        startRect: {
          x: selectedElement.x,
          y: selectedElement.y,
          width: selectedElement.width,
          height: selectedElement.height,
        },
      };
      (event.target as Element).setPointerCapture?.(event.pointerId);
    },
    [selectedElement, beginInteraction],
  );

  const startRotate = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!selectedElement) return;
      event.stopPropagation();
      beginInteraction();
      interactionRef.current = {
        kind: "rotate",
        id: selectedElement.id,
        rect: {
          x: selectedElement.x,
          y: selectedElement.y,
          width: selectedElement.width,
          height: selectedElement.height,
        },
      };
      (event.target as Element).setPointerCapture?.(event.pointerId);
    },
    [selectedElement, beginInteraction],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const interaction = interactionRef.current;
      if (interaction.kind === "none") return;

      const p = toDocPoint(event.clientX, event.clientY);
      const snapThreshold = SNAP_SCREEN_PX / scale;

      if (interaction.kind === "move") {
        const dx = p.x - interaction.startPointer.x;
        const dy = p.y - interaction.startPointer.y;
        let nextX = interaction.startRect.x + dx;
        let nextY = interaction.startRect.y + dy;

        const proposed: Rect = {
          x: nextX,
          y: nextY,
          width: interaction.startRect.width,
          height: interaction.startRect.height,
        };
        const snapX = snapAxis(rectAxisStops(proposed, "x"), snapTargets.xs, snapThreshold);
        const snapY = snapAxis(rectAxisStops(proposed, "y"), snapTargets.ys, snapThreshold);
        if (snapX) nextX += snapX.delta;
        if (snapY) nextY += snapY.delta;
        setGuides({ x: snapX?.guide ?? null, y: snapY?.guide ?? null });

        updateElement(
          interaction.id,
          { x: Math.round(nextX), y: Math.round(nextY) },
          { history: false },
        );
        return;
      }

      if (interaction.kind === "resize") {
        const next = resizeRotatedRect(
          interaction.startRect,
          interaction.rotation,
          interaction.handle,
          p,
          { keepRatio: event.shiftKey, minSize: 16 },
        );
        updateElement(
          interaction.id,
          {
            x: Math.round(next.x),
            y: Math.round(next.y),
            width: Math.max(16, Math.round(next.width)),
            height: Math.max(16, Math.round(next.height)),
          },
          { history: false },
        );
        return;
      }

      const rotation = rotationFromPointer(interaction.rect, p);
      updateElement(interaction.id, { rotation }, { history: false });
    },
    [toDocPoint, scale, snapTargets, updateElement],
  );

  const endInteraction = useCallback(() => {
    interactionRef.current = { kind: "none" };
    setGuides({ x: null, y: null });
  }, []);

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const p = toDocPoint(event.clientX, event.clientY);
      const hit = hitTest(p);
      if (hit && hit.kind === "text") {
        select(hit.id);
        setEditingText(hit.id);
      }
    },
    [toDocPoint, hitTest, select, setEditingText],
  );

  // ---- keyboard ----------------------------------------------------------

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!selectedId || editingTextId) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeElement(selectedId);
        return;
      }

      const step = event.shiftKey ? 20 : 2;
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const delta = deltas[event.key];
      if (!delta) return;

      event.preventDefault();
      const element = doc.elements.find((el) => el.id === selectedId);
      if (!element) return;
      updateElement(selectedId, {
        x: element.x + delta[0],
        y: element.y + delta[1],
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, editingTextId, doc.elements, removeElement, updateElement]);

  // ---- render ------------------------------------------------------------

  const surfaceStyle: React.CSSProperties = {
    width: docWidth * scale,
    height: docHeight * scale,
  };

  return (
    <div
      ref={surfaceRef}
      className="relative touch-none select-none shadow-lg ring-1 ring-gray-300"
      style={surfaceStyle}
      onPointerDown={handleSurfacePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
      onDoubleClick={handleDoubleClick}
    >
      {/* Checkerboard shows through transparent backgrounds. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {guides.x !== null && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-pink-500"
          style={{ left: guides.x * scale }}
        />
      )}
      {guides.y !== null && (
        <div
          className="pointer-events-none absolute right-0 left-0 h-px bg-pink-500"
          style={{ top: guides.y * scale }}
        />
      )}

      {selectedElement && !editingTextId && (
        <SelectionFrame
          element={selectedElement}
          scale={scale}
          onResizeStart={startResize}
          onRotateStart={startRotate}
        />
      )}

      {selectedElement?.kind === "text" && editingTextId === selectedElement.id && (
        <InlineTextEditor element={selectedElement} scale={scale} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selection frame
// ---------------------------------------------------------------------------

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

const HANDLE_POSITION: Record<ResizeHandle, { left: string; top: string }> = {
  nw: { left: "0%", top: "0%" },
  n: { left: "50%", top: "0%" },
  ne: { left: "100%", top: "0%" },
  e: { left: "100%", top: "50%" },
  se: { left: "100%", top: "100%" },
  s: { left: "50%", top: "100%" },
  sw: { left: "0%", top: "100%" },
  w: { left: "0%", top: "50%" },
};

function SelectionFrame({
  element,
  scale,
  onResizeStart,
  onRotateStart,
}: {
  element: DesignElement;
  scale: number;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>, handle: ResizeHandle) => void;
  onRotateStart: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: element.x * scale,
        top: element.y * scale,
        width: element.width * scale,
        height: element.height * scale,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: "center center",
      }}
    >
      <div className="absolute inset-0 border-2 border-blue-500" />

      <div
        className="pointer-events-auto absolute h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border-2 border-blue-500 bg-white"
        style={{ left: "50%", top: -ROTATE_HANDLE_OFFSET_SCREEN_PX }}
        onPointerDown={onRotateStart}
        title="Повернуть"
      />

      {RESIZE_HANDLES.map((handle) => (
        <div
          key={handle}
          className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-blue-500 bg-white"
          style={{ ...HANDLE_POSITION[handle], cursor: HANDLE_CURSORS[handle] }}
          onPointerDown={(event) => onResizeStart(event, handle)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline text editing
// ---------------------------------------------------------------------------

function InlineTextEditor({
  element,
  scale,
}: {
  element: Extract<DesignElement, { kind: "text" }>;
  scale: number;
}) {
  const updateElement = useDesignEditor((s) => s.updateElement);
  const setEditingText = useDesignEditor((s) => s.setEditingText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);

  const family = resolveDesignFontFamily(element.fontId);

  return (
    <textarea
      ref={textareaRef}
      value={element.text}
      onChange={(e) => updateElement(element.id, { text: e.target.value }, { history: false })}
      onBlur={() => setEditingText(null)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setEditingText(null);
        }
      }}
      className="absolute resize-none overflow-hidden border-2 border-blue-500 bg-white/10 outline-none"
      style={{
        left: element.x * scale,
        top: element.y * scale,
        width: element.width * scale,
        height: element.height * scale,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: "center center",
        fontFamily: `"${family}", sans-serif`,
        fontSize: element.fontSizePx * scale,
        fontWeight: element.fontWeight,
        fontStyle: element.italic ? "italic" : "normal",
        lineHeight: element.lineHeight,
        letterSpacing: element.letterSpacingPx * scale,
        color: element.color,
        textAlign: element.align,
        textTransform: element.uppercase ? "uppercase" : "none",
        padding: 0,
      }}
    />
  );
}
