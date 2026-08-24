import {
  buildLocalMaskPath,
  buildRoundedRectPath,
  drawCoverOrContainRect,
  type PhotoMaskKind,
} from "./canvasPrimitives";
import type {
  DesignDoc,
  DesignElement,
  ImageElement,
  ShapeElement,
  TextElement,
} from "./doc";

/**
 * Design Studio renderer: draws a `DesignDoc` onto a Canvas2D surface.
 *
 * The document lives in print-pixel space; `scale` maps it onto the target
 * canvas (1 for export, <1 for the interactive preview). The renderer is
 * deliberately stateless — images arrive pre-loaded in a cache keyed by the
 * element's `fileKey`, fonts are resolved to concrete CSS family names by the
 * caller.
 */

export interface RenderDesignOptions {
  doc: DesignDoc;
  /** Document size in print pixels. */
  docWidth: number;
  docHeight: number;
  /** Canvas pixels per doc pixel. */
  scale: number;
  /** Loaded bitmaps keyed by `ImageElement.fileKey`. Missing = placeholder. */
  images: ReadonlyMap<string, HTMLImageElement>;
  /** Maps a `fontId` to a canvas-usable CSS family name. */
  resolveFontFamily: (fontId: string) => string;
  /** Draw a subtle dashed placeholder for images that are still loading. */
  showPlaceholders?: boolean;
}

export function renderDesignDoc(
  canvas: HTMLCanvasElement,
  options: RenderDesignOptions,
): void {
  const { doc, docWidth, docHeight, scale } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const outW = Math.max(1, Math.round(docWidth * scale));
  const outH = Math.max(1, Math.round(docHeight * scale));
  if (canvas.width !== outW) canvas.width = outW;
  if (canvas.height !== outH) canvas.height = outH;

  ctx.clearRect(0, 0, outW, outH);
  ctx.save();
  ctx.scale(scale, scale);

  if (doc.background.color !== "transparent") {
    ctx.fillStyle = doc.background.color;
    ctx.fillRect(0, 0, docWidth, docHeight);
  }

  for (const element of doc.elements) {
    drawElement(ctx, element, options);
  }

  ctx.restore();
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  element: DesignElement,
  options: RenderDesignOptions,
): void {
  ctx.save();
  ctx.globalAlpha = element.opacity;

  // Rotate around the element centre, then work in local (0,0)–(w,h) coords.
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  ctx.translate(cx, cy);
  if (element.rotation !== 0) {
    ctx.rotate((element.rotation * Math.PI) / 180);
  }
  ctx.translate(-element.width / 2, -element.height / 2);

  switch (element.kind) {
    case "text":
      drawTextElement(ctx, element, options.resolveFontFamily);
      break;
    case "image":
      drawImageElement(ctx, element, options);
      break;
    case "shape":
      drawShapeElement(ctx, element);
      break;
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function textElementFont(
  element: Pick<TextElement, "fontSizePx" | "fontWeight" | "italic">,
  family: string,
): string {
  const italic = element.italic ? "italic " : "";
  return `${italic}${element.fontWeight} ${element.fontSizePx}px "${family}", sans-serif`;
}

function displayText(element: TextElement): string {
  return element.uppercase ? element.text.toUpperCase() : element.text;
}

interface LetterSpacingCapable {
  letterSpacing?: string;
}

function applyLetterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  // `letterSpacing` is a newer Canvas2D API; it exists in all evergreen
  // browsers we target. If missing, text renders without tracking.
  const spacingCtx = ctx as CanvasRenderingContext2D & LetterSpacingCapable;
  if ("letterSpacing" in spacingCtx) {
    spacingCtx.letterSpacing = `${px}px`;
  }
}

/**
 * Wrap the element's text (respecting hard `\n` breaks) into lines that fit
 * the element width using the *current* ctx.font.
 */
function wrapElementText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    lines.push(current);
  }
  if (lines.length === 0) lines.push("");
  return lines;
}

/**
 * Measure the wrapped height of a text element (doc pixels). Used by the
 * editor to auto-grow the box when the content or font changes.
 */
