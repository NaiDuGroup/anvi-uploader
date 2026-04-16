import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  type MugTemplate,
  type PhotoSlot,
  type PhotoSettings,
  DEFAULT_PHOTO_SETTINGS,
} from "./templates";

export interface RenderOptions {
  template: MugTemplate;
  photos: HTMLImageElement[];
  photoSettings?: PhotoSettings[];
  text: string;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  slot: PhotoSlot,
  settings: PhotoSettings = DEFAULT_PHOTO_SETTINGS,
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

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineHeight: number,
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
  let fontSize = 120;
  const minSize = 28;

  while (fontSize > minSize) {
    ctx.font = `bold ${fontSize}px "${fontFamily}", sans-serif`;
    const lineHeight = fontSize * 1.3;
    const lines = wrapText(ctx, text, maxWidth, lineHeight);
    const totalHeight = lines.length * lineHeight;
    if (totalHeight <= maxHeight) return fontSize;
    fontSize -= 4;
  }

  return minSize;
}

export function renderMugLayout(
  canvas: HTMLCanvasElement,
  options: RenderOptions,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (options.backgroundColor !== "transparent") {
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  const { template, photos, photoSettings, text, fontFamily, textColor } = options;

  template.photoSlots.forEach((slot, i) => {
    if (photos[i]) {
      drawImageCover(ctx, photos[i], slot, photoSettings?.[i]);
    } else {
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
      ctx.fillStyle = "#9ca3af";
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `Photo ${i + 1}`,
        slot.x + slot.width / 2,
        slot.y + slot.height / 2,
      );
    }
  });

  if (text.trim()) {
    const ts = template.textSlot;
    const fontSize = computeFontSize(ctx, text, fontFamily, ts.width, ts.height);
    ctx.font = `bold ${fontSize}px "${fontFamily}", sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textAlign = ts.align;
    ctx.textBaseline = ts.baseline;

    const lineHeight = fontSize * 1.3;
    const lines = wrapText(ctx, text, ts.width, lineHeight);
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
    text: "Text",
    fontFamily: "sans-serif",
    textColor: "#374151",
    backgroundColor: "#ffffff",
  });
}
