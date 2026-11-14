"use client";

/**
 * Previzualizare: a gold mannequin wearing the shirt — a smooth faceless head
 * on a neck coming out of the collar, and the torso under the hem (no arms or
 * legs), drawn around Roly's ghost-mannequin photos. In real cm from the HPS
 * of the shown size (`ShownView`); the head keeps its human size on every
 * shirt size. Pure canvas drawing.
 */
import type { PhotoView } from "@/lib/studio/photoMockup";

export interface MannequinFrame {
  /** Canvas px per cm. */
  pxPerCm: number;
  /** Canvas px of the HPS level on the centre line (side views: the sleeve's middle). */
  originX: number;
  originY: number;
  /** Shown size against L: across / lengthwise. */
  f: { x: number; y: number };
  /** HPS → hem of the shown shirt (cm of the picture). */
  hemCm: number;
}

/** Head room above the HPS and torso below the hem the preview canvas keeps (cm). */
export const MANNEQUIN_TOP_CM = 36;
export const MANNEQUIN_BOTTOM_CM = 9;

const GOLD_DEEP = "#3d2a06";
const GOLD_DARK = "#6b4c12";
const GOLD_MID = "#b8892c";
const GOLD = "#dcae48";
const GOLD_LIGHT = "#fbe9ae";
const GOLD_WHITE = "#fffaf0";

/**
 * Polished gold across [x0, x1]: dark rims, a bright band left of the middle
 * (light from the upper left), a second softer band on the right (rim light).
 */
function goldAcross(ctx: CanvasRenderingContext2D, x0: number, x1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, GOLD_DEEP);
  g.addColorStop(0.08, GOLD_DARK);
  g.addColorStop(0.22, GOLD_MID);
  g.addColorStop(0.34, GOLD_LIGHT);
  g.addColorStop(0.4, GOLD_WHITE);
  g.addColorStop(0.47, GOLD_LIGHT);
  g.addColorStop(0.62, GOLD);
  g.addColorStop(0.8, GOLD_MID);
  g.addColorStop(0.9, "#e3bd62");
  g.addColorStop(1, GOLD_DARK);
  return g;
}

