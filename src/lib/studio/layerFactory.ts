import {
  mmToPt,
  rectsIntersect,
  type Rect,
  studioId,
  type StudioImageLayer,
  type StudioImageSrc,
  type StudioQrLayer,
  type StudioShapeLayer,
  type StudioSurface,
  type StudioTextLayer,
} from "./document";

/**
 * New layers placed in the middle of a surface, sized for it (a mug wrap is
 * 96 mm high, a pen barrel 15 mm). Text boxes start with a rough size; the
 * editor re-measures them with the real font. Pure.
 */

type Area = Pick<StudioSurface, "widthMm" | "heightMm">;

export type TextPreset = "title" | "subtitle" | "body" | "arc";

/** Text size for a preset: a share of the area's height, in pt (title 22 %, subtitle 12 %, body 7 %). */
export function presetSizePt(area: Area, preset: TextPreset): number {
  const share: number = preset === "title" ? 0.22 : preset === "arc" ? 0.16 : preset === "subtitle" ? 0.12 : 0.07;
  const mm: number = Math.max(1.8, area.heightMm * share);
  return Math.round(mmToPt(mm) * 2) / 2;
}

export function newTextLayer(area: Area, preset: TextPreset, text: string, fontFamily = "Montserrat"): StudioTextLayer {
  const sizePt: number = presetSizePt(area, preset);
  const sizeMm: number = (sizePt * 25.4) / 72;
  const w: number = Math.min(area.widthMm * 0.9, Math.max(sizeMm * 2, text.length * sizeMm * 0.6));
  const h: number = sizeMm * (preset === "arc" ? 1.8 : 1.3);
  return {
    id: studioId(),
    kind: "text",
    x: (area.widthMm - w) / 2,
    y: (area.heightMm - h) / 2,
    w,
    h,
    rotation: 0,
    text,
    fontFamily: preset === "title" ? "Playfair Display" : fontFamily,
    bold: preset !== "body",
    sizePt,
    color: "#14213d",
    align: "center",
    lineHeight: 1.2,
    ...(preset === "arc" ? { arcDeg: 90 } : {}),
  };
}

/** A photo (or an empty placeholder) fitting ~60 % of the area height, aspect kept. */
export function newImageLayer(area: Area, src: StudioImageSrc | null, mask: StudioImageLayer["mask"] = "rect"): StudioImageLayer {
  const ratio: number = src ? src.naturalW / src.naturalH : 1;
  let h: number = area.heightMm * 0.6;
  let w: number = h * ratio;
  if (w > area.widthMm * 0.8) {
    w = area.widthMm * 0.8;
    h = w / ratio;
  }
  if (mask === "circle" || mask === "heart") w = h = Math.min(w, h);
  return {
    id: studioId(),
    kind: "image",
    x: (area.widthMm - w) / 2,
    y: (area.heightMm - h) / 2,
    w,
    h,
    rotation: 0,
    src,
    mask,
    crop: { zoom: 1, ox: 0, oy: 0 },
  };
}

export function newShapeLayer(area: Area, shape: StudioShapeLayer["shape"], fill = "#c9a227"): StudioShapeLayer {
  const side: number = Math.min(area.widthMm, area.heightMm) * 0.35;
  const w: number = shape === "line" ? area.widthMm * 0.5 : shape === "balloon" ? side * 0.7 : side;
  const h: number = shape === "line" ? Math.max(0.3, area.heightMm * 0.015) : side;
  return {
    id: studioId(),
    kind: "shape",
    shape,
    x: (area.widthMm - w) / 2,
    y: (area.heightMm - h) / 2,
    w,
    h,
    rotation: 0,
    fill,
    stroke: null,
    strokeMm: 0,
  };
}

/** Default QR side: 25 mm, or what fits the area (pen barrel). */
export function qrSideMm(area: Area): number {
  return Math.min(25, area.heightMm * 0.9, area.widthMm * 0.9);
}

export function newQrLayer(area: Area, qr: StudioQrLayer["qr"], color = "#000000", background: string | null = "#ffffff"): StudioQrLayer {
  const s: number = qrSideMm(area);
  return {
    id: studioId(),
    kind: "qr",
    x: (area.widthMm - s) / 2,
    y: (area.heightMm - s) / 2,
    w: s,
    h: s,
    rotation: 0,
    qr,
    color,
    background,
  };
}

/**
 * Move a new layer off the ones already in the middle: the first free spot
 * among centre, below, above, left, right (inside the area); else unchanged.
 */
export function placeFree<L extends Pick<StudioSurface["layers"][number], "x" | "y" | "w" | "h">>(
  layer: L,
  others: readonly Rect[],
  area: Area,
): L {
  const gap = 2;
  const cands: [number, number][] = [
    [0, 0],
    [0, layer.h + gap],
    [0, -(layer.h + gap)],
    [0, 2 * (layer.h + gap)],
    [0, -2 * (layer.h + gap)],
    [-(layer.w + gap), 0],
    [layer.w + gap, 0],
  ];
  for (const [dx, dy] of cands) {
    const x = layer.x + dx;
    const y = layer.y + dy;
    if (x < 0 || y < 0 || x + layer.w > area.widthMm || y + layer.h > area.heightMm) continue;
    const r: Rect = { x, y, w: layer.w, h: layer.h };
    if (!others.some((o) => rectsIntersect(o, r))) return { ...layer, x, y };
  }
  return layer;
}
