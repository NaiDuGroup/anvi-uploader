/**
 * Shared Canvas2D drawing primitives.
 *
 * Extracted from `src/lib/mug/canvasRenderer.ts` and
 * `src/lib/notebook/canvasRenderer.ts` (which were byte-for-byte copies of
 * each other apart from placeholder font sizes and the auto-fit start size)
 * so the Design Studio renderer can reuse the exact same fit / mask / shadow
 * math. The two legacy renderers now import from here; their visual output
 * is unchanged.
 */

export type PhotoMaskKind = "rect" | "circle" | "heart" | "rounded";

export interface SlotShadow {
  readonly dx: number;
  readonly dy: number;
  readonly blur: number;
  readonly color: string;
}

/** A rectangular drawing target, optionally rotated / masked / decorated. */
export interface SlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  mask?: PhotoMaskKind;
  borderWidth?: number;
  borderColor?: string;
  shadow?: SlotShadow;
}

export interface SlotFitSettings {
  fitMode: "cover" | "contain";
  alignment: "left" | "center" | "right";
  verticalAlignment: "top" | "center" | "bottom";
}

export const DEFAULT_SLOT_FIT: SlotFitSettings = {
  fitMode: "cover",
  alignment: "center",
  verticalAlignment: "center",
};

/**
 * Build a clipping path in *local* (slot-relative) coordinates, so we can
 * rotate around the slot's centre and still mask correctly.
 *
 * For `"rect"` (the default) we don't allocate a path — callers skip
 * clipping entirely so existing templates produce byte-identical output.
 */
export function buildLocalMaskPath(
  mask: PhotoMaskKind,
  w: number,
  h: number,
): Path2D | null {
  if (mask === "rect") return null;
  const path = new Path2D();

  if (mask === "circle") {
    const r = Math.min(w, h) / 2;
    path.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    return path;
  }

  if (mask === "rounded") {
    const r = Math.min(w, h) * 0.18;
    return buildRoundedRectPath(w, h, r);
  }

  // Heart: scale a 100-unit reference path to (w, h).
  // Reference is centred at (50, 55) with the tip ~ (50, 95).
  const sx = w / 100;
  const sy = h / 100;
  const X = (n: number) => n * sx;
  const Y = (n: number) => n * sy;
  path.moveTo(X(50), Y(95));
  path.bezierCurveTo(X(50), Y(72), X(0), Y(60), X(0), Y(30));
  path.bezierCurveTo(X(0), Y(8), X(30), Y(0), X(50), Y(28));
  path.bezierCurveTo(X(70), Y(0), X(100), Y(8), X(100), Y(30));
  path.bezierCurveTo(X(100), Y(60), X(50), Y(72), X(50), Y(95));
  path.closePath();
  return path;
}

/** Rounded-rect path anchored at (0, 0). Used for masks and cover clipping. */
export function buildRoundedRectPath(w: number, h: number, r: number): Path2D {
  const path = new Path2D();
  path.moveTo(r, 0);
  path.lineTo(w - r, 0);
  path.quadraticCurveTo(w, 0, w, r);
  path.lineTo(w, h - r);
  path.quadraticCurveTo(w, h, w - r, h);
  path.lineTo(r, h);
  path.quadraticCurveTo(0, h, 0, h - r);
  path.lineTo(0, r);
  path.quadraticCurveTo(0, 0, r, 0);
  path.closePath();
  return path;
}

/**
 * Image-into-rect helper shared by the fast path and the decorated path so
 * cover/contain logic stays identical everywhere.
 */
export function drawCoverOrContainRect(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  slot: SlotRect,
  settings: SlotFitSettings,
): void {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const slotRatio = slot.width / slot.height;

  if (settings.fitMode === "contain") {
    let dw: number, dh: number;
    if (imgRatio > slotRatio) {
      dw = slot.width;
      dh = slot.width / imgRatio;
    } else {
      dh = slot.height;
      dw = slot.height * imgRatio;
    }
    const dx = slot.x + (slot.width - dw) / 2;
    const dy = slot.y + (slot.height - dh) / 2;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, dy, dw, dh);
    return;
  }

  let sx: number, sy: number, sw: number, sh: number;

  if (imgRatio > slotRatio) {
    sh = img.naturalHeight;
    sw = sh * slotRatio;
    const maxOffset = img.naturalWidth - sw;
    if (settings.alignment === "left") {
      sx = 0;
    } else if (settings.alignment === "right") {
      sx = maxOffset;
    } else {
      sx = maxOffset / 2;
    }
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = sw / slotRatio;
    sx = 0;
    const maxOffsetY = img.naturalHeight - sh;
    if (settings.verticalAlignment === "top") {
      sy = 0;
    } else if (settings.verticalAlignment === "bottom") {
      sy = maxOffsetY;
    } else {
      sy = maxOffsetY / 2;
    }
  }

  ctx.drawImage(img, sx, sy, sw, sh, slot.x, slot.y, slot.width, slot.height);
}

/**
 * Draw a single photo into its slot, honouring optional rotation, mask, border,
 * shadow, and fit/alignment settings. When the slot is a plain rectangle with
 * no decorative options the path collapses to a single `ctx.drawImage` call
 * (same behaviour as the legacy renderer).
 */
