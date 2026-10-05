import {
  type PenTemplate,
  type PhotoSettings,
  type PhotoSlot,
  type TextSlot,
  DEFAULT_PHOTO_SETTINGS,
} from "./templates";
import {
  computeAutoFontSize,
  drawPhotoIntoSlot,
  drawPhotoPlaceholder,
  wrapText,
} from "@/lib/design/canvasPrimitives";

export interface RenderOptions {
  template: PenTemplate;
  photos: HTMLImageElement[];
  photoSettings?: PhotoSettings[];
  text: string;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
}

const AUTO_FONT_START_PX = 60;

/** Width of the "Photo N" placeholder label, as a multiple of its font size. */
const PLACEHOLDER_LABEL_RATIO = 4.3;

/**
 * Placeholder label sized to the slot. A fixed size overflows the logo square
 * on pens whose print area is only a few millimetres tall.
 */
function placeholderFonts(slot: PhotoSlot) {
  const px = Math.max(
    7,
    Math.min(24, Math.floor(slot.width / PLACEHOLDER_LABEL_RATIO)),
  );
  return { fastFontPx: px, decoratedFontPx: px };
}

/**
 * Lower bound for the auto-sizer. Never above the shared 28px default, so mug-
 * sized pen canvases keep rendering exactly as before.
 */
function minFontFor(canvasHeight: number): number {
  return Math.min(28, Math.max(6, Math.round(canvasHeight * 0.18)));
}

function drawTextSlot(
  ctx: CanvasRenderingContext2D,
  slot: TextSlot,
  text: string,
  fontFamily: string,
  textColor: string,
  minFont: number,
): void {
  const fontSize = computeAutoFontSize(
    ctx,
    text,
    fontFamily,
    slot.width,
    slot.height,
    AUTO_FONT_START_PX,
    minFont,
  );
  ctx.font = `bold ${fontSize}px "${fontFamily}", sans-serif`;
  ctx.fillStyle = textColor;
  ctx.textAlign = slot.align;
  ctx.textBaseline = slot.baseline;

  const lineHeight = fontSize * 1.3;
  const lines = wrapText(ctx, text, slot.width);
  const totalHeight = lines.length * lineHeight;

  let startY: number;
  if (slot.baseline === "middle") {
    startY = slot.y - totalHeight / 2 + lineHeight / 2;
  } else if (slot.baseline === "bottom") {
    startY = slot.y - totalHeight + lineHeight;
  } else {
    startY = slot.y;
  }

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], slot.x, startY + i * lineHeight);
  }
}

/**
 * Lays the logo and the caption out as one centred block so a short caption
 * doesn't leave a gap across half the pen. Returns false when the caption
 * can't be fitted on a single line, in which case the caller falls back to the
 * fixed slots, which wrap.
 */
function drawGroupedPhotoAndText(
  ctx: CanvasRenderingContext2D,
  template: PenTemplate,
  photo: HTMLImageElement,
  settings: PhotoSettings,
  text: string,
  fontFamily: string,
  textColor: string,
  minFont: number,
): boolean {
  const slot = template.photoSlots[0];
  const textSlot = template.textSlot;
  if (!slot || !textSlot) return false;

  const W = template.canvasWidth;
  // The slot is inset by the same padding on whichever edge it hugs.
  const padding = Math.min(slot.x, W - slot.x - slot.width);
  const maxTextWidth = W - padding * 2 - slot.width - padding;
  if (maxTextWidth <= 0) return false;

  const fontSize = computeAutoFontSize(
    ctx,
    text,
    fontFamily,
    maxTextWidth,
    textSlot.height,
    AUTO_FONT_START_PX,
    minFont,
  );
  ctx.font = `bold ${fontSize}px "${fontFamily}", sans-serif`;
  const textWidth = ctx.measureText(text).width;
  if (textWidth > maxTextWidth) return false;

  const groupWidth = slot.width + padding + textWidth;
  const startX = (W - groupWidth) / 2;
  const logoOnLeft = slot.x < W / 2;

  const logoX = logoOnLeft ? startX : startX + textWidth + padding;
  const textX = logoOnLeft ? startX + slot.width + padding : startX;

  drawPhotoIntoSlot(ctx, photo, { ...slot, x: logoX }, settings);

  ctx.fillStyle = textColor;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, textX, textSlot.y);
  return true;
}

export function renderPenLayout(
  canvas: HTMLCanvasElement,
  options: RenderOptions,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = options.template.canvasWidth;
  const H = options.template.canvasHeight;
  canvas.width = W;
  canvas.height = H;

  ctx.clearRect(0, 0, W, H);
  if (options.backgroundColor !== "transparent") {
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, W, H);
  }

  const { template, photos, photoSettings, fontFamily, textColor } = options;
  const text = template.noText ? "" : options.text;
  const minFont = minFontFor(H);

  if (template.groupPhotoWithText && photos[0] && text.trim()) {
    const drawn = drawGroupedPhotoAndText(
      ctx,
      template,
      photos[0],
      photoSettings?.[0] ?? DEFAULT_PHOTO_SETTINGS,
      text,
      fontFamily,
      textColor,
      minFont,
    );
    if (drawn) return;
  }

  template.photoSlots.forEach((slot, i) => {
    if (photos[i]) {
      drawPhotoIntoSlot(ctx, photos[i], slot, photoSettings?.[i] ?? DEFAULT_PHOTO_SETTINGS);
    } else {
      drawPhotoPlaceholder(ctx, slot, i, placeholderFonts(slot));
    }
  });

  if (text.trim() && template.textSlot) {
    drawTextSlot(ctx, template.textSlot, text, fontFamily, textColor, minFont);
  }
}

export function renderThumbnail(
  canvas: HTMLCanvasElement,
  template: PenTemplate,
): void {
  renderPenLayout(canvas, {
    template,
    photos: [],
    text: template.noText ? "" : "Text",
    fontFamily: "sans-serif",
    textColor: "#374151",
    backgroundColor: "#ffffff",
  });
}
