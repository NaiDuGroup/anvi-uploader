import type { DesignDoc, DesignElement } from "./doc";
import type { CanvasSize } from "./defaults";

export type PlaceSide = "below" | "above";
export type CanvasAlign = "left" | "center" | "right" | "top" | "middle" | "bottom";

export function placementGap(canvas: CanvasSize): number {
  return Math.max(8, Math.round(Math.min(canvas.width, canvas.height) * 0.03));
}

/**
 * Sit `incoming` under or above `anchor`, matching the anchor's horizontal
 * centre. With no anchor the element is left as-is (factory defaults).
 */
export function placeRelativeTo(
  incoming: DesignElement,
  anchor: DesignElement | null,
  canvas: CanvasSize,
  side: PlaceSide = "below",
): DesignElement {
  if (!anchor) return incoming;
  const gap = placementGap(canvas);
  const x = Math.round(anchor.x + (anchor.width - incoming.width) / 2);
  const y =
    side === "below"
      ? Math.round(anchor.y + anchor.height + gap)
      : Math.round(anchor.y - incoming.height - gap);
  return {
    ...incoming,
    x: clamp(x, 0, canvas.width - incoming.width),
    y: clamp(y, 0, canvas.height - incoming.height),
  };
}

/**
 * Shift every element whose top is at or below `insertY` down by `shift`,
 * keeping boxes on the canvas. `exceptId` (the newly inserted box) is skipped.
 */
export function pushElementsBelow(
  elements: readonly DesignElement[],
  insertY: number,
  shift: number,
  canvasHeight: number,
  exceptId: string,
): DesignElement[] {
  if (shift <= 0) return [...elements];
  return elements.map((el) => {
    if (el.id === exceptId || el.y < insertY) return el;
    const y = clamp(el.y + shift, 0, Math.max(0, canvasHeight - el.height));
    return y === el.y ? el : { ...el, y };
  });
}

export function insertRelative(
  doc: DesignDoc,
  incoming: DesignElement,
  anchor: DesignElement | null,
  canvas: CanvasSize,
  side: PlaceSide = "below",
): { doc: DesignDoc; placed: DesignElement } {
  const placed = placeRelativeTo(incoming, anchor, canvas, side);
  if (!anchor) {
    return { placed, doc: { ...doc, elements: [...doc.elements, placed] } };
  }
  const shifted = pushElementsBelow(
    doc.elements,
    placed.y,
    placed.height + placementGap(canvas),
    canvas.height,
    placed.id,
  );
  return {
    placed,
    doc: { ...doc, elements: [...shifted, placed] },
  };
}

export function alignToCanvas(
  el: DesignElement,
  edge: CanvasAlign,
  canvas: CanvasSize,
): { x: number; y: number } {
  switch (edge) {
    case "left":
      return { x: 0, y: el.y };
    case "center":
      return { x: Math.round((canvas.width - el.width) / 2), y: el.y };
    case "right":
      return { x: Math.round(canvas.width - el.width), y: el.y };
    case "top":
      return { x: el.x, y: 0 };
    case "middle":
      return { x: el.x, y: Math.round((canvas.height - el.height) / 2) };
    case "bottom":
      return { x: el.x, y: Math.round(canvas.height - el.height) };
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
