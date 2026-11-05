import type { StudioMugLook } from "./mugLook";

/**
 * 2D product pictures of a design (template thumbnails, «Personalizează»
 * preview): the mug seen from the front with the visible part of the wrap
 * bent round the body, coloured inside / rim / handle and finish shading;
 * the pen as a barrel with the print strip. Plain canvas 2D, no WebGL: a
 * thumbnail costs one small design render plus ~2 × body-width `drawImage`
 * column copies. Geometry helpers are pure (tested); `draw*` need a canvas.
 */

export interface MugMockupGeometry {
  /** Pixels per cm. */
  k: number;
  cx: number;
  yTop: number;
  yBottom: number;
  rxTop: number;
  rxBottom: number;
  ryTop: number;
  ryBottom: number;
  /** Print band on the body (px, at the silhouette edge; the front dips by the ellipse). */
  labelTop: number;
  labelHeight: number;
  /** Radius of the body at the band's middle (px) and in mm. */
  rxMid: number;
  radiusMm: number;
  handle: { reach: number; thick: number; yA: number; yB: number } | null;
}

/** View from slightly above: ellipse height / width of the rim. */
export const MUG_VIEW_TILT = 0.16;
const HANDLE_REACH_CM = 3.4;
const HANDLE_THICK_CM = 0.95;
/** The 3D label keeps to 97 % of the body height. */
const LABEL_HEIGHT_SHARE = 0.97;

/** Where the mug sits in a `w × h` canvas (pure). */
export function mugMockupGeometry(look: Pick<StudioMugLook, "shape" | "print">, printHeightMm: number, w: number, h: number): MugMockupGeometry {
  const s = look.shape;
  const D: number = Math.max(s.topDiameterCm, s.bottomDiameterCm);
  const reachCm: number = s.handleStyle === "none" ? 0 : HANDLE_REACH_CM + HANDLE_THICK_CM / 2;
  const totalW: number = D + reachCm * 2; // centred on the body: the handle side mirrored as margin
  const totalH: number = s.bodyHeightCm + (D / 2) * MUG_VIEW_TILT * 2 + 0.6;
  const pad = 0.08;
  const k: number = Math.min((w * (1 - pad * 2)) / totalW, (h * (1 - pad * 2)) / totalH);
  const cx: number = w / 2 - (reachCm * k) / 3;
  const bodyH: number = s.bodyHeightCm * k;
  const rxTop: number = (s.topDiameterCm / 2) * k;
  const rxBottom: number = (s.bottomDiameterCm / 2) * k;
  const ryTop: number = rxTop * MUG_VIEW_TILT;
  const ryBottom: number = rxBottom * MUG_VIEW_TILT;
  const yTop: number = (h - bodyH) / 2 - (ryBottom - ryTop) / 2;
  const yBottom: number = yTop + bodyH;
  const printHcm: number = Math.min(look.print?.heightCm ?? printHeightMm / 10, s.bodyHeightCm * LABEL_HEIGHT_SHARE);
  const labelHeight: number = printHcm * k;
  const labelTop: number = yTop + (bodyH - labelHeight) / 2;
  const rxMid: number = (rxTop + rxBottom) / 2;
  return {
    k,
    cx,
    yTop,
    yBottom,
    rxTop,
    rxBottom,
    ryTop,
    ryBottom,
    labelTop,
    labelHeight,
    rxMid,
    radiusMm: ((s.topDiameterCm + s.bottomDiameterCm) / 4) * 10,
    handle: reachCm
      ? {
          reach: HANDLE_REACH_CM * k,
          thick: HANDLE_THICK_CM * k,
          yA: yTop + bodyH * 0.17,
          yB: yTop + bodyH * 0.8,
        }
      : null,
  };
}

/**
 * Wrap position (mm from the left edge of the print) seen at screen offset
 * `s` (−1 left silhouette … 1 right) of a body of radius `radiusMm`, the
 * wrap point `centerMm` (default: the middle) facing the viewer. null where
 * the print does not reach.
 */
export function wrapUAt(s: number, wrapWidthMm: number, radiusMm: number, centerMm: number = wrapWidthMm / 2): number | null {
  const theta: number = Math.asin(Math.max(-1, Math.min(1, s)));
  const u: number = centerMm + theta * radiusMm;
  return u < 0 || u > wrapWidthMm ? null : u;
}

/** Wrap points (mm) facing the viewer for the left / front / right views (a quarter turn apart, kept on the print). */
export function mugViewCenters(wrapWidthMm: number, radiusMm: number): [number, number, number] {
  const mid: number = wrapWidthMm / 2;
  const step: number = Math.min((Math.PI / 2) * radiusMm, mid);
  return [mid - step, mid, mid + step];
}

