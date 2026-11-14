/**
 * Browser-side rendering of a designed side: the 300 DPI print PNG (transparent,
 * exactly the design's bounding box) and a mockup PNG on the shirt.
 */
import type { Layer, Measure } from "./tshirtLayers";
import { TEXT_LINE_HEIGHT, layerBoxCm, textLines } from "./tshirtLayers";
import { TSHIRT_PRINT_DPI } from "./tshirtRules";
import { assemblePng, setPngDpi } from "./pngDpi";

export type FontResolver = (fontId: string) => string;

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = imageCache.get(src);
  if (hit) return hit;
  const p = loadImageNow(src);
  imageCache.set(src, p);
  p.catch(() => imageCache.delete(src));
  return p;
}
function loadImageNow(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load"));
    img.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas_blob"))), "image/png"),
  );
}

async function drawLayers(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  pxPerCm: number,
  originCm: { x: number; y: number },
  resolveFont: FontResolver,
  measure: Measure,
) {
  // enlarge small pictures smoothly, like print software does
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const l of layers) {
    const box = layerBoxCm(l, measure);
    ctx.save();
    ctx.translate((l.cx - originCm.x) * pxPerCm, (l.cy - originCm.y) * pxPerCm);
    ctx.rotate((l.rotation * Math.PI) / 180);
    if (l.kind === "image") {
      const img = await loadImage(l.src);
      ctx.drawImage(img, (-box.w / 2) * pxPerCm, (-box.h / 2) * pxPerCm, box.w * pxPerCm, box.h * pxPerCm);
    } else {
      const fontPx = l.sizeCm * pxPerCm;
      const family = resolveFont(l.fontId);
      ctx.font = `${l.bold ? 700 : 400} ${fontPx}px ${family}`;
      ctx.fillStyle = l.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lines = textLines(l, measure);
      const lh = fontPx * TEXT_LINE_HEIGHT;
      lines.forEach((line, i) => {
        ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lh);
      });
    }
    ctx.restore();
  }
}

/**
 * Print file: PNG of the design's bounding box at 300 DPI (pixels and the
 * resolution written in the file), transparent background.
 *
 * A full 30 × 42 cm design is 3543 × 4961 px — more than one canvas may hold on
 * iPhones — so it is drawn in strips and the PNG is assembled here.
 */
export async function renderPrintPng(
  layers: Layer[],
  bounds: { x: number; y: number },
  wCm: number,
  hCm: number,
  resolveFont: FontResolver,
  measure: Measure,
): Promise<Blob> {
  const pxPerCm = TSHIRT_PRINT_DPI / 2.54;
  const width = Math.round(wCm * pxPerCm);
  const height = Math.round(hCm * pxPerCm);
  const origin = { x: bounds.x, y: bounds.y };

  if (typeof CompressionStream === "undefined") {
    // old browsers: one canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_ctx");
    await drawLayers(ctx, layers, pxPerCm, origin, resolveFont, measure);
    const png = new Uint8Array(await (await toBlob(canvas)).arrayBuffer());
    return new Blob([setPngDpi(png, TSHIRT_PRINT_DPI)], { type: "image/png" });
  }

  const cs = new CompressionStream("deflate"); // zlib, as PNG wants
  const writer = cs.writable.getWriter();
  const compressed = new Response(cs.readable).arrayBuffer();
  const stripRows = Math.max(1, Math.floor(4_000_000 / width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  const rowBytes = width * 4;
  for (let y0 = 0; y0 < height; y0 += stripRows) {
    const rows = Math.min(stripRows, height - y0);
    canvas.height = rows; // also clears it
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas_ctx");
    ctx.save();
    ctx.translate(0, -y0);
    await drawLayers(ctx, layers, pxPerCm, origin, resolveFont, measure);
    ctx.restore();
    const px = ctx.getImageData(0, 0, width, rows).data;
    const buf = new Uint8Array(rows * (rowBytes + 1)); // filter byte 0 + RGBA row
    for (let r = 0; r < rows; r++) buf.set(px.subarray(r * rowBytes, (r + 1) * rowBytes), r * (rowBytes + 1) + 1);
    await writer.write(buf);
  }
  await writer.close();
  const png = assemblePng(width, height, new Uint8Array(await compressed), TSHIRT_PRINT_DPI);
  return new Blob([png], { type: "image/png" });
}

/**
 * Close-up at (about) real size: `centerCm` in the middle of the canvas, the
 * shirt colour behind. Pictures are enlarged exactly as in the print file, so
 * a blurry photo looks blurry here too.
 */
export async function renderCloseUp(
  canvas: HTMLCanvasElement,
  layers: Layer[],
  centerCm: { x: number; y: number },
  pxPerCm: number,
  background: string,
  resolveFont: FontResolver,
  measure: Measure,
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const origin = { x: centerCm.x - canvas.width / 2 / pxPerCm, y: centerCm.y - canvas.height / 2 / pxPerCm };
  await drawLayers(ctx, layers, pxPerCm, origin, resolveFont, measure);
}

/** Mockup: the shirt drawing with the design on it (for the order page). */
export async function renderMockupPng(
  shirtSvg: string,
  view: { w: number; h: number },
  printBox: { x: number; y: number },
  unitsPerCm: number,
  layers: Layer[],
  resolveFont: FontResolver,
  measure: Measure,
  scale = 2,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = view.w * scale;
  canvas.height = view.h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_ctx");
  const url = URL.createObjectURL(new Blob([shirtSvg], { type: "image/svg+xml" }));
  try {
    const shirt = await loadImage(url);
    ctx.drawImage(shirt, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
  ctx.translate(printBox.x * scale, printBox.y * scale);
  await drawLayers(ctx, layers, unitsPerCm * scale, { x: 0, y: 0 }, resolveFont, measure);
  return toBlob(canvas);
}

/** The design's bounding box (cm, from the collar) as a canvas — for the 3D preview. */
export async function renderAreaCanvas(
  layers: Layer[],
  rect: { x: number; y: number; w: number; h: number },
  pxPerCm: number,
  resolveFont: FontResolver,
  measure: Measure,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.w * pxPerCm));
  canvas.height = Math.max(1, Math.round(rect.h * pxPerCm));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_ctx");
  await drawLayers(ctx, layers, pxPerCm, { x: rect.x, y: rect.y }, resolveFont, measure);
  return canvas;
}
