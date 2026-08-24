import { DESIGN_DOC_VERSION, type DesignElement } from "./doc";

/**
 * Factory helpers for newly inserted elements. Sizes are expressed as a
 * fraction of the canvas so a new element looks sensible on both a wide mug
 * wrap (2480 × 1134) and a portrait notebook cover (1654 × 2528).
 */

export interface CanvasSize {
  width: number;
  height: number;
}

let counter = 0;

/** Short unique id, stable within a session. */
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export function createTextElement(
  canvas: CanvasSize,
  overrides: Partial<Omit<Extract<DesignElement, { kind: "text" }>, "kind">> = {},
): Extract<DesignElement, { kind: "text" }> {
  const width = Math.round(canvas.width * 0.7);
  const fontSizePx = Math.max(24, Math.round(Math.min(canvas.width, canvas.height) * 0.07));
  const height = Math.round(fontSizePx * 1.4);
  return {
    kind: "text",
    id: newId("t"),
    x: Math.round((canvas.width - width) / 2),
    y: Math.round(canvas.height * 0.1),
    width,
    height,
    rotation: 0,
    opacity: 1,
    text: "Текст",
    fontId: "montserrat",
    fontSizePx,
    fontWeight: 400,
    color: "#ffffff",
    align: "center",
    lineHeight: 1.25,
    letterSpacingPx: 0,
    ...overrides,
  };
}

export function createImageElement(
  canvas: CanvasSize,
  fileKey: string,
  srcKind: "asset" | "upload",
  naturalSize?: { width: number; height: number },
): Extract<DesignElement, { kind: "image" }> {
  // Fit the new image into ~55% of the canvas while keeping its aspect ratio.
  const targetLongSide = Math.round(Math.min(canvas.width, canvas.height) * 0.55);
  let width = targetLongSide;
  let height = targetLongSide;
  if (naturalSize && naturalSize.width > 0 && naturalSize.height > 0) {
    const ratio = naturalSize.width / naturalSize.height;
    if (ratio >= 1) {
      width = targetLongSide;
      height = Math.round(targetLongSide / ratio);
    } else {
      height = targetLongSide;
      width = Math.round(targetLongSide * ratio);
    }
  }
  return {
    kind: "image",
    id: newId("i"),
    x: Math.round((canvas.width - width) / 2),
    y: Math.round((canvas.height - height) / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
    srcKind,
    fileKey,
    fit: "contain",
    mask: "none",
    borderWidthPx: 0,
    borderColor: "#ffffff",
  };
}

export function createShapeElement(
  canvas: CanvasSize,
  shape: "rect" | "ellipse" | "line",
): Extract<DesignElement, { kind: "shape" }> {
  const size = Math.round(Math.min(canvas.width, canvas.height) * 0.3);
  const width = shape === "line" ? Math.round(canvas.width * 0.5) : size;
  const height = shape === "line" ? Math.max(4, Math.round(size * 0.06)) : size;
  return {
    kind: "shape",
    id: newId("s"),
    x: Math.round((canvas.width - width) / 2),
    y: Math.round((canvas.height - height) / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
    shape,
    fillColor: shape === "line" ? null : "#ffffff",
    strokeColor: "#ffffff",
    strokeWidthPx: shape === "line" ? Math.max(4, Math.round(size * 0.06)) : 0,
    cornerRadiusPx: 0,
  };
}

export const DESIGN_DOC_VERSION_CURRENT = DESIGN_DOC_VERSION;
