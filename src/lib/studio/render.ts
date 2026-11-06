import { buildLocalMaskPath } from "@/lib/design/canvasPrimitives";
import {
  STUDIO_SAMPLE_SHAPE,
  imageDrawRect,
  ptToMm,
  type StudioImageLayer,
  type StudioLayer,
  type StudioQrLayer,
  type StudioShapeLayer,
  type StudioSurface,
  type StudioTextLayer,
} from "./document";
import { isIdentityEdit, orientedSize } from "./photoEdit";
import { editedImage } from "./photoEditCanvas";
import { QR_QUIET_MODULES, layerQrMatrix } from "./qr";
import { TEXT_ASCENT, TEXT_DESCENT, TEXT_PAD } from "./textFit";

/**
 * One Canvas 2D renderer for every Studio output: the editor (each Konva node
 * draws its layer with `drawLayerLocal`), the live 3D texture (small), the
 * thumbnails and the 300 dpi print file. The same code draws all of them,
 * so what the customer sees is what is printed.
 */

export interface StudioRenderAssets {
  /** Bitmap of an image layer (preview copy in the editor, the original for print); null while loading. */
  image(layer: StudioImageLayer): CanvasImageSource | null;
  /** Canvas family name of an editor font (next/font variable → real family). */
  font(family: string): string;
}

export interface StudioRenderOptions {
  /** Pixels per millimetre. */
  pxPerMm: number;
  /** Draw empty photo placeholders (editor only; never in the print file). */
  placeholders?: boolean;
  /** Label for empty photo placeholders. */
  placeholderLabel?: string;
  /**
   * Leave out template sample texts the customer did not replace
   * (`placeholder`): business cards print only what was filled in.
   */
  skipSamples?: boolean;
}

