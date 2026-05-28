import {
  type NotebookTemplate,
  type NotebookDecoration,
  type PhotoSlot,
  type PhotoSettings,
  type PhotoMask,
  DEFAULT_PHOTO_SETTINGS,
} from "./templates";

export interface RenderOptions {
  template: NotebookTemplate;
  photos: HTMLImageElement[];
  photoSettings?: PhotoSettings[];
  text: string;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
}

/**
 * Build a clipping path in *local* (slot-relative) coordinates, so we can
 * rotate around the slot's centre and still mask correctly. For `"rect"`
 * we don't allocate a path — callers skip clipping entirely so existing
 * templates produce byte-identical output.
 */
function buildLocalMaskPath(mask: PhotoMask, w: number, h: number): Path2D | null {
  if (mask === "rect") return null;
  const path = new Path2D();

  if (mask === "circle") {
    const r = Math.min(w, h) / 2;
    path.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    return path;
  }

  if (mask === "rounded") {
    const r = Math.min(w, h) * 0.18;
    path.moveTo(r, 0);
    path.lineTo(w - r, 0);
    path.quadraticCurveTo(w, 0, w, r);
    path.lineTo(w, h - r);
    path.quadraticCurveTo(w, h, w - r, h);
    path.lineTo(r, h);
    path.quadraticCurveTo(0, h, 0, h - r);
    path.lineTo(0, r);
    path.quadraticCurveTo(0, 0, r, 0);
    return path;
  }

  // Heart: scale a 100-unit reference path to (w, h). Reference is
  // centred at (50, 55) with the tip near (50, 95).
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

function drawDecoration(
  ctx: CanvasRenderingContext2D,
  decoration: NotebookDecoration,
): void {
  ctx.save();
  ctx.fillStyle = decoration.color;
  if (decoration.kind === "darkBand") {
    ctx.fillRect(decoration.x, decoration.y, decoration.width, decoration.height);
  } else {
    const heartPath = buildLocalMaskPath("heart", decoration.size, decoration.size);
    if (heartPath) {
      ctx.translate(decoration.x, decoration.y);
      ctx.fill(heartPath);
    }
  }
  ctx.restore();
}

/**
 * Image-into-rect helper used by both the fast and decorated rendering
 * paths so cover/contain logic is shared.
 */
function drawCoverOrContainRect(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  slot: PhotoSlot,
  settings: PhotoSettings,
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
 * Draw a single photo into its slot, honouring optional rotation, mask,
 * border, shadow, and fit/alignment settings. When the slot is a plain
 * rectangle with no decorative options the path collapses to a single
 * `ctx.drawImage` call (same behaviour as the legacy renderer).
 */
function drawPhotoIntoSlot(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  slot: PhotoSlot,
  settings: PhotoSettings = DEFAULT_PHOTO_SETTINGS,
): void {
  const hasRotation = typeof slot.rotation === "number" && slot.rotation !== 0;
  const hasShadow = !!slot.shadow;
  const hasBorder = !!(slot.borderWidth && slot.borderWidth > 0);
  const mask: PhotoMask = slot.mask ?? "rect";

  // Fast path: legacy rectangle slot. Preserves byte-identical output for
  // the existing 4 templates (no save/restore, no extra path).
  if (!hasRotation && !hasShadow && !hasBorder && mask === "rect") {
    drawCoverOrContainRect(ctx, img, slot, settings);
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

  const localSlot: PhotoSlot = {
    x: 0,
    y: 0,
    width: slot.width,
    height: slot.height,
  };

  const maskPath = buildLocalMaskPath(mask, slot.width, slot.height);

  // Shadow lives on a transparent layer so it doesn't bleed into the
  // mask: we paint a filled mask shape with shadow set, then erase the
  // fill leaving only the dropped shadow underneath the image.
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

/**
 * Placeholder rectangle drawn when a photo slot has no uploaded image
 * yet. Honours the slot's mask + rotation + border so thumbnails and the
 * live editor preview convey the template's true shape.
 */
function drawPhotoPlaceholder(
  ctx: CanvasRenderingContext2D,
  slot: PhotoSlot,
  index: number,
): void {
  const hasRotation = typeof slot.rotation === "number" && slot.rotation !== 0;
  const mask: PhotoMask = slot.mask ?? "rect";
  const hasBorder = !!(slot.borderWidth && slot.borderWidth > 0);

  if (!hasRotation && mask === "rect" && !hasBorder) {
    // Legacy placeholder path — preserves byte-identical thumbnails.
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "bold 56px sans-serif";
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
  ctx.font = "bold 48px sans-serif";
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

function wrapText(
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

function computeFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  maxWidth: number,
  maxHeight: number,
): number {
  let fontSize = 140;
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

/**
 * Cover corner rounding as a fraction of the shorter canvas dimension.
 * Picks up real-world notebook proportions (≈5–6 mm radius at 300 DPI A5)
 * without changing any template coordinates or sizes — the corners simply
 * stay transparent in the output PNG. The 2D preview's container is
 * `bg-gray-50`, and the 3D plane material is `transparent: true`, so
 * both surfaces honour the rounding automatically.
 */
const COVER_CORNER_RADIUS_RATIO = 0.04;

function buildRoundedCoverPath(W: number, H: number, r: number): Path2D {
  const path = new Path2D();
  path.moveTo(r, 0);
  path.lineTo(W - r, 0);
  path.quadraticCurveTo(W, 0, W, r);
  path.lineTo(W, H - r);
  path.quadraticCurveTo(W, H, W - r, H);
  path.lineTo(r, H);
  path.quadraticCurveTo(0, H, 0, H - r);
  path.lineTo(0, r);
  path.quadraticCurveTo(0, 0, r, 0);
  path.closePath();
  return path;
}

export function renderNotebookLayout(
  canvas: HTMLCanvasElement,
  options: RenderOptions,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Canvas dimensions come from the template (built with `buildNotebookTemplates`),
  // so non-A5 hardcovers automatically scale here.
  const W = options.template.canvasWidth;
  const H = options.template.canvasHeight;
  canvas.width = W;
  canvas.height = H;

  ctx.clearRect(0, 0, W, H);

  // Clip the entire render to a rounded-rect cover shape so the corners stay
  // transparent. This keeps every template's slot/text coordinates untouched
  // while giving the 2D preview, the 3D plane texture, and the printed PNG
  // soft notebook corners.
  const cornerRadius = Math.round(Math.min(W, H) * COVER_CORNER_RADIUS_RATIO);
  if (cornerRadius > 0) {
    ctx.clip(buildRoundedCoverPath(W, H, cornerRadius));
  }

  if (options.backgroundColor !== "transparent") {
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, W, H);
  }

  const { template, photos, photoSettings, text, fontFamily, textColor } = options;

  template.photoSlots.forEach((slot, i) => {
    if (photos[i]) {
      drawPhotoIntoSlot(ctx, photos[i], slot, photoSettings?.[i]);
    } else {
      drawPhotoPlaceholder(ctx, slot, i);
    }
  });

  // Decorations sit between photos and text so the caption always wins z-order.
  template.decorations?.forEach((decoration) => drawDecoration(ctx, decoration));

  if (text.trim()) {
    const ts = template.textSlot;
    const fontSize = computeFontSize(ctx, text, fontFamily, ts.width, ts.height);
    ctx.font = `bold ${fontSize}px "${fontFamily}", sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textAlign = ts.align;
    ctx.textBaseline = ts.baseline;

    const lineHeight = fontSize * 1.3;
    const lines = wrapText(ctx, text, ts.width);
    const totalHeight = lines.length * lineHeight;

    let startY: number;
    if (ts.baseline === "middle") {
      startY = ts.y - totalHeight / 2 + lineHeight / 2;
    } else if (ts.baseline === "bottom") {
      startY = ts.y - totalHeight + lineHeight;
    } else {
      startY = ts.y;
    }

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], ts.x, startY + i * lineHeight);
    }
  }
}

export function renderNotebookThumbnail(
  canvas: HTMLCanvasElement,
  template: NotebookTemplate,
): void {
  renderNotebookLayout(canvas, {
    template,
    photos: [],
    text: "Text",
    fontFamily: "sans-serif",
    textColor: "#374151",
    backgroundColor: "#ffffff",
  });
}