/** Share of the wrap width the front view shows (half the circumference, capped at the whole wrap). */
export function visibleWrapShare(wrapWidthMm: number, radiusMm: number): number {
  return Math.min(1, (Math.PI * radiusMm) / wrapWidthMm);
}

function rgba(hex: string, a: number): string {
  const n: number = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Relative luminance 0…1 of a #rrggbb colour. */
function lum(hex: string): number {
  const n: number = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

function bodyPath(ctx: CanvasRenderingContext2D, g: MugMockupGeometry): void {
  ctx.beginPath();
  ctx.moveTo(g.cx - g.rxTop, g.yTop);
  ctx.lineTo(g.cx - g.rxBottom, g.yBottom);
  ctx.ellipse(g.cx, g.yBottom, g.rxBottom, g.ryBottom, 0, Math.PI, 0, true);
  ctx.lineTo(g.cx + g.rxTop, g.yTop);
  ctx.ellipse(g.cx, g.yTop, g.rxTop, g.ryTop, 0, 0, Math.PI, false);
  ctx.closePath();
}

/** Cylinder light across the body for a finish. */
function shade(ctx: CanvasRenderingContext2D, g: MugMockupGeometry, finish: StudioMugLook["finish"], bodyHex: string): void {
  const x0: number = g.cx - Math.max(g.rxTop, g.rxBottom);
  const x1: number = g.cx + Math.max(g.rxTop, g.rxBottom);
  const dark: boolean = lum(bodyHex) < 0.35;
  const gr = ctx.createLinearGradient(x0, 0, x1, 0);
  const shiny: boolean = finish === "metallic" || finish === "glitter";
  const hi: number = finish === "matte" ? 0.12 : shiny ? 0.55 : dark ? 0.3 : 0.5;
  gr.addColorStop(0, "rgba(0,0,0,0.30)");
  gr.addColorStop(0.1, "rgba(0,0,0,0.12)");
  gr.addColorStop(0.22, "rgba(255,255,255,0)");
  gr.addColorStop(finish === "matte" ? 0.3 : 0.27, `rgba(255,255,255,${hi})`);
  gr.addColorStop(finish === "matte" ? 0.42 : 0.33, "rgba(255,255,255,0)");
  if (shiny) {
    gr.addColorStop(0.55, "rgba(0,0,0,0.18)");
    gr.addColorStop(0.68, "rgba(255,255,255,0.25)");
  }
  gr.addColorStop(0.72, "rgba(0,0,0,0)");
  gr.addColorStop(0.9, "rgba(0,0,0,0.16)");
  gr.addColorStop(1, "rgba(0,0,0,0.34)");
  ctx.fillStyle = gr;
  ctx.fillRect(x0, g.yTop - g.ryTop, x1 - x0, g.yBottom - g.yTop + g.ryTop + g.ryBottom);
}

function drawHandle(ctx: CanvasRenderingContext2D, g: MugMockupGeometry, look: StudioMugLook): void {
  const h = g.handle;
  if (!h) return;
  const xa: number = g.cx + g.rxTop - h.thick * 0.6;
  const xb: number = g.cx + g.rxBottom - h.thick * 0.6;
  const out: number = g.cx + Math.max(g.rxTop, g.rxBottom) + h.reach;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(xa, h.yA);
    if (look.shape.handleStyle === "heart") {
      const mid: number = (h.yA + h.yB) / 2;
      ctx.bezierCurveTo(out + h.reach * 0.1, h.yA - h.reach * 0.35, out + h.reach * 0.25, mid - h.reach * 0.1, out - h.reach * 0.2, mid + h.reach * 0.25);
      ctx.bezierCurveTo(out - h.reach * 0.5, mid + h.reach * 0.5, xb + h.reach * 0.3, h.yB, xb, h.yB);
    } else {
      ctx.bezierCurveTo(out + h.reach * 0.08, h.yA - h.reach * 0.05, out + h.reach * 0.08, h.yB + h.reach * 0.1, xb, h.yB);
    }
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  path();
  ctx.lineWidth = h.thick;
  ctx.strokeStyle = look.handleHex;
  ctx.stroke();
  path();
  ctx.lineWidth = h.thick * 0.9;
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.stroke();
  ctx.translate(-h.thick * 0.12, -h.thick * 0.12);
  path();
  ctx.lineWidth = h.thick * 0.28;
  ctx.strokeStyle = look.finish === "matte" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.4)";
  ctx.stroke();
  ctx.restore();
}

/**
 * The mug with `design` (the whole print area, any pixel size) on it.
 * `background` null leaves the canvas transparent around the mug.
 */
export function drawMugMockup(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  design: CanvasImageSource & { width: number; height: number },
  print: { widthMm: number; heightMm: number },
  look: StudioMugLook,
  background: string | null = "#f3f1ee",
  /** Wrap point (mm) facing the viewer; default the middle of the print. */
  centerMm: number = print.widthMm / 2,
): void {
  const g: MugMockupGeometry = mugMockupGeometry(look, print.heightMm, w, h);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  // Floor shadow.
  const sh = ctx.createRadialGradient(g.cx, g.yBottom + g.ryBottom * 0.6, 0, g.cx, g.yBottom + g.ryBottom * 0.6, g.rxBottom * 1.5);
  sh.addColorStop(0, "rgba(20,20,30,0.28)");
  sh.addColorStop(1, "rgba(20,20,30,0)");
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(g.cx + g.rxBottom * 0.12, g.yBottom + g.ryBottom * 0.6, g.rxBottom * 1.5, g.ryBottom * 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  drawHandle(ctx, g, look);

  // Inside: the whole rim ellipse, darker towards the back wall.
  ctx.beginPath();
  ctx.ellipse(g.cx, g.yTop, g.rxTop, g.ryTop, 0, 0, Math.PI * 2);
  ctx.fillStyle = look.innerHex;
  ctx.fill();
  const ig = ctx.createLinearGradient(0, g.yTop - g.ryTop, 0, g.yTop + g.ryTop);
  ig.addColorStop(0, "rgba(0,0,0,0.05)");
  ig.addColorStop(0.55, "rgba(0,0,0,0.32)");
  ig.addColorStop(1, "rgba(0,0,0,0.1)");
  ctx.fillStyle = ig;
  ctx.fill();

  // Body, colour band, design, light.
  ctx.save();
  bodyPath(ctx, g);
  ctx.fillStyle = look.bodyHex;
  ctx.fill();
  ctx.clip();
  if (look.gradientHex) {
    const top: number = g.yBottom - (g.yBottom - g.yTop) * (look.gradientPct / 100);
    const bg = ctx.createLinearGradient(0, g.yBottom + g.ryBottom, 0, top);
    bg.addColorStop(0, look.gradientHex);
    bg.addColorStop(1, rgba(look.gradientHex, 0));
    ctx.fillStyle = bg;
    ctx.fillRect(0, top, w, g.yBottom + g.ryBottom - top);
  }
  const dw: number = design.width;
  const dh: number = design.height;
  if (dw > 0 && dh > 0) {
    const ryMid: number = g.rxMid * MUG_VIEW_TILT;
    const pxPerMm: number = dw / print.widthMm;
    const left: number = Math.floor(g.cx - g.rxMid);
    const right: number = Math.ceil(g.cx + g.rxMid);
    for (let x = left; x < right; x++) {
      const s0: number = (x - g.cx) / g.rxMid;
      const s1: number = (x + 1 - g.cx) / g.rxMid;
      const u0: number | null = wrapUAt(s0, print.widthMm, g.radiusMm, centerMm);
      const u1: number | null = wrapUAt(s1, print.widthMm, g.radiusMm, centerMm);
      if (u0 == null || u1 == null) continue;
      const sMid: number = Math.max(-1, Math.min(1, (s0 + s1) / 2));
      const dy: number = ryMid * Math.sqrt(1 - sMid * sMid);
      const sx: number = u0 * pxPerMm;
      const sw: number = Math.max(0.5, (u1 - u0) * pxPerMm);
      ctx.drawImage(design, Math.min(dw - sw, sx), 0, sw, dh, x, g.labelTop + dy, 1.02, g.labelHeight);
    }
  }
  shade(ctx, g, look.finish, look.bodyHex);
  ctx.restore();

  // Rim.
  ctx.beginPath();
  ctx.ellipse(g.cx, g.yTop, g.rxTop, g.ryTop, 0, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, g.rxTop * 0.035);
  ctx.strokeStyle = look.rimHex;
  ctx.stroke();
  ctx.lineWidth = Math.max(0.5, g.rxTop * 0.012);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.stroke();
  ctx.restore();
}

/** Where the pen barrel and print strip sit in a `w × h` canvas (pure). */
export function penMockupGeometry(print: { widthMm: number; heightMm: number }, w: number, h: number) {
  // The print strip takes ~58 % of the width; the barrel is a little taller than the strip.
  const k: number = Math.min((w * 0.58) / print.widthMm, (h * 0.5) / (print.heightMm * 1.3));
  const stripW: number = print.widthMm * k;
  const stripH: number = print.heightMm * k;
  const barrelH: number = stripH * 1.3;
  const cy: number = h / 2;
  const stripX: number = (w - stripW) / 2 - w * 0.04;
  return {
    k,
    stripX,
    stripY: cy - stripH / 2,
    stripW,
    stripH,
    barrelH,
    barrelY: cy - barrelH / 2,
    left: w * 0.04,
    right: w * 0.96,
  };
}

/** The pen barrel in `bodyHex` with the design strip. */
export function drawPenMockup(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  design: CanvasImageSource & { width: number; height: number },
  print: { widthMm: number; heightMm: number },
  bodyHex: string,
  background: string | null = "#f3f1ee",
): void {
  const g = penMockupGeometry(print, w, h);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  const r: number = g.barrelH / 2;
  const tipLen: number = g.barrelH * 1.6;
  // Shadow.
  ctx.fillStyle = "rgba(20,20,30,0.12)";
  ctx.beginPath();
  ctx.ellipse(w / 2, g.barrelY + g.barrelH + r * 0.7, (g.right - g.left) / 2, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  // Barrel: metal tip on the left, body, rounded end on the right.
  ctx.beginPath();
  ctx.moveTo(g.left, h / 2);
  ctx.lineTo(g.left + tipLen, g.barrelY + r * 0.35);
  ctx.lineTo(g.left + tipLen, g.barrelY + g.barrelH - r * 0.35);
  ctx.closePath();
  ctx.fillStyle = "#b9bcc2";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(g.left + tipLen, g.barrelY);
  ctx.lineTo(g.right - r, g.barrelY);
  ctx.arc(g.right - r, h / 2, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(g.left + tipLen, g.barrelY + g.barrelH);
  ctx.closePath();
  ctx.fillStyle = bodyHex;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.drawImage(design, g.stripX, g.stripY, g.stripW, g.stripH);
  const gr = ctx.createLinearGradient(0, g.barrelY, 0, g.barrelY + g.barrelH);
  gr.addColorStop(0, "rgba(0,0,0,0.22)");
  gr.addColorStop(0.18, "rgba(255,255,255,0.45)");
  gr.addColorStop(0.32, "rgba(255,255,255,0)");
  gr.addColorStop(0.75, "rgba(0,0,0,0.05)");
  gr.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = gr;
  ctx.fillRect(0, g.barrelY, w, g.barrelH);
  ctx.restore();
  // Clip on top, over the right end.
  const clipX: number = Math.max(g.stripX + g.stripW + g.barrelH * 0.3, g.right - g.barrelH * 4.2);
  const clipW: number = g.right - r - clipX;
  if (clipW > g.barrelH) {
    ctx.fillStyle = lum(bodyHex) > 0.85 ? "#d9dadc" : bodyHex;
    ctx.beginPath();
    ctx.roundRect(clipX, g.barrelY - g.barrelH * 0.35, clipW, g.barrelH * 0.42, g.barrelH * 0.2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(clipX, g.barrelY - g.barrelH * 0.02, clipW, g.barrelH * 0.08);
  }
  ctx.restore();
}

/**
 * The wrap point (mm) to face the viewer so the most of the customer's
 * content shows: each photo counts 3, the name 2, other texts 1, times the
 * share of it in the flatter middle of the front. Candidates step from the middle outwards up to a quarter
 * turn; ties keep the middle. Pure.
 */
export function bestMugViewCenter(
  layers: readonly {
    kind: string;
    x: number;
    w: number;
    h: number;
    hidden?: boolean;
    src?: unknown;
    bind?: string;
  }[],
  wrapWidthMm: number,
  radiusMm: number,
): number {
  const mid: number = wrapWidthMm / 2;
  const half: number = (Math.PI / 2) * radiusMm * 0.7;
  const items = layers
    .filter((l) => !l.hidden && ((l.kind === "image" && l.src) || l.kind === "text") && l.w < wrapWidthMm * 0.8)
    .map((l) => ({
      x0: l.x,
      x1: l.x + l.w,
      weight: (l.kind === "image" ? 3 : l.bind === "name" ? 2 : 1) / Math.max(1e-6, l.w),
    }));
  if (items.length === 0) return mid;
  const score = (c: number): number => items.reduce((sum, it) => sum + it.weight * Math.max(0, Math.min(it.x1, c + half) - Math.max(it.x0, c - half)), 0);
  const reach: number = Math.min((Math.PI / 2) * radiusMm, mid);
  let best: number = mid;
  let bestScore: number = score(mid);
  for (let step = 5; step <= reach; step += 5) {
    for (const c of [mid - step, mid + step]) {
      const s: number = score(c);
      if (s > bestScore + 1e-6) {
        best = c;
        bestScore = s;
      }
    }
  }
  return best;
}
