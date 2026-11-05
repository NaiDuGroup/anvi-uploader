/**
 * 2D picture of a push-button pen (side view, tip on the left) in the body
 * colour, with the print area wrapped on the barrel: the design rows follow
 * the cylinder (sin projection) and take the barrel's shading. Used by the
 * pen form (whole pen + magnified print area). Browser only (canvas).
 *
 * Geometry in mm: a 140 mm pen, 10 mm barrel; the print area sits between the
 * tapered nose and the clip.
 */

type Ctx = CanvasRenderingContext2D;

export const PEN_SCENE_MM = { w: 146, h: 20 } as const;
const R = 5;
const CY = 9.5;
const NOSE_X = 26;
const CLIP_X = 96;
const BARREL_END = 129;

export interface PenZoneGeom {
  x: number;
  w: number;
  /** Top / bottom of the print area on the barrel (after the cylinder projection), mm. */
  y0: number;
  y1: number;
}

/**
 * The print area fits on the drawn barrel: no longer than the space between
 * the nose and the clip, no taller than the visible half of the barrel. Not
 * so on a pen set printed on its case (KIOTO 12×3 cm): the form then shows
 * the flat print on the case colour instead of a pen. Pure.
 */
export function penZoneOnBarrel(zoneMm: { w: number; h: number }): boolean {
  return zoneMm.w <= CLIP_X - NOSE_X - 2 && zoneMm.h <= Math.PI * R * 0.96;
}

/** Where the print area sits on the pen (mm in the scene). */
export function penZoneGeom(zoneMm: { w: number; h: number }): PenZoneGeom {
  const w: number = Math.min(zoneMm.w, CLIP_X - NOSE_X - 2);
  const x: number = Math.max(NOSE_X + 1, (NOSE_X + CLIP_X) / 2 - w / 2);
  const half: number = Math.min(Math.PI / 2 * 0.96, zoneMm.h / R / 2);
  return { x, w, y0: CY - R * Math.sin(half), y1: CY + R * Math.sin(half) };
}

