"use client";

/**
 * The designer's prints on Roly's garment photos (the same printing look as
 * the ANVI Studio): front, back and the two sides (sleeves). The result is
 * drawn un-stretched to the real proportions of the shown size
 * (`tshirtPhoto.ts`), optionally worn by the gold mannequin.
 */
import type { ApparelPhotoPrint, ApparelPhotoView } from "@/components/shop/studio/apparelPhoto";
import { composeApparelPhoto, cutOut, rasterCanvas } from "@/components/shop/studio/apparelPhoto";
import type { PhotoView, Raster, Rect } from "@/lib/studio/photoMockup";
import type { Layer, Measure } from "@/lib/tshirt/tshirtLayers";
import { renderAreaCanvas, type FontResolver } from "@/lib/tshirt/renderSide";
import { layersBounds } from "@/lib/tshirt/tshirtRegion";
import { isSleeve, type TshirtSide } from "@/lib/tshirt/tshirtRules";
import { photoHemCm, photoImageCm, photoViewOf, sleeveToPhotoCm, toStudioBox } from "@/lib/tshirt/tshirtPhoto";
import { MANNEQUIN_BOTTOM_CM, MANNEQUIN_TOP_CM, drawGoldMannequin } from "./goldMannequin";

/** Art resolution for the photo (the photo is ~11 px/cm). */
const ART_PX_PER_CM = 24;

type ComposeOpts = { sizeFactor: { x: number; y: number }; sleeveCm: number; resolveFont: FontResolver; measure: Measure };

function canvasRaster(c: HTMLCanvasElement): Raster {
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { width: d.width, height: d.height, data: d.data };
}

/** One side's design as a print on its view's photo, or null when empty. */
export async function sidePhotoPrint(side: TshirtSide, layers: Layer[], opts: ComposeOpts): Promise<ApparelPhotoPrint | null> {
  const b = layersBounds(layers, opts.measure);
  if (!b || layers.length === 0) return null;
  const art = await renderAreaCanvas(layers, b, ART_PX_PER_CM, opts.resolveFont, opts.measure);
  const f = opts.sizeFactor;
  const view = photoViewOf(side);
  let box: Rect;
  if (!isSleeve(side)) {
    box = { x: b.x / f.x, y: b.y / f.y, w: b.w / f.x, h: b.h / f.y };
  } else {
    // On the side photo, centred on the sleeve.
    const [cx, cy] = sleeveToPhotoCm(b.x + b.w / 2, b.y + b.h / 2, opts.sleeveCm, f);
    box = { x: cx - b.w / f.x / 2, y: cy - b.h / f.y / 2, w: b.w / f.x, h: b.h / f.y };
  }
  return { box: toStudioBox(view, box), art: canvasRaster(art) };
}

/** A shown view: the canvas (real proportions of the size) and where the garment cm lie on it. */
export interface ShownView {
  canvas: HTMLCanvasElement;
  /** Canvas px per real cm (the shown size). */
  pxPerCm: number;
  /** Canvas px of the HPS / centre line. */
  originX: number;
  originY: number;
}

