/**
 * Fit of the print area in the editor viewport, keeping clear of a floating
 * corner card (the live 3D preview dock). Pure.
 *
 * Without a reserved corner (or when the centred area does not reach it) the
 * area is centred in the whole viewport as before. When it would run under
 * the card, the larger of two layouts wins: the area beside the card (the
 * card's column taken off the width) or above / below it (its row taken off
 * the height) — so at fit zoom the design is never covered, at any width.
 */

export interface CanvasReserve {
  /** Width / height of the corner card including its offset from the edges (px). */
  w: number;
  h: number;
  corner: "bottom-right" | "top-right";
}

export interface CanvasFit {
  /** Pixels per mm at zoom 1. */
  fit: number;
  /** Centre of the area the print area is centred in (px). */
  cx: number;
  cy: number;
}

export function fitCanvas(
  view: { w: number; h: number },
  area: { w: number; h: number },
  margin: number,
  reserve?: CanvasReserve | null,
): CanvasFit {
  const scaleIn = (w: number, h: number): number => Math.max(0.1, Math.min((w - margin * 2) / area.w, (h - margin * 2) / area.h));
  const full: CanvasFit = { fit: scaleIn(view.w, view.h), cx: view.w / 2, cy: view.h / 2 };
  if (!reserve || reserve.w <= 0 || reserve.h <= 0 || view.w <= 0 || view.h <= 0) return full;
  const top: boolean = reserve.corner === "top-right";
  // Does the centred area (with its margin) reach into the card's corner?
  const right: number = full.cx + (area.w * full.fit) / 2 + margin;
  const hits: boolean = top ? right > view.w - reserve.w && full.cy - (area.h * full.fit) / 2 - margin < reserve.h : right > view.w - reserve.w && full.cy + (area.h * full.fit) / 2 + margin > view.h - reserve.h;
  if (!hits) return full;
  const sideW: number = Math.max(1, view.w - reserve.w);
  const rowH: number = Math.max(1, view.h - reserve.h);
  const beside: CanvasFit = { fit: scaleIn(sideW, view.h), cx: sideW / 2, cy: view.h / 2 };
  const above: CanvasFit = { fit: scaleIn(view.w, rowH), cx: view.w / 2, cy: top ? reserve.h + rowH / 2 : rowH / 2 };
  return beside.fit >= above.fit ? beside : above;
}
