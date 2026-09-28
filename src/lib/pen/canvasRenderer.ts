import {
  type PenTemplate,
  type PhotoSettings,
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
const PLACEHOLDER_FONTS = { fastFontPx: 24, decoratedFontPx: 24 } as const;

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

  template.photoSlots.forEach((slot, i) => {
    if (photos[i]) {
      drawPhotoIntoSlot(ctx, photos[i], slot, photoSettings?.[i] ?? DEFAULT_PHOTO_SETTINGS);
    } else {
      drawPhotoPlaceholder(ctx, slot, i, PLACEHOLDER_FONTS);
    }
  });

  if (text.trim() && template.textSlot) {
    const ts = template.textSlot;
    const fontSize = computeAutoFontSize(
      ctx,
      text,
      fontFamily,
      ts.width,
      ts.height,
      AUTO_FONT_START_PX,
    );
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