/** A layer that is not drawn with these options (hidden, or an untouched sample on a card). */
export function layerSkipped(layer: StudioLayer, opts: Pick<StudioRenderOptions, "skipSamples">): boolean {
  return !!layer.hidden || (!!opts.skipSamples && ((layer.kind === "text" && layer.placeholder === true) || (layer.kind === "shape" && layer.name === STUDIO_SAMPLE_SHAPE)));
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export { TEXT_ASCENT, TEXT_DESCENT };

export function textFont(layer: Pick<StudioTextLayer, "bold" | "italic" | "sizePt" | "fontFamily">, pxPerMm: number, resolveFamily: (f: string) => string): string {
  const px: number = ptToMm(layer.sizePt) * pxPerMm;
  return `${layer.italic ? "italic " : ""}${layer.bold ? 700 : 400} ${px}px "${resolveFamily(layer.fontFamily)}", sans-serif`;
}

function setLetterSpacing(ctx: Ctx, px: number): void {
  const c = ctx as Ctx & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
}

/**
 * Size of a text layer's box (mm) for its text and style, measured with the
 * given context: straight text = widest line × lines; arc text = the bent
 * line's bounds.
 */
export function measureTextBox(ctx: Ctx, layer: StudioTextLayer, resolveFamily: (f: string) => string): { w: number; h: number } {
  const k = 10; // measure at 10 px/mm
  ctx.save();
  ctx.font = textFont(layer, k, resolveFamily);
  const sizeMm: number = ptToMm(layer.sizePt);
  setLetterSpacing(ctx, (layer.letterSpacingEm ?? 0) * sizeMm * k);
  const lines: string[] = (layer.text || " ").split("\n");
  const widest: number = Math.max(...lines.map((l) => ctx.measureText(l || " ").width)) / k;
  ctx.restore();
  const pad: number = sizeMm * TEXT_PAD * 2 + (layer.stroke?.widthMm ?? 0) * 2;
  const arc: number = layer.arcDeg ?? 0;
  if (Math.abs(arc) >= 1 && lines.length === 1) {
    const g = arcGeometry(widest, sizeMm, arc);
    return { w: g.w + pad, h: g.h + pad };
  }
  return { w: widest + pad, h: lines.length * sizeMm * layer.lineHeight + pad };
}

/** Bent-line geometry: radius R of the baseline circle and the box around it (mm). */
export function arcGeometry(textW: number, sizeMm: number, arcDeg: number): { R: number; theta: number; w: number; h: number } {
  const theta: number = (Math.min(330, Math.abs(arcDeg)) * Math.PI) / 180;
  const R: number = textW / theta;
  const half: number = theta / 2;
  const asc: number = sizeMm * TEXT_ASCENT;
  const desc: number = sizeMm * TEXT_DESCENT;
  const chord: number = half >= Math.PI / 2 ? 2 * (R + asc) : 2 * (R + asc) * Math.sin(half);
  const sag: number = R * (1 - Math.cos(Math.min(half, Math.PI)));
  return { R, theta, w: chord + sizeMm * 0.6, h: asc + desc + sag };
}

function applyShadow(ctx: Ctx, layer: StudioTextLayer, k: number): void {
  if (!layer.shadow) return;
  ctx.shadowColor = `${layer.shadow.color}99`;
  ctx.shadowBlur = layer.shadow.blurMm * k;
  ctx.shadowOffsetX = layer.shadow.dxMm * k;
  ctx.shadowOffsetY = layer.shadow.dyMm * k;
}

function clearShadow(ctx: Ctx): void {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Stroke (outline outside the letters) then fill, with the shadow under both. */
function paintGlyphs(ctx: Ctx, layer: StudioTextLayer, k: number, draw: (mode: "stroke" | "fill") => void): void {
  applyShadow(ctx, layer, k);
  if (layer.stroke && layer.stroke.widthMm > 0) {
    ctx.strokeStyle = layer.stroke.color;
    ctx.lineWidth = layer.stroke.widthMm * 2 * k;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    draw("stroke");
    clearShadow(ctx);
  }
  ctx.fillStyle = layer.color;
  draw("fill");
  clearShadow(ctx);
}

function drawText(ctx: Ctx, layer: StudioTextLayer, k: number, resolveFamily: (f: string) => string): void {
  const sizeMm: number = ptToMm(layer.sizePt);
  const W: number = layer.w * k;
  const H: number = layer.h * k;
  ctx.font = textFont(layer, k, resolveFamily);
  const spacing: number = (layer.letterSpacingEm ?? 0) * sizeMm * k;
  setLetterSpacing(ctx, spacing);
  const lines: string[] = layer.text.split("\n");
  const arc: number = layer.arcDeg ?? 0;

  if (Math.abs(arc) >= 1 && lines.length === 1 && layer.text.length > 0) {
    // Text on an arc: each glyph placed and turned along the baseline circle, centred in the box.
    setLetterSpacing(ctx, 0);
    const chars: string[] = Array.from(layer.text);
    const widths: number[] = chars.map((c) => ctx.measureText(c).width + spacing);
    const total: number = widths.reduce((a, b) => a + b, 0);
    const g = arcGeometry(total / k, sizeMm, arc);
    const R: number = g.R * k;
    const asc: number = sizeMm * TEXT_ASCENT * k;
    const desc: number = sizeMm * TEXT_DESCENT * k;
    const up: boolean = arc > 0;
    const cx: number = W / 2;
    // Content box (g.h) centred vertically in the layer box.
    const top: number = (H - g.h * k) / 2;
    const cy: number = up ? top + asc + R : top + g.h * k - desc - R;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    paintGlyphs(ctx, layer, k, (mode) => {
      let acc = 0;
      for (let i = 0; i < chars.length; i++) {
        const mid: number = acc + widths[i]! / 2;
        acc += widths[i]!;
        const phi: number = (mid - total / 2) / R;
        ctx.save();
        if (up) {
          ctx.translate(cx + R * Math.sin(phi), cy - R * Math.cos(phi));
          ctx.rotate(phi);
        } else {
          ctx.translate(cx + R * Math.sin(phi), cy + R * Math.cos(phi));
          ctx.rotate(-phi);
        }
        if (mode === "stroke") ctx.strokeText(chars[i]!, 0, 0);
        else ctx.fillText(chars[i]!, 0, 0);
        ctx.restore();
      }
    });
    return;
  }

  const lineH: number = sizeMm * layer.lineHeight * k;
  const blockH: number = lines.length * lineH;
  const pad: number = (sizeMm * TEXT_PAD + (layer.stroke?.widthMm ?? 0)) * k;
  const x: number = layer.align === "left" ? pad : layer.align === "right" ? W - pad : W / 2;
  ctx.textAlign = layer.align;
  ctx.textBaseline = "alphabetic";
  // Baseline of each line: the line box centred, glyphs centred in the line box.
  const y0: number = (H - blockH) / 2 + (lineH - (TEXT_ASCENT + TEXT_DESCENT) * sizeMm * k) / 2 + TEXT_ASCENT * sizeMm * k;
  paintGlyphs(ctx, layer, k, (mode) => {
    lines.forEach((line, i) => {
      if (mode === "stroke") ctx.strokeText(line, x, y0 + i * lineH);
      else ctx.fillText(line, x, y0 + i * lineH);
    });
  });
}

function maskPath(mask: StudioImageLayer["mask"], w: number, h: number): Path2D {
  const p: Path2D | null = buildLocalMaskPath(mask, w, h);
  if (p) return p;
  const r = new Path2D();
  r.rect(0, 0, w, h);
  return r;
}

/** Device pixels per unit of the context's current transform (Konva stage zoom, export scale). */
function deviceScale(ctx: Ctx): number {
  try {
    const m = ctx.getTransform();
    return Math.max(1e-3, Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
  } catch {
    return 1;
  }
}

function drawImage(ctx: Ctx, layer: StudioImageLayer, k: number, assets: StudioRenderAssets, opts: StudioRenderOptions): void {
  const W: number = layer.w * k;
  const H: number = layer.h * k;
  const path: Path2D = maskPath(layer.mask, W, H);
  const raw: CanvasImageSource | null = layer.src ? assets.image(layer) : null;
  if (layer.src && raw) {
    const n = orientedSize(layer.src);
    const r = imageDrawRect(layer, n.w, n.h);
    // The customer's adjustments, worked at the size the photo lands on this canvas (device pixels).
    const bmp: CanvasImageSource = isIdentityEdit(layer.src.edit) ? raw : editedImage(raw, layer.src.edit, Math.max(r.w, r.h) * k * deviceScale(ctx));
    ctx.save();
    ctx.clip(path);
    ctx.drawImage(bmp, r.x * k, r.y * k, r.w * k, r.h * k);
    ctx.restore();
  } else if (opts.placeholders) {
    ctx.save();
    ctx.fillStyle = "#e8ecf2";
    ctx.fill(path);
    ctx.setLineDash([Math.max(2, 2 * k), Math.max(2, 1.5 * k)]);
    ctx.lineWidth = Math.max(1, 0.4 * k);
    ctx.strokeStyle = "#8a96ab";
    ctx.stroke(path);
    ctx.setLineDash([]);
    const s: number = Math.min(W, H);
    ctx.fillStyle = "#5b6880";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.max(8, s * 0.32)}px sans-serif`;
    ctx.fillText("+", W / 2, H / 2 - (opts.placeholderLabel ? s * 0.1 : 0));
    if (opts.placeholderLabel && s > 40) {
      ctx.font = `600 ${Math.max(7, s * 0.09)}px sans-serif`;
      ctx.fillText(opts.placeholderLabel, W / 2, H / 2 + s * 0.2, W * 0.9);
    }
    ctx.restore();
  }
  if (layer.frame && layer.frame.widthMm > 0) {
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = layer.frame.color;
    ctx.lineWidth = layer.frame.widthMm * 2 * k;
    ctx.stroke(path);
    ctx.restore();
  }
}

/** Box-local path of a shape (w × h px). */
export function shapePath(shape: StudioShapeLayer["shape"], w: number, h: number): Path2D {
  const p = new Path2D();
  switch (shape) {
    case "rect":
    case "line":
      p.rect(0, 0, w, h);
      return p;
    case "rounded": {
      const r: number = Math.min(w, h) * 0.2;
      p.roundRect(0, 0, w, h, r);
      return p;
    }
    case "ellipse":
      p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      return p;
    case "triangle":
      p.moveTo(w / 2, 0);
      p.lineTo(w, h);
      p.lineTo(0, h);
      p.closePath();
      return p;
    case "star": {
      for (let i = 0; i < 10; i++) {
        const a: number = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr: number = i % 2 === 0 ? 0.5 : 0.2;
        const x: number = w / 2 + Math.cos(a) * w * rr;
        const y: number = h / 2 + Math.sin(a) * h * rr * 1.05 + h * 0.03;
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
      p.closePath();
      return p;
    }
    case "heart":
      return buildLocalMaskPath("heart", w, h)!;
    case "snowflake": {
      // Six arms with two small branches each, as one filled outline of thin bars.
      const cx: number = w / 2;
      const cy: number = h / 2;
      const R: number = Math.min(w, h) / 2;
      const t: number = R * 0.07;
      const bar = (x1: number, y1: number, x2: number, y2: number) => {
        const a: number = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
        const dx: number = Math.cos(a) * t;
        const dy: number = Math.sin(a) * t;
        p.moveTo(x1 + dx, y1 + dy);
        p.lineTo(x2 + dx, y2 + dy);
        p.lineTo(x2 - dx, y2 - dy);
        p.lineTo(x1 - dx, y1 - dy);
        p.closePath();
      };
      for (let i = 0; i < 6; i++) {
        const a: number = (i * Math.PI) / 3 - Math.PI / 2;
        const ex: number = cx + Math.cos(a) * R;
        const ey: number = cy + Math.sin(a) * R;
        bar(cx, cy, ex, ey);
        for (const f of [0.55, 0.78]) {
          const bx: number = cx + Math.cos(a) * R * f;
          const by: number = cy + Math.sin(a) * R * f;
          const len: number = R * (f === 0.55 ? 0.28 : 0.18);
          for (const s of [-1, 1]) {
            const b: number = a + (s * Math.PI) / 4;
            bar(bx, by, bx + Math.cos(b) * len, by + Math.sin(b) * len);
          }
        }
      }
      return p;
    }
    case "balloon":
      p.ellipse(w / 2, h * 0.4, w / 2, h * 0.4, 0, 0, Math.PI * 2);
      p.moveTo(w / 2, h * 0.8);
      p.lineTo(w * 0.56, h * 0.86);
      p.lineTo(w * 0.44, h * 0.86);
      p.closePath();
      p.rect(w * 0.49, h * 0.86, w * 0.02, h * 0.14);
      return p;
    case "iconPhone":
    case "iconMail":
    case "iconWeb":
    case "iconPin":
      iconPath(p, shape, w, h);
      return p;
    case "tree":
      p.moveTo(w / 2, 0);
      p.lineTo(w * 0.78, h * 0.32);
      p.lineTo(w * 0.64, h * 0.32);
      p.lineTo(w * 0.9, h * 0.6);
      p.lineTo(w * 0.72, h * 0.6);
      p.lineTo(w, h * 0.86);
      p.lineTo(0, h * 0.86);
      p.lineTo(w * 0.28, h * 0.6);
      p.lineTo(w * 0.1, h * 0.6);
      p.lineTo(w * 0.36, h * 0.32);
      p.lineTo(w * 0.22, h * 0.32);
      p.closePath();
      p.rect(w * 0.43, h * 0.86, w * 0.14, h * 0.14);
      return p;
  }
}

/**
 * Contact pictograms (business cards), filled outlines drawn in the middle of
 * the box at its smaller side: holes are sub-paths drawn the other way round
 * (non-zero fill), so one fill makes the outline.
 */
function iconPath(p: Path2D, shape: "iconPhone" | "iconMail" | "iconWeb" | "iconPin", w: number, h: number): void {
  const s: number = Math.min(w, h);
  const ox: number = (w - s) / 2;
  const oy: number = (h - s) / 2;
  const X = (u: number): number => ox + (u / 24) * s;
  const Y = (u: number): number => oy + (u / 24) * s;
  /** A rectangle; `ccw` makes it a hole. */
  const box = (x: number, y: number, bw: number, bh: number, ccw = false) => {
    const pts: [number, number][] = [
      [x, y],
      [x + bw, y],
      [x + bw, y + bh],
      [x, y + bh],
    ];
    const seq = ccw ? [pts[0]!, pts[3]!, pts[2]!, pts[1]!] : pts;
    p.moveTo(X(seq[0]![0]), Y(seq[0]![1]));
    for (const [px, py] of seq.slice(1)) p.lineTo(X(px), Y(py));
    p.closePath();
  };
  const ring = (cx: number, cy: number, rx: number, ry: number, t: number) => {
    p.moveTo(X(cx + rx), Y(cy));
    p.ellipse(X(cx), Y(cy), (rx / 24) * s, (ry / 24) * s, 0, 0, Math.PI * 2);
    p.moveTo(X(cx + rx - t), Y(cy));
    p.ellipse(X(cx), Y(cy), ((rx - t) / 24) * s, ((ry - t) / 24) * s, 0, Math.PI * 2, 0, true);
  };
  const bar = (x1: number, y1: number, x2: number, y2: number, t: number) => {
    const a: number = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
    const dx: number = (Math.cos(a) * t) / 2;
    const dy: number = (Math.sin(a) * t) / 2;
    p.moveTo(X(x1 + dx), Y(y1 + dy));
    p.lineTo(X(x2 + dx), Y(y2 + dy));
    p.lineTo(X(x2 - dx), Y(y2 - dy));
    p.lineTo(X(x1 - dx), Y(y1 - dy));
    p.closePath();
  };
  switch (shape) {
    case "iconPhone": {
      // A mobile phone: rounded body, the screen cut out, a dot under it.
      p.moveTo(X(9), Y(1.5));
      p.roundRect(X(6), Y(1.5), (12 / 24) * s, (21 / 24) * s, (2.6 / 24) * s);
      box(8, 4.5, 8, 12.5, true);
      p.moveTo(X(13.2), Y(19.6));
      p.ellipse(X(12), Y(19.6), (1.2 / 24) * s, (1.2 / 24) * s, 0, 0, Math.PI * 2, true);
      return;
    }
    case "iconMail": {
      // An envelope: the outline and the flap.
      box(2, 5, 20, 14);
      box(3.8, 6.8, 16.4, 10.4, true);
      bar(3.4, 6.6, 12, 13.4, 1.8);
      bar(12, 13.4, 20.6, 6.6, 1.8);
      return;
    }
    case "iconWeb": {
      // A globe: the outer ring, a meridian and the equator.
      ring(12, 12, 10, 10, 1.8);
      ring(12, 12, 4.6, 10, 1.6);
      bar(2.5, 12, 21.5, 12, 1.6);
      return;
    }
    case "iconPin": {
      // A map pin: a drop with a round hole.
      p.moveTo(X(12), Y(23));
      p.lineTo(X(5.2), Y(12.6));
      p.arc(X(12), Y(9), (7.6 / 24) * s, Math.PI * 0.84, Math.PI * 0.16);
      p.closePath();
      p.moveTo(X(15), Y(9));
      p.ellipse(X(12), Y(9), (3 / 24) * s, (3 / 24) * s, 0, 0, Math.PI * 2, true);
      return;
    }
  }
}

function drawShape(ctx: Ctx, layer: StudioShapeLayer, k: number): void {
  const path: Path2D = shapePath(layer.shape, layer.w * k, layer.h * k);
  if (layer.fill) {
    ctx.fillStyle = layer.fill;
    ctx.fill(path);
  }
  if (layer.stroke && (layer.strokeMm ?? 0) > 0) {
    ctx.strokeStyle = layer.stroke;
    ctx.lineWidth = (layer.strokeMm ?? 0) * k;
    ctx.lineJoin = "round";
    if (layer.dashMm) ctx.setLineDash([layer.dashMm * k, layer.dashMm * k]);
    ctx.stroke(path);
    if (layer.dashMm) ctx.setLineDash([]);
  }
}

function drawQr(ctx: Ctx, layer: StudioQrLayer, k: number, opts: StudioRenderOptions): void {
  const W: number = layer.w * k;
  const H: number = layer.h * k;
  const side: number = Math.min(W, H);
  const ox: number = (W - side) / 2;
  const oy: number = (H - side) / 2;
  const m = layerQrMatrix(layer);
  if (layer.background) {
    ctx.fillStyle = layer.background;
    ctx.fillRect(ox, oy, side, side);
  }
  if (!m) {
    if (opts.placeholders) {
      ctx.save();
      ctx.setLineDash([Math.max(2, 2 * k), Math.max(2, 1.5 * k)]);
      ctx.strokeStyle = "#8a96ab";
      ctx.lineWidth = Math.max(1, 0.4 * k);
      ctx.strokeRect(ox, oy, side, side);
      ctx.restore();
    }
    return;
  }
  const n: number = m.size + QR_QUIET_MODULES * 2;
  const cell: number = side / n;
  ctx.fillStyle = layer.color;
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (!m.dark[r * m.size + c]) continue;
      // Slight overlap so no hairline gaps appear between modules after scaling.
      ctx.fillRect(ox + (c + QR_QUIET_MODULES) * cell, oy + (r + QR_QUIET_MODULES) * cell, cell + 0.5, cell + 0.5);
    }
  }
}

/**
 * Draw one layer in its own box coordinates: origin at the box's top-left,
 * unrotated, `w × h` mm at `pxPerMm`. (Konva nodes and `drawSurface` set up the
 * transform.)
 */
export function drawLayerLocal(ctx: Ctx, layer: StudioLayer, assets: StudioRenderAssets, opts: StudioRenderOptions): void {
  if (layerSkipped(layer, opts)) return;
  const k: number = opts.pxPerMm;
  ctx.save();
  if (layer.opacity != null && layer.opacity < 1) ctx.globalAlpha *= layer.opacity;
  switch (layer.kind) {
    case "text":
      drawText(ctx, layer, k, assets.font);
      break;
    case "image":
      drawImage(ctx, layer, k, assets, opts);
      break;
    case "shape":
      drawShape(ctx, layer, k);
      break;
    case "qr":
      drawQr(ctx, layer, k, opts);
      break;
  }
  ctx.restore();
}

/** Draw a layer at its place on the surface (rotation around the box centre). */
export function drawLayer(ctx: Ctx, layer: StudioLayer, assets: StudioRenderAssets, opts: StudioRenderOptions): void {
  if (layerSkipped(layer, opts)) return;
  const k: number = opts.pxPerMm;
  ctx.save();
  ctx.translate((layer.x + layer.w / 2) * k, (layer.y + layer.h / 2) * k);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.translate((-layer.w / 2) * k, (-layer.h / 2) * k);
  drawLayerLocal(ctx, layer, assets, opts);
  ctx.restore();
}

/**
 * The whole surface (background + layers) onto a context whose origin is the
 * print area's top-left, `widthMm × heightMm` at `pxPerMm`. Transparent where
 * there is no background (the product colour shows through, as in the old
 * editors' export).
 */
export function drawSurface(ctx: Ctx, surface: StudioSurface, assets: StudioRenderAssets, opts: StudioRenderOptions): void {
  const k: number = opts.pxPerMm;
  if (surface.background) {
    ctx.fillStyle = surface.background;
    ctx.fillRect(0, 0, surface.widthMm * k, surface.heightMm * k);
  }
  for (const l of surface.layers) drawLayer(ctx, l, assets, opts);
}

/**
 * A surface over a whole `pxW × pxH` bitmap (the print file, previews): the
 * area is mapped exactly (uniform scale, a sub-pixel vertical correction).
 * Trimmed products (business cards) get white paper under the design and,
 * `asPrinted`, no untouched template samples.
 */
export function drawPrintArea(
  ctx: Ctx,
  surface: StudioSurface,
  spec: { trimmed?: boolean },
  assets: StudioRenderAssets,
  pxW: number,
  pxH: number,
  opts: { placeholders?: boolean; asPrinted?: boolean } = {},
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pxW, pxH);
  const kx: number = pxW / surface.widthMm;
  const ky: number = pxH / surface.heightMm;
  if (spec.trimmed) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pxW, pxH);
  }
  ctx.setTransform(1, 0, 0, ky / kx, 0, 0);
  drawSurface(ctx, surface, assets, { pxPerMm: kx, placeholders: opts.placeholders ?? false, skipSamples: !!spec.trimmed && !!opts.asPrinted });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
