import type { StudioPenShape } from "./penZone";

/**
 * 2D picture of a push-button pen (side view, tip on the left) in the body
 * colour, with the print area wrapped on the barrel: the design rows follow
 * the cylinder (sin projection) and take the barrel's shading. Used by the
 * pen form (whole pen + magnified print area). Browser only (canvas).
 *
 * Geometry in mm: a 140 mm pen, 10 mm barrel; the print area sits between the
 * tapered nose and the clip. A pencil (`shape: "pencil"`, PARTAS) has a
 * sharpened wooden tip and a plain flat end — no clip, no push button, no
 * chrome. A pen set printed on its case (KIOTO) is drawn as the case
 * (`drawPenCase`).
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

/** Pencil: where the sharpened cone meets the body, and the flat back end. */
const PENCIL_BODY_X = 20;
const PENCIL_END = 140;

function barrelPath(ctx: Ctx, shape: StudioPenShape = "pen"): void {
  ctx.beginPath();
  if (shape === "pencil") {
    ctx.moveTo(PENCIL_BODY_X, CY - R);
    ctx.lineTo(PENCIL_END, CY - R);
    ctx.lineTo(PENCIL_END, CY + R);
    ctx.lineTo(PENCIL_BODY_X, CY + R);
    ctx.closePath();
    return;
  }
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
export function drawPenScene(
  ctx: Ctx,
  k: number,
  body: string,
  design: CanvasImageSource | null,
  designPx: { w: number; h: number } | null,
  zoneMm: { w: number; h: number },
  shape: StudioPenShape = "pen",
): PenZoneGeom {
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

  if (shape === "pencil") {
    const z = drawPencilBody(ctx, body, design, designPx, zoneMm);
    ctx.restore();
    return z;
  }

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
  wrapDesign(ctx, design, designPx, zoneMm, z, "pen");

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

/** The design wrapped on the cylinder (row slices), clipped to the barrel. */
function wrapDesign(ctx: Ctx, design: CanvasImageSource | null, designPx: { w: number; h: number } | null, zoneMm: { w: number; h: number }, z: PenZoneGeom, shape: StudioPenShape): void {
  if (!design || !designPx || designPx.w <= 0 || designPx.h <= 0) return;
  ctx.save();
  barrelPath(ctx, shape);
  ctx.clip();
  const half: number = Math.min((Math.PI / 2) * 0.96, zoneMm.h / R / 2);
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

/** A pencil: graphite point, sharpened wood cone, body in the colour, flat end. No clip, no button. */
function drawPencilBody(ctx: Ctx, body: string, design: CanvasImageSource | null, designPx: { w: number; h: number } | null, zoneMm: { w: number; h: number }): PenZoneGeom {
  // Sharpened wood (lighter than the body), scalloped where the paint ends.
  ctx.beginPath();
  ctx.moveTo(6, CY - 1.1);
  ctx.lineTo(PENCIL_BODY_X, CY - R);
  ctx.quadraticCurveTo(PENCIL_BODY_X - 1.6, CY - R / 2, PENCIL_BODY_X, CY);
  ctx.quadraticCurveTo(PENCIL_BODY_X - 1.6, CY + R / 2, PENCIL_BODY_X, CY + R);
  ctx.lineTo(6, CY + 1.1);
  ctx.closePath();
  const wood = ctx.createLinearGradient(0, CY - R, 0, CY + R);
  wood.addColorStop(0, "#c9a477");
  wood.addColorStop(0.3, "#f1d8b0");
  wood.addColorStop(1, "#b98f5e");
  ctx.fillStyle = wood;
  ctx.fill();
  // Graphite point.
  ctx.beginPath();
  ctx.moveTo(1.6, CY);
  ctx.lineTo(6.2, CY - 1.15);
  ctx.lineTo(6.2, CY + 1.15);
  ctx.closePath();
  ctx.fillStyle = "#3a3d42";
  ctx.fill();

  barrelPath(ctx, "pencil");
  ctx.fillStyle = body;
  ctx.fill();
  const z: PenZoneGeom = pencilZoneGeom(zoneMm);
  wrapDesign(ctx, design, designPx, zoneMm, z, "pencil");
  barrelPath(ctx, "pencil");
  shade(ctx, CY - R, CY + R, 0.8);
  // Facet lines of the body.
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 0.12;
  for (const f of [-0.5, 0.5]) {
    ctx.beginPath();
    ctx.moveTo(PENCIL_BODY_X, CY + R * f);
    ctx.lineTo(PENCIL_END, CY + R * f);
    ctx.stroke();
  }
  // Flat back end (the cut shows the wood and the lead).
  ctx.beginPath();
  ctx.ellipse(PENCIL_END, CY, 0.9, R, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#d9b98c";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(PENCIL_END, CY, 0.35, 1.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#3a3d42";
  ctx.fill();
  return z;
}

/** Where the print area sits on a pencil (centred on the body). */
function pencilZoneGeom(zoneMm: { w: number; h: number }): PenZoneGeom {
  const w: number = Math.min(zoneMm.w, PENCIL_END - PENCIL_BODY_X - 4);
  const x: number = (PENCIL_BODY_X + PENCIL_END) / 2 - w / 2 - 12;
  const half: number = Math.min((Math.PI / 2) * 0.96, zoneMm.h / R / 2);
  return { x: Math.max(PENCIL_BODY_X + 2, x), w, y0: CY - R * Math.sin(half), y1: CY + R * Math.sin(half) };
}

/** Where the print area sits on the drawn pen / pencil (mm in the scene). */
export function penShapeZoneGeom(zoneMm: { w: number; h: number }, shape: StudioPenShape = "pen"): PenZoneGeom {
  return shape === "pencil" ? pencilZoneGeom(zoneMm) : penZoneGeom(zoneMm);
}

/** A pen set's case (KIOTO 17 × 4.1 cm), seen from the top, mm. */
export const PEN_CASE_MM = { w: 170, h: 41, depth: 3.5 } as const;
/** Scene around the case (shadow and the visible front edge). */
export const PEN_CASE_SCENE_MM = { w: 180, h: 54 } as const;

export interface PenCaseGeom {
  /** Case top (lid) in the scene, mm. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Print area on the lid, mm. */
  zx: number;
  zy: number;
  zw: number;
  zh: number;
}

/** Where the case and its print area sit in the scene (pure). */
export function penCaseGeom(zoneMm: { w: number; h: number }): PenCaseGeom {
  const w: number = Math.max(PEN_CASE_MM.w, zoneMm.w + 10);
  const h: number = Math.max(PEN_CASE_MM.h, zoneMm.h + 8);
  const x: number = (PEN_CASE_SCENE_MM.w - w) / 2;
  const y: number = (PEN_CASE_SCENE_MM.h - h - PEN_CASE_MM.depth) / 2;
  return { x, y, w, h, zx: x + (w - zoneMm.w) / 2, zy: y + (h - zoneMm.h) / 2, zw: zoneMm.w, zh: zoneMm.h };
}

/**
 * The pen set's case seen from above with its front edge, in `body` (bamboo
 * for KIOTO): soft grain, the lid seam, the design printed flat on the lid.
 * Draws at `k` px per mm into a `PEN_CASE_SCENE_MM` scene.
 */
export function drawPenCase(ctx: Ctx, k: number, body: string, design: CanvasImageSource | null, zoneMm: { w: number; h: number }): PenCaseGeom {
  const g: PenCaseGeom = penCaseGeom(zoneMm);
  const rr = 2.2;
  ctx.save();
  ctx.scale(k, k);
  // Shadow.
  ctx.save();
  ctx.filter = `blur(${Math.max(1, 1.6 * k)}px)`;
  ctx.fillStyle = "rgba(20,33,61,0.25)";
  ctx.beginPath();
  ctx.roundRect(g.x + 1.5, g.y + 3, g.w - 3, g.h + PEN_CASE_MM.depth, rr);
  ctx.fill();
  ctx.restore();
  // Front edge (the box's height), darker.
  ctx.beginPath();
  ctx.roundRect(g.x, g.y + PEN_CASE_MM.depth * 0.4, g.w, g.h + PEN_CASE_MM.depth * 0.6, rr);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fill();
  // Lid.
  ctx.beginPath();
  ctx.roundRect(g.x, g.y, g.w, g.h, rr);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Bamboo grain: thin lengthwise streaks.
  ctx.lineWidth = 0.18;
  for (let i = 0; i < 26; i++) {
    const yy: number = g.y + ((i + 0.5) / 26) * g.h + Math.sin(i * 2.3) * 0.4;
    ctx.strokeStyle = i % 3 === 0 ? "rgba(90,60,20,0.10)" : "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.moveTo(g.x, yy);
    ctx.bezierCurveTo(g.x + g.w * 0.3, yy + 0.3, g.x + g.w * 0.7, yy - 0.3, g.x + g.w, yy);
    ctx.stroke();
  }
  // Light from the top.
  const lg = ctx.createLinearGradient(0, g.y, 0, g.y + g.h);
  lg.addColorStop(0, "rgba(255,255,255,0.22)");
  lg.addColorStop(0.5, "rgba(255,255,255,0)");
  lg.addColorStop(1, "rgba(0,0,0,0.10)");
  ctx.fillStyle = lg;
  ctx.fillRect(g.x, g.y, g.w, g.h);
  // The print, flat on the lid.
  if (design) ctx.drawImage(design, g.zx, g.zy, g.zw, g.zh);
  ctx.restore();
  // Lid seam near the hinge side.
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  ctx.moveTo(g.x + 0.8, g.y + g.h - 2.4);
  ctx.lineTo(g.x + g.w - 0.8, g.y + g.h - 2.4);
  ctx.stroke();
  ctx.restore();
  return g;
}
