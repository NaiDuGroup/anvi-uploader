"use client";

import Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Layer, Line, Rect, Shape, Stage, Text, Transformer } from "react-konva";
import {
  layerBounds,
  panCrop,
  updateLayer,
  type StudioDoc,
  type StudioImageLayer,
  type StudioLayer,
  type StudioSurface,
} from "@/lib/studio/document";
import { fitTextBox } from "@/lib/studio/fonts";
import { drawLayerLocal, type StudioRenderAssets } from "@/lib/studio/render";
import { canvasMargin, fitCanvas, selectionPadding, type CanvasReserve } from "@/lib/studio/canvasFit";
import { mugViewZones } from "@/lib/studio/mugViews";
import { snapBox, snapTargets, type SnapLine } from "@/lib/studio/snap";
import type { StudioSurfaceSpec } from "@/lib/studio/surfaces";

/**
 * The Studio canvas (react-konva). The world group is in millimetres of the
 * print area; every layer is a Konva `Shape` that draws itself with the same
 * renderer as the print export (`drawLayerLocal`), so the canvas is exactly
 * the print file plus the guides drawn on top (print area, trim margin, safe
 * zone, mug handle and seam), which are never exported.
 *
 * Redraws only when React re-renders it (a document, selection, view or
 * asset change): nothing runs per frame.
 */

export interface StudioCanvasLabels {
  bleed: string;
  safeZone: string;
  handle: string;
  seam: string;
  center: string;
  photoPlaceholder: string;
  /** Mug: names of the three wrap zones (left / centre / right), drawn faintly under the strip. */
  zones?: readonly [string, string, string];
}