function shade(ctx: Ctx, top: number, bottom: number, strength = 1): void {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, `rgba(0,0,0,${0.28 * strength})`);
  g.addColorStop(0.12, "rgba(255,255,255,0)");
  g.addColorStop(0.26, `rgba(255,255,255,${0.5 * strength})`);
  g.addColorStop(0.36, "rgba(255,255,255,0.06)");
  g.addColorStop(0.62, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${0.42 * strength})`);
  ctx.fillStyle = g;
  ctx.fill();
}

function chrome(ctx: Ctx, top: number, bottom: number): void {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, "#8d939b");
  g.addColorStop(0.25, "#f4f6f8");
  g.addColorStop(0.45, "#c3c8ce");
  g.addColorStop(0.75, "#7c828a");
  g.addColorStop(1, "#b9bec4");
  ctx.fillStyle = g;
  ctx.fill();
}

function barrelPath(ctx: Ctx): void {
  ctx.beginPath();
  // Nose: tapers from the barrel to the tip cone.
  ctx.moveTo(14, CY - 3.1);
  ctx.bezierCurveTo(18, CY - 3.4, 22, CY - R, NOSE_X, CY - R);
  ctx.lineTo(BARREL_END, CY - R);
  ctx.quadraticCurveTo(BARREL_END + 2.2, CY - R, BARREL_END + 2.2, CY);
  ctx.quadraticCurveTo(BARREL_END + 2.2, CY + R, BARREL_END, CY + R);
  ctx.lineTo(NOSE_X, CY + R);
  ctx.bezierCurveTo(22, CY + R, 18, CY + 3.4, 14, CY + 3.1);
  ctx.closePath();
}

/**
 * Draw the pen at `k` px per mm, with `design` (the print area canvas, any
 * size) on the barrel. `zoneMm` is the print area size.
 */
export function drawPenScene(ctx: Ctx, k: number, body: string, design: CanvasImageSource | null, designPx: { w: number; h: number } | null, zoneMm: { w: number; h: number }): PenZoneGeom {
  ctx.save();
  ctx.scale(k, k);
  // Soft shadow under the pen.
  ctx.save();
  ctx.filter = `blur(${Math.max(1, 1.2 * k)}px)`;
  ctx.fillStyle = "rgba(20,33,61,0.22)";
  ctx.beginPath();
  ctx.ellipse(73, CY + R + 2.6, 62, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Tip cone (metal) and the refill point.
  ctx.beginPath();
  ctx.moveTo(3, CY - 0.35);
  ctx.lineTo(14.5, CY - 3.1);
  ctx.lineTo(14.5, CY + 3.1);
  ctx.lineTo(3, CY + 0.35);
  ctx.closePath();
  chrome(ctx, CY - 3.1, CY + 3.1);
  ctx.beginPath();
  ctx.arc(2.8, CY, 0.45, 0, Math.PI * 2);
  ctx.fillStyle = "#3a3f46";
  ctx.fill();

  // Push button at the back.
  ctx.beginPath();
  ctx.moveTo(BARREL_END + 1, CY - 2.6);
  ctx.lineTo(BARREL_END + 7.5, CY - 2.6);
  ctx.quadraticCurveTo(BARREL_END + 9, CY - 2.6, BARREL_END + 9, CY);
  ctx.quadraticCurveTo(BARREL_END + 9, CY + 2.6, BARREL_END + 7.5, CY + 2.6);
  ctx.lineTo(BARREL_END + 1, CY + 2.6);
  ctx.closePath();
  chrome(ctx, CY - 2.6, CY + 2.6);

  // Barrel in the body colour.
  barrelPath(ctx);
  ctx.fillStyle = body;
  ctx.fill();

  // The design, wrapped on the cylinder (row slices).
  const z: PenZoneGeom = penZoneGeom(zoneMm);
  if (design && designPx && designPx.w > 0 && designPx.h > 0) {
    ctx.save();
    barrelPath(ctx);
    ctx.clip();
    const half: number = Math.min(Math.PI / 2 * 0.96, zoneMm.h / R / 2);
    const n = 28;
    const yAt = (v: number): number => CY + R * Math.sin((v * 2 - 1) * half);
    for (let i = 0; i < n; i++) {
      const v0: number = i / n;
      const v1: number = (i + 1) / n;
      const sy: number = v0 * designPx.h;
      const sh: number = Math.max(1, (v1 - v0) * designPx.h);
      const dy0: number = yAt(v0);
      const dy1: number = yAt(v1);
      // A hair of overlap hides the seams between slices.
      ctx.drawImage(design, 0, sy, designPx.w, sh, z.x, dy0, z.w, dy1 - dy0 + 0.02);
    }
    ctx.restore();
  }

  // Cylinder shading over body and print.
  barrelPath(ctx);
  shade(ctx, CY - R, CY + R);

  // Chrome ring between the nose and the barrel, and at the back.
  ctx.beginPath();
  ctx.rect(14.2, CY - 3.25, 1.1, 6.5);
  chrome(ctx, CY - 3.25, CY + 3.25);
  ctx.beginPath();
  ctx.rect(BARREL_END - 0.6, CY - R + 0.05, 1.2, 2 * R - 0.1);
  chrome(ctx, CY - R, CY + R);

  // Clip along the top.
  ctx.beginPath();
  ctx.moveTo(CLIP_X + 1, CY - R - 0.9);
  ctx.lineTo(BARREL_END - 0.5, CY - R - 1.6);
  ctx.lineTo(BARREL_END - 0.5, CY - R + 1.6);
  ctx.lineTo(BARREL_END - 5, CY - R + 1.6);
  ctx.lineTo(CLIP_X + 1, CY - R + 0.6);
  ctx.quadraticCurveTo(CLIP_X - 0.2, CY - R + 0.4, CLIP_X - 0.2, CY - R - 0.2);
  ctx.quadraticCurveTo(CLIP_X - 0.2, CY - R - 0.9, CLIP_X + 1, CY - R - 0.9);
  ctx.closePath();
  chrome(ctx, CY - R - 1.6, CY - R + 1.6);
  ctx.restore();
  return z;
}
