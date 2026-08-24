import {
  type MugTemplate,
  type MugDecoration,
  type PhotoSettings,
  DEFAULT_PHOTO_SETTINGS,
} from "./templates";
import {
  buildLocalMaskPath,
  computeAutoFontSize,
  drawPhotoIntoSlot,
  drawPhotoPlaceholder,
  wrapText,
} from "@/lib/design/canvasPrimitives";

export interface RenderOptions {
  template: MugTemplate;
  photos: HTMLImageElement[];
  photoSettings?: PhotoSettings[];
  text: string;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
}

/** Mug auto-fit starts at 120px (the notebook renderer starts at 140px). */
const AUTO_FONT_START_PX = 120;

/** Placeholder label sizes preserved from the legacy renderer. */
const PLACEHOLDER_FONTS = { fastFontPx: 48, decoratedFontPx: 48 } as const;

function drawDecoration(
  ctx: CanvasRenderingContext2D,
  decoration: MugDecoration,
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

export function renderMugLayout(
  canvas: HTMLCanvasElement,
  options: RenderOptions,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Canvas dimensions come from the template (built with `buildMugTemplates`),
  // so a non-default product (e.g. square mug) automatically scales here.
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
  // `noText` templates (e.g. the caption-free panorama) never render text,
  // regardless of what the caller passes.
  const text = template.noText ? "" : options.text;

  template.photoSlots.forEach((slot, i) => {
    if (photos[i]) {
      drawPhotoIntoSlot(ctx, photos[i], slot, photoSettings?.[i] ?? DEFAULT_PHOTO_SETTINGS);
    } else {
      drawPhotoPlaceholder(ctx, slot, i, PLACEHOLDER_FONTS);
    }
  });

  // Decorations sit between photos and text so the caption always wins z-order.
  template.decorations?.forEach((decoration) => drawDecoration(ctx, decoration));

  if (text.trim()) {
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
  template: MugTemplate,
): void {
  renderMugLayout(canvas, {
    template,
    photos: [],
    text: template.noText ? "" : "Text",
    fontFamily: "sans-serif",
    textColor: "#374151",
    backgroundColor: "#ffffff",
  });
}
