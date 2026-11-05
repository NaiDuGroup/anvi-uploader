import type { Rect } from "./document";

/**
 * Snapping while dragging in the Studio: the moved box's edges and centre
 * stick to the print area's centre lines and edges, the safe zone and the
 * other layers' edges / centres. Pure, in mm.
 */

export type SnapKind = "center" | "edge" | "safe" | "layer";

export interface SnapLine {
  at: number;
  kind: SnapKind;
}

export interface SnapTargets {
  x: SnapLine[];
  y: SnapLine[];
}

export interface SnapResult {
  dx: number;
  dy: number;
  /** Lines to show (mm). */
  guides: { x: SnapLine[]; y: SnapLine[] };
  /** Snapped to the area's centre (haptic tick on phones). */
  centered: boolean;
}

export function snapTargets(
  area: { widthMm: number; heightMm: number; safeMm: number },
  others: readonly Rect[],
): SnapTargets {
  const x: SnapLine[] = [
    { at: area.widthMm / 2, kind: "center" },
    { at: 0, kind: "edge" },
    { at: area.widthMm, kind: "edge" },
    { at: area.safeMm, kind: "safe" },
    { at: area.widthMm - area.safeMm, kind: "safe" },
  ];
  const y: SnapLine[] = [
    { at: area.heightMm / 2, kind: "center" },
    { at: 0, kind: "edge" },
    { at: area.heightMm, kind: "edge" },
    { at: area.safeMm, kind: "safe" },
    { at: area.heightMm - area.safeMm, kind: "safe" },
  ];
  for (const r of others) {
    x.push({ at: r.x, kind: "layer" }, { at: r.x + r.w / 2, kind: "layer" }, { at: r.x + r.w, kind: "layer" });
    y.push({ at: r.y, kind: "layer" }, { at: r.y + r.h / 2, kind: "layer" }, { at: r.y + r.h, kind: "layer" });
  }
  return { x, y };
}

function bestAxis(points: readonly number[], lines: readonly SnapLine[], threshold: number): { d: number; hits: SnapLine[] } {
  let best: number | null = null;
  for (const p of points) {
    for (const l of lines) {
      const d: number = l.at - p;
      if (Math.abs(d) <= threshold && (best == null || Math.abs(d) < Math.abs(best) - 1e-9)) best = d;
    }
  }
  if (best == null) return { d: 0, hits: [] };
  const hits: SnapLine[] = [];
  for (const p of points) {
    for (const l of lines) if (Math.abs(l.at - (p + best)) < 1e-6 && !hits.some((h) => h.at === l.at)) hits.push(l);
  }
  return { d: best, hits };
}

/** How far to move `box` (its bounds) to stick to the nearest lines within `threshold` mm. */
export function snapBox(box: Rect, targets: SnapTargets, threshold: number): SnapResult {
  const ax = bestAxis([box.x, box.x + box.w / 2, box.x + box.w], targets.x, threshold);
  const ay = bestAxis([box.y, box.y + box.h / 2, box.y + box.h], targets.y, threshold);
  return {
    dx: ax.d,
    dy: ay.d,
    guides: { x: ax.hits, y: ay.hits },
    centered: ax.hits.some((h) => h.kind === "center") || ay.hits.some((h) => h.kind === "center"),
  };
}