export function drawPhotoIntoSlot(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  slot: SlotRect,
  settings: SlotFitSettings = DEFAULT_SLOT_FIT,
): void {
  const hasRotation = typeof slot.rotation === "number" && slot.rotation !== 0;
  const hasShadow = !!slot.shadow;
  const hasBorder = !!(slot.borderWidth && slot.borderWidth > 0);
  const mask: PhotoMaskKind = slot.mask ?? "rect";

  // Fast path: legacy rectangle slot. Preserves byte-identical output for the
  // pre-existing templates (no save/restore, no extra path).
  if (!hasRotation && !hasShadow && !hasBorder && mask === "rect") {
    drawCoverOrContainRect(ctx, img, slot, settings);
    return;
  }

  ctx.save();

  // Rotate around slot centre, then draw in local coordinates (0,0)–(w,h).
  if (hasRotation) {
    const cx = slot.x + slot.width / 2;
    const cy = slot.y + slot.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(slot.rotation!);
    ctx.translate(-slot.width / 2, -slot.height / 2);
  } else {
    ctx.translate(slot.x, slot.y);
  }

  const localSlot: SlotRect = {
    x: 0,
    y: 0,
    width: slot.width,
    height: slot.height,
  };

  const maskPath = buildLocalMaskPath(mask, slot.width, slot.height);

  // Shadow lives on a transparent layer so it doesn't bleed into the mask:
  // we paint a filled mask shape with shadow set, then the image is drawn on
  // top leaving only the dropped shadow visible underneath.
  if (hasShadow) {
    ctx.save();
    ctx.shadowOffsetX = slot.shadow!.dx;
    ctx.shadowOffsetY = slot.shadow!.dy;
    ctx.shadowBlur = slot.shadow!.blur;
    ctx.shadowColor = slot.shadow!.color;
    ctx.fillStyle = "rgba(0,0,0,1)";
    if (maskPath) {
      ctx.fill(maskPath);
    } else {
      ctx.fillRect(0, 0, slot.width, slot.height);
    }
    ctx.restore();
  }

  if (maskPath) {
    ctx.save();
    ctx.clip(maskPath);
    drawCoverOrContainRect(ctx, img, localSlot, settings);
    ctx.restore();
  } else {
    drawCoverOrContainRect(ctx, img, localSlot, settings);
  }

  if (hasBorder) {
    ctx.lineWidth = slot.borderWidth!;
    ctx.strokeStyle = slot.borderColor ?? "#ffffff";
    if (maskPath) {
      ctx.stroke(maskPath);
    } else {
      ctx.strokeRect(0, 0, slot.width, slot.height);
    }
  }

  ctx.restore();
}

export interface PlaceholderFontOptions {
  /** Font size used by the legacy fast path (plain rect slot). */
  fastFontPx: number;
  /** Font size used by the decorated (rotated/masked/bordered) path. */
  decoratedFontPx: number;
}

/**
 * Placeholder rectangle drawn when a photo slot has no uploaded image yet.
 * Honours the slot's mask + rotation + border so thumbnails and the live
 * editor preview convey the template's true shape (heart, circle, polaroid…).
 */
export function drawPhotoPlaceholder(
  ctx: CanvasRenderingContext2D,
  slot: SlotRect,
  index: number,
  fonts: PlaceholderFontOptions,
): void {
  const hasRotation = typeof slot.rotation === "number" && slot.rotation !== 0;
  const mask: PhotoMaskKind = slot.mask ?? "rect";
  const hasBorder = !!(slot.borderWidth && slot.borderWidth > 0);

  if (!hasRotation && mask === "rect" && !hasBorder) {
    // Legacy placeholder path — preserves byte-identical thumbnails.
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
    ctx.fillStyle = "#9ca3af";
    ctx.font = `bold ${fonts.fastFontPx}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `Photo ${index + 1}`,
      slot.x + slot.width / 2,
      slot.y + slot.height / 2,
    );
    return;
  }

  ctx.save();
  if (hasRotation) {
    const cx = slot.x + slot.width / 2;
    const cy = slot.y + slot.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(slot.rotation!);
    ctx.translate(-slot.width / 2, -slot.height / 2);
  } else {
    ctx.translate(slot.x, slot.y);
  }

  const maskPath = buildLocalMaskPath(mask, slot.width, slot.height);
  ctx.fillStyle = "#e5e7eb";
  if (maskPath) {
    ctx.fill(maskPath);
  } else {
    ctx.fillRect(0, 0, slot.width, slot.height);
  }

  ctx.fillStyle = "#9ca3af";
  ctx.font = `bold ${fonts.decoratedFontPx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Photo ${index + 1}`, slot.width / 2, slot.height / 2);

  if (hasBorder) {
    ctx.lineWidth = slot.borderWidth!;
    ctx.strokeStyle = slot.borderColor ?? "#ffffff";
    if (maskPath) {
      ctx.stroke(maskPath);
    } else {
      ctx.strokeRect(0, 0, slot.width, slot.height);
    }
  }

  ctx.restore();
}

/** Greedy word wrap against `ctx.measureText`. Never returns an empty array. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  if (lines.length === 0) lines.push("");
  return lines;
}

/**
 * Largest bold font size (stepping down by 4 from `startSize`) at which the
 * wrapped text fits into `maxWidth` × `maxHeight` with a 1.3 line height.
 */
export function computeAutoFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  maxWidth: number,
  maxHeight: number,
  startSize: number,
): number {
  let fontSize = startSize;
  const minSize = 28;

  while (fontSize > minSize) {
    ctx.font = `bold ${fontSize}px "${fontFamily}", sans-serif`;
    const lineHeight = fontSize * 1.3;
    const lines = wrapText(ctx, text, maxWidth);
    const totalHeight = lines.length * lineHeight;
    if (totalHeight <= maxHeight) return fontSize;
    fontSize -= 4;
  }

  return minSize;
}