export function measureTextElementHeight(
  ctx: CanvasRenderingContext2D,
  element: TextElement,
  family: string,
): number {
  ctx.save();
  ctx.font = textElementFont(element, family);
  applyLetterSpacing(ctx, element.letterSpacingPx);
  const lines = wrapElementText(ctx, displayText(element), element.width);
  ctx.restore();
  return Math.max(
    element.fontSizePx * element.lineHeight,
    lines.length * element.fontSizePx * element.lineHeight,
  );
}

function drawTextElement(
  ctx: CanvasRenderingContext2D,
  element: TextElement,
  resolveFontFamily: (fontId: string) => string,
): void {
  const family = resolveFontFamily(element.fontId);
  ctx.font = textElementFont(element, family);
  applyLetterSpacing(ctx, element.letterSpacingPx);
  ctx.fillStyle = element.color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = element.align;

  const lines = wrapElementText(ctx, displayText(element), element.width);
  const lineHeightPx = element.fontSizePx * element.lineHeight;

  let x: number;
  if (element.align === "left") {
    x = 0;
  } else if (element.align === "right") {
    x = element.width;
  } else {
    x = element.width / 2;
  }

  // First baseline sits roughly one cap-height below the top of the box;
  // 0.8em is a good cross-font approximation and keeps the visual top of the
  // text aligned with the selection frame.
  const firstBaseline = element.fontSizePx * 0.8 + (lineHeightPx - element.fontSizePx) / 2;

  lines.forEach((line, i) => {
    if (line === "") return;
    ctx.fillText(line, x, firstBaseline + i * lineHeightPx);
  });
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function drawImageElement(
  ctx: CanvasRenderingContext2D,
  element: ImageElement,
  options: RenderDesignOptions,
): void {
  const img = options.images.get(element.fileKey);
  const w = element.width;
  const h = element.height;

  if (!img || !img.complete || img.naturalWidth === 0) {
    if (options.showPlaceholders) {
      ctx.save();
      ctx.strokeStyle = "#9ca3af";
      ctx.setLineDash([12, 8]);
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, w, h);
      ctx.fillStyle = "rgba(229, 231, 235, 0.5)";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    return;
  }

  const mask: PhotoMaskKind = element.mask === "none" ? "rect" : element.mask;
  const maskPath = buildLocalMaskPath(mask, w, h);

  ctx.save();
  if (element.flipH) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }

  const drawBody = () => {
    drawCoverOrContainRect(
      ctx,
      img,
      { x: 0, y: 0, width: w, height: h },
      { fitMode: element.fit, alignment: "center", verticalAlignment: "center" },
    );
  };

  if (maskPath) {
    ctx.save();
    ctx.clip(maskPath);
    drawBody();
    ctx.restore();
  } else {
    drawBody();
  }

  if (element.borderWidthPx > 0) {
    ctx.lineWidth = element.borderWidthPx;
    ctx.strokeStyle = element.borderColor;
    if (maskPath) {
      ctx.stroke(maskPath);
    } else {
      ctx.strokeRect(0, 0, w, h);
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

function drawShapeElement(
  ctx: CanvasRenderingContext2D,
  element: ShapeElement,
): void {
  const w = element.width;
  const h = element.height;

  if (element.shape === "line") {
    // A horizontal rule across the vertical centre of the box; the stroke
    // width doubles as the line thickness.
    const thickness = Math.max(1, element.strokeWidthPx || 4);
    ctx.strokeStyle = element.strokeColor;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    return;
  }

  let path: Path2D;
  if (element.shape === "ellipse") {
    path = new Path2D();
    path.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (element.cornerRadiusPx > 0) {
    const r = Math.min(element.cornerRadiusPx, Math.min(w, h) / 2);
    path = buildRoundedRectPath(w, h, r);
  } else {
    path = new Path2D();
    path.rect(0, 0, w, h);
  }

  if (element.fillColor) {
    ctx.fillStyle = element.fillColor;
    ctx.fill(path);
  }
  if (element.strokeWidthPx > 0) {
    ctx.lineWidth = element.strokeWidthPx;
    ctx.strokeStyle = element.strokeColor;
    ctx.stroke(path);
  }
}