/** Soft white sheen (a polished highlight) in an ellipse. */
function sheen(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, alpha = 0.55, rot = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(255,253,240,${alpha})`);
  g.addColorStop(0.5, `rgba(255,248,220,${alpha * 0.35})`);
  g.addColorStop(1, "rgba(255,248,220,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Over the current path: darker towards y1 (or y0 with `up`), the form turning away from the light. */
function shade(ctx: CanvasRenderingContext2D, y0: number, y1: number, alpha: number) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, "rgba(50,32,4,0)");
  g.addColorStop(1, `rgba(50,32,4,${alpha})`);
  ctx.fillStyle = g;
  ctx.fill();
}

type Pt = [number, number];

/** The head's outline (cm from the head's centre): front = faceless egg narrowing to the chin; side = profile facing `s`. */
function headPath(ctx: CanvasRenderingContext2D, P: (x: number, y: number) => Pt, s: 0 | -1 | 1) {
  ctx.beginPath();
  if (!s) {
    ctx.moveTo(...P(0, -11.6));
    ctx.bezierCurveTo(...P(4.7, -11.6), ...P(7.5, -8.2), ...P(7.5, -3));
    ctx.bezierCurveTo(...P(7.5, 1.6), ...P(6.9, 4.6), ...P(5.6, 7.2));
    ctx.bezierCurveTo(...P(4.4, 9.8), ...P(2.3, 11.6), ...P(0, 11.6));
    ctx.bezierCurveTo(...P(-2.3, 11.6), ...P(-4.4, 9.8), ...P(-5.6, 7.2));
    ctx.bezierCurveTo(...P(-6.9, 4.6), ...P(-7.5, 1.6), ...P(-7.5, -3));
    ctx.bezierCurveTo(...P(-7.5, -8.2), ...P(-4.7, -11.6), ...P(0, -11.6));
  } else {
    // Back of the skull → crown → brow → (faceless) face → chin → under the jaw to the neck.
    ctx.moveTo(...P(-s * 7.6, 2.5));
    ctx.bezierCurveTo(...P(-s * 9.6, -2), ...P(-s * 8.8, -9.5), ...P(-s * 2.5, -11.6));
    ctx.bezierCurveTo(...P(s * 3.5, -12.6), ...P(s * 8.2, -8.5), ...P(s * 8.6, -3.2));
    ctx.bezierCurveTo(...P(s * 9.1, 0.5), ...P(s * 9.4, 3.5), ...P(s * 8.6, 6.5));
    ctx.bezierCurveTo(...P(s * 8.2, 9.2), ...P(s * 6.6, 11.3), ...P(s * 4.4, 11.4));
    ctx.bezierCurveTo(...P(s * 2.2, 11.5), ...P(s * 0.4, 10.2), ...P(-s * 1.4, 8.6));
    ctx.bezierCurveTo(...P(-s * 3.6, 7.2), ...P(-s * 6.2, 5.6), ...P(-s * 7.6, 2.5));
  }
  ctx.closePath();
}

/**
 * Head and neck. `s` = 0: seen from the front / back (faceless, alike);
 * −1 / +1: a profile facing the viewer's left / right. `neckBottom`: how far
 * under the HPS the neck is drawn (the collar hides the rest).
 */
function drawHead(ctx: CanvasRenderingContext2D, k: number, cx: number, hpsY: number, s: 0 | -1 | 1, neckBottom: number) {
  const P = (x: number, y: number): Pt => [cx + x * k, hpsY + y * k];
  // ── Neck: a column leaning a little forward, widening into the shoulders under the collar.
  const lean = s * 1.3;
  const top = -12.5;
  const nwTop = s ? 4.7 : 4.9;
  const nwMid = s ? 5 : 5.2;
  const nwBase = s ? 6.2 : 6.8;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(...P(-nwTop + lean, top));
  ctx.bezierCurveTo(...P(-nwMid + lean * 0.6, -7.5), ...P(-nwMid, -2.5), ...P(-nwBase, neckBottom));
  ctx.lineTo(...P(nwBase, neckBottom));
  ctx.bezierCurveTo(...P(nwMid, -2.5), ...P(nwMid + lean * 0.6, -7.5), ...P(nwTop + lean, top));
  ctx.closePath();
  ctx.fillStyle = goldAcross(ctx, cx - (nwBase + 0.5) * k, cx + (nwBase + 0.5) * k);
  ctx.fill();
  // The jaw's shadow falls on the top of the neck; the neck darkens again where it enters the collar.
  const g = ctx.createLinearGradient(0, hpsY + top * k, 0, hpsY + neckBottom * k);
  g.addColorStop(0, "rgba(45,28,3,0.62)");
  g.addColorStop(0.38, "rgba(45,28,3,0.08)");
  g.addColorStop(0.75, "rgba(45,28,3,0)");
  g.addColorStop(1, "rgba(45,28,3,0.35)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  sheen(ctx, ...P(-1.9 + lean * 0.5, -5), 1 * k, 3.6 * k, 0.5);

  // ── Head.
  const hx = s ? s * 0.8 : 0;
  const hy = -21.8;
  const H = (x: number, y: number): Pt => P(hx + x, hy + y);
  ctx.save();
  headPath(ctx, H, s);
  const rg = ctx.createRadialGradient(...H(-2.8 + s * 1.5, -5), 0.4 * k, ...H(s * 0.5, 0), 13.5 * k);
  rg.addColorStop(0, GOLD_WHITE);
  rg.addColorStop(0.16, GOLD_LIGHT);
  rg.addColorStop(0.45, GOLD);
  rg.addColorStop(0.75, GOLD_MID);
  rg.addColorStop(0.92, GOLD_DARK);
  rg.addColorStop(1, GOLD_DEEP);
  ctx.fillStyle = rg;
  ctx.fill();
  // Under the chin / jaw the form turns away from the light.
  shade(ctx, hpsY + (hy + 2) * k, hpsY + (hy + 11.6) * k, 0.4);
  ctx.restore();
  // Polished highlights: a long soft streak on the light side and a hot spot on the crown; a warm rim on the far side.
  sheen(ctx, ...H(-3.4 + s * 1.2, -3.5), 1.6 * k, 6.2 * k, 0.55, -0.12);
  sheen(ctx, ...H(-2.4 + s * 1.5, -8.2), 1.5 * k, 1.1 * k, 0.9);
  ctx.save();
  headPath(ctx, H, s);
  ctx.clip();
  const rim = ctx.createLinearGradient(...H(4.5, 0), ...H(8, 0));
  rim.addColorStop(0, "rgba(255,226,140,0)");
  rim.addColorStop(1, "rgba(255,226,140,0.45)");
  ctx.fillStyle = rim;
  ctx.fillRect(...H(4.5, -12), 4 * k, 24 * k);
  ctx.restore();
}

/** The body under the hem: the hips of a dress form, ending in a clean horizontal cut. */
function drawTorso(ctx: CanvasRenderingContext2D, fr: MannequinFrame, view: PhotoView) {
  const k = fr.pxPerCm;
  const hem = fr.hemCm;
  const sideView = view === "left" || view === "right";
  // Inside the shirt: the hips are narrower than the shirt (L: 54 cm chest → ~42 cm hips across; ~26 cm deep).
  const half = (sideView ? 13 : 20.5) * fr.f.x;
    // Side photos: the body's middle is ~4 cm in front of the sleeve's middle (the left photo faces the viewer's left).
  const cx = fr.originX + (sideView ? (view === "left" ? -4 : 4) * fr.f.x * k : 0);
  const top = fr.originY + (hem - 8) * k;
  const cutY = fr.originY + (hem + MANNEQUIN_BOTTOM_CM - 3) * k;
  const flare = 0.8;
  const ry = (sideView ? 1.4 : 2.2) * k;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - half * k, top);
  ctx.bezierCurveTo(cx - (half + flare) * k, top + 4 * k, cx - (half + flare) * k, cutY - 3 * k, cx - (half + flare * 0.6) * k, cutY);
  ctx.ellipse(cx, cutY, (half + flare * 0.6) * k, ry, 0, Math.PI, 0, true);
  ctx.bezierCurveTo(cx + (half + flare) * k, cutY - 3 * k, cx + (half + flare) * k, top + 4 * k, cx + half * k, top);
  ctx.closePath();
  ctx.fillStyle = goldAcross(ctx, cx - (half + flare) * k, cx + (half + flare) * k);
  ctx.fill();
  shade(ctx, top, cutY + ry, 0.25);
  ctx.restore();
  // The shirt's hem casts a soft shadow on the body.
  ctx.save();
  const sh = ctx.createLinearGradient(0, fr.originY + (hem - 1) * k, 0, fr.originY + (hem + 2.5) * k);
  sh.addColorStop(0, "rgba(40,25,3,0.45)");
  sh.addColorStop(1, "rgba(40,25,3,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(cx - (half + flare) * k, fr.originY + (hem - 1) * k, 2 * (half + flare) * k, 3.5 * k);
  ctx.restore();
  // The cut: a flat golden face seen from slightly above.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cutY, (half + flare * 0.6) * k, ry, 0, 0, Math.PI * 2);
  const cg = ctx.createLinearGradient(cx - half * k, cutY - ry, cx + half * k, cutY + ry);
  cg.addColorStop(0, "#c99a3a");
  cg.addColorStop(0.45, "#f1d58a");
  cg.addColorStop(1, "#a97a22");
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.strokeStyle = "rgba(70,48,8,0.6)";
  ctx.lineWidth = Math.max(1, 0.18 * k);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw the mannequin's parts for one layer of the picture: `behind` (before
 * the cut-out shirt: torso, and on the back / sides the whole head and neck)
 * or `front` (after it: on the front view the neck passes in front of the
 * inside of the back collar, down to the front neckline).
 */
export function drawGoldMannequin(ctx: CanvasRenderingContext2D, view: PhotoView, fr: MannequinFrame, pass: "behind" | "front"): void {
  const k = fr.pxPerCm;
  if (pass === "behind") {
    drawTorso(ctx, fr, view);
    if (view === "back") drawHead(ctx, k, fr.originX, fr.originY, 0, 2);
    // Side photos: the collar's middle is ~3 cm in front of the sleeve's middle, the face looks forward
    // (the left side photo faces the viewer's left, the right one is mirrored).
    if (view === "left") drawHead(ctx, k, fr.originX - 3 * fr.f.x * k, fr.originY, -1, 3);
    if (view === "right") drawHead(ctx, k, fr.originX + 3 * fr.f.x * k, fr.originY, 1, 3);
    return;
  }
  if (view !== "front") return;
  // Front: clip above the front neckline (the collar rib's upper edge, measured on the photo:
  // ~6.2 cm under the HPS in the middle, rising to the shoulders at ±12.5 cm).
  ctx.save();
  ctx.beginPath();
  const n = 24;
  const w = 12.5 * fr.f.x;
  ctx.moveTo(fr.originX - w * k, fr.originY - 60 * k);
  for (let i = 0; i <= n; i++) {
    const x = -w + (2 * w * i) / n;
    const t = x / w;
    const y = (6.15 - 5 * t * t) * fr.f.y;
    ctx.lineTo(fr.originX + x * k, fr.originY + y * k);
  }
  ctx.lineTo(fr.originX + w * k, fr.originY - 60 * k);
  ctx.closePath();
  ctx.clip();
  drawHead(ctx, k, fr.originX, fr.originY, 0, 5);
  ctx.restore();
}