export interface StudioCanvasProps {
  doc: StudioDoc;
  spec: StudioSurfaceSpec;
  assets: StudioRenderAssets;
  /** Changes when photos / fonts finished loading: redraw. */
  redrawKey: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** A finished edit (`tag` coalesces steps of one gesture). */
  onChange: (doc: StudioDoc, tag?: string) => void;
  /** Product surface colour shown under a transparent design (not exported). */
  productColor: string | null;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  /** Crop mode for the selected photo: drags pan the photo inside its mask. */
  cropMode: boolean;
  labels: StudioCanvasLabels;
  /** Tap on an empty photo placeholder. */
  onRequestPhoto: (layerId: string) => void;
  /** Double click / double tap on a text. */
  onEditText: (layerId: string) => void;
  /** A photo file dropped on the canvas (onto a layer or the empty area). */
  onDropFile?: (file: File, layerId: string | null) => void;
  /** Bigger handles (touch screens). */
  touch?: boolean;
  /** Corner taken by a floating card (the 3D preview dock): the print area is fitted clear of it. */
  reserve?: CanvasReserve | null;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;
const SNAP_PX = 6;
const MARGIN_PX = 30;
const BLUE = "#2f6fed";
const MAGENTA = "#d63384";
const RED = "#c0392b";

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

type NativeCtx = CanvasRenderingContext2D;
const nativeOf = (ctx: Konva.Context): NativeCtx => (ctx as unknown as { _context: NativeCtx })._context;

function touchDist(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
function touchAngle(a: Touch, b: Touch): number {
  return (Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180) / Math.PI;
}

export function StudioCanvas(props: StudioCanvasProps) {
  const { doc, spec, assets, redrawKey, selectedId, onSelect, onChange, productColor, zoom, onZoomChange, cropMode, labels, touch, reserve } = props;
  const surface: StudioSurface = doc.surfaces.find((s) => s.id === spec.id) ?? doc.surfaces[0]!;
  const W: number = surface.widthMm;
  const H: number = surface.heightMm;

  // ─── Size + view ───────────────────────────────────────────────────────
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    Konva.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    Konva.hitOnDragEnabled = true;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const [panRaw, setPan] = useState({ x: 0, y: 0 });
  const pan = zoom <= 1 ? { x: 0, y: 0 } : panRaw;
  const placed = size.w > 0 && size.h > 0 ? fitCanvas(size, { w: W, h: H }, canvasMargin({ w: W, h: H }, !!touch, MARGIN_PX), reserve) : { fit: 1, cx: size.w / 2, cy: size.h / 2 };
  const scale: number = placed.fit * zoom;
  const ox: number = placed.cx - (W * scale) / 2 + pan.x;
  const oy: number = placed.cy - (H * scale) / 2 + pan.y;

  // ─── Selection / transformer ───────────────────────────────────────────
  const nodes = useRef(new Map<string, Konva.Shape>());
  const trRef = useRef<Konva.Transformer>(null);
  const selected: StudioLayer | null = surface.layers.find((l) => l.id === selectedId) ?? null;
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selected && !selected.hidden ? nodes.current.get(selected.id) : undefined;
    tr.nodes(node && !selected?.locked && !cropMode ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selected, cropMode, doc, scale, redrawKey]);

  // ─── Arrow keys nudge the selection: 1 px of the screen, Shift 10 px (one undo step per run) ──
  const nudgeRef = useRef({ doc, selected, scale, onChange });
  useEffect(() => {
    nudgeRef.current = { doc, selected, scale, onChange };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!dir || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      // Not while typing (the text field, inputs, sliders, selects).
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || el.closest('[role="slider"],[role="radiogroup"],[role="tablist"],[role="listbox"],[role="menu"],[role="dialog"]'))) return;
      // Not under an open dialog (the 3D preview, the quality list).
      if (document.querySelector('[aria-modal="true"]')) return;
      const { doc: d, selected: l, scale: sc, onChange: change } = nudgeRef.current;
      if (!l || l.locked || l.hidden || sc <= 0) return;
      e.preventDefault();
      const step: number = (e.shiftKey ? 10 : 1) / sc;
      change(updateLayer(d, l.id, { x: l.x + dir[0]! * step, y: l.y + dir[1]! * step }), `nudge:${l.id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ─── Snapping guides while dragging ────────────────────────────────────
  const [guides, setGuides] = useState<{ x: SnapLine[]; y: SnapLine[] }>({ x: [], y: [] });
  const wasCentered = useRef(false);
  const targetsFor = useCallback(
    (id: string) =>
      snapTargets(
        surface,
        surface.layers.filter((l) => l.id !== id && !l.hidden).map((l) => layerBounds(l)),
      ),
    [surface],
  );

  const onDragMove = (l: StudioLayer, e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const x: number = node.x() - l.w / 2;
    const y: number = node.y() - l.h / 2;
    const s = snapBox(layerBounds({ x, y, w: l.w, h: l.h, rotation: node.rotation() }), targetsFor(l.id), SNAP_PX / scale);
    node.x(node.x() + s.dx);
    node.y(node.y() + s.dy);
    setGuides(s.guides);
    if (s.centered && !wasCentered.current && touch) navigator.vibrate?.(10);
    wasCentered.current = s.centered;
  };
  const onDragEnd = (l: StudioLayer, e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    setGuides({ x: [], y: [] });
    wasCentered.current = false;
    onChange(updateLayer(doc, l.id, { x: node.x() - l.w / 2, y: node.y() - l.h / 2 }), `move:${l.id}`);
  };

  const onTransformEnd = (l: StudioLayer, e: Konva.KonvaEventObject<Event>) => {
    const node = e.target as Konva.Shape;
    const sx: number = Math.abs(node.scaleX());
    const sy: number = Math.abs(node.scaleY());
    node.scaleX(1);
    node.scaleY(1);
    const cx: number = node.x();
    const cy: number = node.y();
    const rotation: number = Math.round(node.rotation() * 100) / 100;
    if (l.kind === "text") {
      const k: number = (sx + sy) / 2;
      const next = fitTextBox({
        ...l,
        rotation,
        sizePt: Math.max(2, Math.round(l.sizePt * k * 10) / 10),
        ...(l.stroke ? { stroke: { ...l.stroke, widthMm: Math.max(0.05, l.stroke.widthMm * k) } } : {}),
        ...(l.shadow ? { shadow: { ...l.shadow, blurMm: l.shadow.blurMm * k, dxMm: l.shadow.dxMm * k, dyMm: l.shadow.dyMm * k } } : {}),
      });
      onChange(updateLayer(doc, l.id, { ...next, x: cx - next.w / 2, y: cy - next.h / 2 }), `transform:${l.id}`);
      return;
    }
    const w: number = Math.max(0.5, l.w * sx);
    const h: number = Math.max(0.5, l.h * sy);
    onChange(updateLayer(doc, l.id, { x: cx - w / 2, y: cy - h / 2, w, h, rotation }), `transform:${l.id}`);
  };

  // ─── Crop mode: drag pans the photo inside its mask, wheel / pinch zooms it ──
  const cropDrag = useRef<{ x: number; y: number; layer: StudioImageLayer } | null>(null);
  const cropBy = (layer: StudioImageLayer, dxPx: number, dyPx: number) => {
    if (!layer.src) return;
    const rot: number = (-layer.rotation * Math.PI) / 180;
    const dx: number = dxPx / scale;
    const dy: number = dyPx / scale;
    const lx: number = dx * Math.cos(rot) - dy * Math.sin(rot);
    const ly: number = dx * Math.sin(rot) + dy * Math.cos(rot);
    onChange(updateLayer(doc, layer.id, { crop: panCrop(layer, layer.src.naturalW, layer.src.naturalH, lx, ly) }), `crop:${layer.id}`);
  };
  const zoomCrop = (layer: StudioImageLayer, factor: number) => {
    const zoomV: number = Math.max(1, Math.min(10, layer.crop.zoom * factor));
    onChange(updateLayer(doc, layer.id, { crop: { ...layer.crop, zoom: zoomV } }), `cropzoom:${layer.id}`);
  };

  // ─── Pointer on the stage: pan the view, crop drag ─────────────────────
  const panDrag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const onStageDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const t = e.target;
    const isEmpty: boolean = t === t.getStage() || t.name() === "bg";
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    if (cropMode && selected?.kind === "image" && (t.id() === selected.id || isEmpty)) {
      cropDrag.current = { x: pos.x, y: pos.y, layer: selected };
      return;
    }
    if (isEmpty) {
      onSelect(null);
      if (zoom > 1) panDrag.current = { x: pos.x, y: pos.y, px: pan.x, py: pan.y };
    }
  };
  const onStageMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos || pinch.current) return;
    if (cropDrag.current) {
      const c = cropDrag.current;
      const cur = surface.layers.find((l) => l.id === c.layer.id);
      if (cur?.kind === "image") cropBy(cur, pos.x - c.x, pos.y - c.y);
      cropDrag.current = { ...c, x: pos.x, y: pos.y };
      return;
    }
    if (panDrag.current) {
      const p = panDrag.current;
      setPan({ x: p.px + pos.x - p.x, y: p.py + pos.y - p.y });
    }
  };
  const onStageUp = () => {
    cropDrag.current = null;
    panDrag.current = null;
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    if (cropMode && selected?.kind === "image") {
      e.evt.preventDefault();
      zoomCrop(selected, e.evt.deltaY < 0 ? 1.06 : 1 / 1.06);
      return;
    }
    if (e.evt.ctrlKey || e.evt.metaKey) {
      e.evt.preventDefault();
      onZoomChange(clampZoom(zoom * (e.evt.deltaY < 0 ? 1.08 : 1 / 1.08)));
    }
  };

  // ─── Two fingers: pinch + rotate the selected layer (or the view) ──────
  const pinch = useRef<{ d: number; a: number; layer: StudioLayer | null; zoom: number } | null>(null);
  const onTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const ts = e.evt.touches;
    if (ts.length !== 2) return;
    e.evt.preventDefault();
    nodes.current.forEach((n) => n.isDragging() && n.stopDrag());
    cropDrag.current = null;
    panDrag.current = null;
    const usable: StudioLayer | null = selected && !selected.locked ? selected : null;
    pinch.current = { d: touchDist(ts[0]!, ts[1]!), a: touchAngle(ts[0]!, ts[1]!), layer: usable, zoom };
  };
  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const ts = e.evt.touches;
    const p = pinch.current;
    if (!p || ts.length !== 2) return;
    e.evt.preventDefault();
    const k: number = touchDist(ts[0]!, ts[1]!) / Math.max(1, p.d);
    const da: number = touchAngle(ts[0]!, ts[1]!) - p.a;
    const l = p.layer;
    if (!l) {
      onZoomChange(clampZoom(p.zoom * k));
      return;
    }
    if (cropMode && l.kind === "image") {
      const zoomV: number = Math.max(1, Math.min(10, l.crop.zoom * k));
      onChange(updateLayer(doc, l.id, { crop: { ...l.crop, zoom: zoomV } }), `pinch:${l.id}`);
      return;
    }
    const cx: number = l.x + l.w / 2;
    const cy: number = l.y + l.h / 2;
    let rotation: number = l.rotation + da;
    for (const snapA of [0, 90, 180, 270, -90, -180, 360]) if (Math.abs(rotation - snapA) < 4) rotation = snapA;
    if (l.kind === "text") {
      const next = fitTextBox({ ...l, rotation, sizePt: Math.max(2, Math.min(600, l.sizePt * k)) });
      onChange(updateLayer(doc, l.id, { ...next, x: cx - next.w / 2, y: cy - next.h / 2 }), `pinch:${l.id}`);
    } else {
      const w: number = Math.max(1, l.w * k);
      const h: number = Math.max(1, l.h * k);
      onChange(updateLayer(doc, l.id, { x: cx - w / 2, y: cy - h / 2, w, h, rotation }), `pinch:${l.id}`);
    }
  };
  const onTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2) pinch.current = null;
  };

  // ─── Files dropped on the canvas ───────────────────────────────────────
  const stageRef = useRef<Konva.Stage>(null);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !props.onDropFile) return;
    const stage = stageRef.current;
    let target: string | null = null;
    if (stage) {
      stage.setPointersPositions(e.nativeEvent);
      const pos = stage.getPointerPosition();
      const hit = pos ? stage.getIntersection(pos) : null;
      if (hit && hit.id() && surface.layers.some((l) => l.id === hit.id() && l.kind === "image")) target = hit.id();
    }
    props.onDropFile(file, target);
  };

  // ─── Guides drawn over the design (never exported) ─────────────────────
  const px = (n: number) => n / scale;
  const hatch = useMemo(
    () =>
      function hatchScene(ctx: Konva.Context, shape: Konva.Shape) {
        const c = nativeOf(ctx);
        const w: number = shape.width();
        const h: number = shape.height();
        c.save();
        c.beginPath();
        c.rect(0, 0, w, h);
        c.clip();
        c.fillStyle = "rgba(20,33,61,0.08)";
        c.fillRect(0, 0, w, h);
        c.strokeStyle = "rgba(20,33,61,0.28)";
        c.lineWidth = shape.getAttr("lw") as number;
        const step: number = shape.getAttr("step") as number;
        c.beginPath();
        for (let d = -h; d < w + h; d += step) {
          c.moveTo(d, 0);
          c.lineTo(d + h, h);
        }
        c.stroke();
        c.restore();
      },
    [],
  );

  const placeholderLabel: string = labels.photoPlaceholder;
  const anchor: number = touch ? 18 : 10;
  // A thin layer (text on a pen): handles outside its box instead of over the letters.
  const selPad: number = selected ? selectionPadding(selected.h * scale, anchor) : 0;

  return (
    <div
      ref={boxRef}
      className="relative h-full w-full touch-none select-none"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      data-studio-canvas
    >
      {size.w > 0 ? (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          onMouseDown={onStageDown}
          onTouchStart={(e) => {
            onTouchStart(e);
            if (e.evt.touches.length === 1) onStageDown(e);
          }}
          onMouseMove={onStageMove}
          onTouchMove={(e) => {
            onTouchMove(e);
            if (e.evt.touches.length === 1) onStageMove(e);
          }}
          onMouseUp={onStageUp}
          onTouchEnd={(e) => {
            onTouchEnd(e);
            onStageUp();
          }}
          onWheel={onWheel}
        >
          {/* Product under the design + the design's background. */}
          <Layer listening={true}>
            <Rect name="bg" x={0} y={0} width={size.w} height={size.h} fill="rgba(0,0,0,0)" />
            <Group x={ox} y={oy} scaleX={scale} scaleY={scale} listening={false}>
              <Rect
                x={0}
                y={0}
                width={W}
                height={H}
                fill={productColor ?? "#ffffff"}
                shadowColor="rgba(20,33,61,0.18)"
                shadowBlur={24}
                shadowOffsetY={8}
              />
              {surface.background ? <Rect x={0} y={0} width={W} height={H} fill={surface.background} /> : null}
            </Group>
          </Layer>

          {/* Layers, clipped to the print area. */}
          <Layer>
            <Group x={ox} y={oy} scaleX={scale} scaleY={scale} clipX={0} clipY={0} clipWidth={W} clipHeight={H}>
              {surface.layers.map((l) =>
                l.hidden ? null : (
                  <Shape
                    key={l.id}
                    id={l.id}
                    ref={(n) => {
                      if (n) nodes.current.set(l.id, n);
                      else nodes.current.delete(l.id);
                    }}
                    x={l.x + l.w / 2}
                    y={l.y + l.h / 2}
                    offsetX={l.w / 2}
                    offsetY={l.h / 2}
                    width={l.w}
                    height={l.h}
                    rotation={l.rotation}
                    draggable={!l.locked && !(cropMode && l.id === selectedId)}
                    data-redraw={redrawKey}
                    sceneFunc={(ctx, shape) => {
                      const c = nativeOf(ctx);
                      const abs = shape.getAbsoluteScale();
                      c.save();
                      if (Math.abs(abs.x - abs.y) < 1e-3 && abs.x > 0) {
                        c.scale(1 / abs.x, 1 / abs.y);
                        drawLayerLocal(c, l, assets, { pxPerMm: abs.x, placeholders: true, placeholderLabel });
                      } else {
                        drawLayerLocal(c, l, assets, { pxPerMm: 1, placeholders: true, placeholderLabel });
                      }
                      c.restore();
                    }}
                    hitFunc={(ctx, shape) => {
                      ctx.beginPath();
                      ctx.rect(0, 0, l.w, l.h);
                      ctx.closePath();
                      ctx.fillStrokeShape(shape);
                    }}
                    onMouseDown={() => onSelect(l.id)}
                    onTouchStart={() => onSelect(l.id)}
                    onClick={() => {
                      if (l.kind === "image" && !l.src && !l.locked) props.onRequestPhoto(l.id);
                    }}
                    onTap={() => {
                      if (l.kind === "image" && !l.src && !l.locked) props.onRequestPhoto(l.id);
                    }}
                    onDblClick={() => l.kind === "text" && props.onEditText(l.id)}
                    onDblTap={() => l.kind === "text" && props.onEditText(l.id)}
                    onDragStart={() => onSelect(l.id)}
                    onDragMove={(e) => onDragMove(l, e)}
                    onDragEnd={(e) => onDragEnd(l, e)}
                    onTransformEnd={(e) => onTransformEnd(l, e)}
                  />
                ),
              )}
            </Group>
            <Transformer
              ref={trRef}
              rotateEnabled
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={4}
              keepRatio={selected?.kind !== "shape"}
              enabledAnchors={
                selected?.kind === "text" || selected?.kind === "qr"
                  ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                  : ["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"]
              }
              anchorSize={anchor}
              padding={selPad}
              anchorCornerRadius={3}
              anchorStroke={BLUE}
              anchorStrokeWidth={1.5}
              borderStroke={BLUE}
              borderStrokeWidth={1.5}
              rotateAnchorOffset={touch ? 34 : 26}
              ignoreStroke
              flipEnabled={false}
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8 ? oldBox : newBox)}
            />
          </Layer>

          {/* Guides: print area, trim margin, safe zone, mug handle + seam, snapping lines. */}
          <Layer listening={false}>
            <Group x={ox} y={oy} scaleX={scale} scaleY={scale}>
              {spec.zones.map((z, i) => (
                <Group key={`z${i}`}>
                  <Shape x={z.x} y={0} width={z.w} height={H} sceneFunc={hatch} lw={px(1)} step={px(8)} />
                  <Text
                    text={labels.handle}
                    x={z.x + z.w / 2 - px(6)}
                    y={H}
                    rotation={-90}
                    width={H}
                    align="center"
                    fontSize={px(11)}
                    fontStyle="800"
                    fill="#14213d"
                  />
                </Group>
              ))}
              {spec.seams.map((s, i) => (
                <Line key={`s${i}`} points={[s, -px(10), s, H + px(10)]} stroke="#14213d" strokeWidth={px(2)} dash={[px(2), px(3)]} />
              ))}
              {spec.seams.length ? (
                <Text text={labels.seam} x={0} y={H + px(12)} fontSize={px(11)} fontStyle="700" fill="#14213d" />
              ) : null}
              {labels.zones && spec.zones.length
                ? mugViewZones(spec).map((z, i) => {
                    // Faint, outside the print: ticks between the zones and the names under them (never printed).
                    const seamW: number = spec.seams.length ? px(11) * 0.62 * labels.seam.length + px(8) : 0;
                    const textW: number = px(10) * 0.62 * labels.zones![i]!.length;
                    const x0: number = i === 0 ? Math.max(z.x + z.w / 2 - textW / 2, seamW) : z.x + z.w / 2 - textW / 2;
                    return (
                      <Group key={`vz${i}`}>
                        {i > 0 ? <Line points={[z.x, H + px(2), z.x, H + px(9)]} stroke="rgba(20,33,61,0.35)" strokeWidth={px(1)} /> : null}
                        <Text text={labels.zones![i]!} x={x0} y={H + px(12)} fontSize={px(10)} fontStyle="600" fill="rgba(20,33,61,0.5)" />
                      </Group>
                    );
                  })
                : null}
              <Rect x={0} y={0} width={W} height={H} stroke="rgba(20,33,61,0.35)" strokeWidth={px(1)} />
              {surface.bleedMm > 0 ? (
                <>
                  <Rect
                    x={surface.bleedMm}
                    y={surface.bleedMm}
                    width={W - surface.bleedMm * 2}
                    height={H - surface.bleedMm * 2}
                    stroke={RED}
                    strokeWidth={px(1.2)}
                    dash={[px(5), px(4)]}
                  />
                  <Text text={labels.bleed} x={0} y={-px(17)} fontSize={px(11)} fontStyle="700" fill="#a82e22" />
                </>
              ) : null}
              <Rect
                x={surface.safeMm}
                y={surface.safeMm}
                width={W - surface.safeMm * 2}
                height={H - surface.safeMm * 2}
                stroke={BLUE}
                strokeWidth={px(1.2)}
                dash={[px(6), px(4)]}
              />
              <Text
                text={labels.safeZone}
                x={surface.safeMm + px(4)}
                // A low strip (pen): the label under the area instead of over the design.
                y={(H - surface.safeMm * 2) * scale < 48 ? H + px(4) : H - surface.safeMm - px(16)}
                fontSize={px(11)}
                fontStyle="700"
                fill="#1d4fbf"
              />
              {guides.x.map((g, i) => (
                <Line key={`gx${i}`} points={[g.at, -px(14), g.at, H + px(14)]} stroke={MAGENTA} strokeWidth={px(1.5)} dash={g.kind === "center" ? undefined : [px(4), px(3)]} />
              ))}
              {guides.y.map((g, i) => (
                <Line key={`gy${i}`} points={[-px(14), g.at, W + px(14), g.at]} stroke={MAGENTA} strokeWidth={px(1.5)} dash={g.kind === "center" ? undefined : [px(4), px(3)]} />
              ))}
              {guides.x.some((g) => g.kind === "center") ? (
                <Group x={W / 2 + px(5)} y={-px(14)}>
                  <Rect width={px(44)} height={px(16)} fill={MAGENTA} cornerRadius={px(3)} />
                  <Text text={labels.center} width={px(44)} height={px(16)} align="center" verticalAlign="middle" fontSize={px(10)} fontStyle="800" fill="#ffffff" />
                </Group>
              ) : null}
            </Group>
          </Layer>
        </Stage>
      ) : null}
    </div>
  );
}