/** A view's photo with the given sides printed on it, un-stretched to the size's proportions. */
export async function composeTshirtView(
  pv: ApparelPhotoView,
  view: PhotoView,
  layers: Partial<Record<TshirtSide, Layer[]>>,
  opts: ComposeOpts & { mannequin?: boolean },
): Promise<ShownView> {
  const prints: ApparelPhotoPrint[] = [];
  for (const [sd, list] of Object.entries(layers) as [TshirtSide, Layer[]][]) {
    if (photoViewOf(sd) !== view || !list?.length) continue;
    try {
      const p = await sidePhotoPrint(sd, list, opts);
      if (p) prints.push(p);
    } catch {
      // a picture failed to load: show the garment without it
    }
  }
  const composed = composeApparelPhoto(pv, prints);
  // With the mannequin the shirt is cut out (it goes over the body) and the picture keeps room for the head.
  const stretched = rasterCanvas(opts.mannequin ? cutOut(composed, pv.maps) : composed);
  // Real proportions: the photo's cm rectangle at this size, 1200 px across.
  const img = photoImageCm(view);
  const f = opts.sizeFactor;
  const wCm = img.w * f.x;
  const hCm = img.h * f.y;
  const topCm = opts.mannequin ? MANNEQUIN_TOP_CM : 0;
  const bottomCm = opts.mannequin ? MANNEQUIN_BOTTOM_CM : 0;
  const pxPerCm = stretched.width / wCm;
  const out = document.createElement("canvas");
  out.width = stretched.width;
  out.height = Math.round((hCm + topCm + bottomCm) * pxPerCm);
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  const shown: ShownView = { canvas: out, pxPerCm, originX: -img.x * f.x * pxPerCm, originY: (topCm - img.y * f.y) * pxPerCm };
  const frame = { pxPerCm, originX: shown.originX, originY: shown.originY, f, hemCm: photoHemCm(view) * f.y };
  if (opts.mannequin) drawGoldMannequin(ctx, view, frame, "behind");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(stretched, 0, topCm * pxPerCm, out.width, hCm * pxPerCm);
  if (opts.mannequin) drawGoldMannequin(ctx, view, frame, "front");
  return shown;
}

/** A crop of a canvas (px), e.g. the sleeve close-up for the workshop mockup. */
export function cropCanvas(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, -x, -y);
  return c;
}

export function canvasPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
}

/**
 * Sleeve prints as seen on the FRONT photo (photo cm at size L): the sleeve's
 * outer face, tilted with the sleeve — so the 3D model, made from the front and
 * back photos, shows them when it turns. Measured on the DOGO photo.
 */
const SLEEVE_ON_FRONT: Record<"sleeve_left" | "sleeve_right", { cx: number; cy: number; angleDeg: number }> = {
  sleeve_left: { cx: 36.5, cy: 25.5, angleDeg: -17 },
  sleeve_right: { cx: -35.8, cy: 25.5, angleDeg: 17 },
};

/**
 * The front and back photos with every side printed (the sleeves on the
 * front photo's sleeves): the textures of the 3D model. Photo size, not cut out.
 */
export async function composeFor3D(
  views: { front: ApparelPhotoView; back: ApparelPhotoView },
  layers: Partial<Record<TshirtSide, Layer[]>>,
  opts: ComposeOpts,
): Promise<{ front: HTMLCanvasElement; back: HTMLCanvasElement }> {
  const front: ApparelPhotoPrint[] = [];
  const back: ApparelPhotoPrint[] = [];
  const f = opts.sizeFactor;
  for (const [sd, list] of Object.entries(layers) as [TshirtSide, Layer[]][]) {
    if (!list?.length) continue;
    try {
      if (!isSleeve(sd)) {
        const p = await sidePhotoPrint(sd, list, opts);
        if (p) (sd === "back" ? back : front).push(p);
        continue;
      }
      const b = layersBounds(list, opts.measure);
      if (!b) continue;
      const art = await renderAreaCanvas(list, b, ART_PX_PER_CM, opts.resolveFont, opts.measure);
      const at = SLEEVE_ON_FRONT[sd];
      const a = (at.angleDeg * Math.PI) / 180;
      // Offset of the design's middle from the square's middle, turned with the sleeve.
      const du = (b.x + b.w / 2) / f.x;
      const dv = (b.y + b.h / 2 - opts.sleeveCm / 2) / f.y;
      const cx = at.cx + du * Math.cos(a) - dv * Math.sin(a);
      const cy = at.cy + du * Math.sin(a) + dv * Math.cos(a);
      const w = b.w / f.x;
      const h = b.h / f.y;
      front.push({ box: { x: cx - w / 2, y: cy - h / 2, w, h, rotateDeg: at.angleDeg }, art: canvasRaster(art) });
    } catch {
      // a picture failed to load: leave it out
    }
  }
  return {
    front: rasterCanvas(composeApparelPhoto(views.front, front)),
    back: rasterCanvas(composeApparelPhoto(views.back, back)),
  };
}
