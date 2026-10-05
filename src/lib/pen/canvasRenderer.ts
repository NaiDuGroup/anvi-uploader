import {
  type PenTemplate,
  type PhotoSettings,
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
  /** Second caption line; only drawn when the template defines a slot for it. */
  textSecondary?: string;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
}

const AUTO_FONT_START_PX = 60;
const PLACEHOLDER_FONTS = { fastFontPx: 24, decoratedFontPx: 24 } as const;

function drawTextSlot(
  ctx: CanvasRenderingContext2D,
  slot: TextSlot,
  text: string,
  fontFamily: string,
  textColor: string,
): void {
  const fontSize = computeAutoFontSize(
    ctx,
    text,
    fontFamily,
    slot.width,
    slot.height,
    AUTO_FONT_START_PX,
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
  const textSecondary = template.noText ? "" : (options.textSecondary ?? "");

  template.photoSlots.forEach((slot, i) => {
    if (photos[i]) {
      drawPhotoIntoSlot(ctx, photos[i], slot, photoSettings?.[i] ?? DEFAULT_PHOTO_SETTINGS);
    } else {
      drawPhotoPlaceholder(ctx, slot, i, PLACEHOLDER_FONTS);
    }
  });

  if (text.trim() && template.textSlot) {
    drawTextSlot(ctx, template.textSlot, text, fontFamily, textColor);
  }
  if (textSecondary.trim() && template.textSlotSecondary) {
    drawTextSlot(ctx, template.textSlotSecondary, textSecondary, fontFamily, textColor);
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
    textSecondary: template.textSlotSecondary ? "abc" : "",
    fontFamily: "sans-serif",
    textColor: "#374151",
    backgroundColor: "#ffffff",
  });
}
