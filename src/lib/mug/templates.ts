// Mug wraparound print area defaults: 21 cm × 9.6 cm @ 300 DPI ≈ 2480 × 1134 px.
// `MUG_DEFAULT_CANVAS` is kept for legacy callers that don't yet pass dimensions.
export const MUG_DEFAULT_CANVAS = {
  width: 2480,
  height: 1134,
} as const;

/** @deprecated Use `MUG_DEFAULT_CANVAS.width` or pass dimensions explicitly. */
export const CANVAS_WIDTH = MUG_DEFAULT_CANVAS.width;
/** @deprecated Use `MUG_DEFAULT_CANVAS.height` or pass dimensions explicitly. */
export const CANVAS_HEIGHT = MUG_DEFAULT_CANVAS.height;

export interface PhotoSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PhotoFitMode = "cover" | "contain";
export type PhotoAlignment = "left" | "center" | "right";
export type PhotoVerticalAlignment = "top" | "center" | "bottom";

export interface PhotoSettings {
  fitMode: PhotoFitMode;
  alignment: PhotoAlignment;
  verticalAlignment: PhotoVerticalAlignment;
  naturalWidth?: number;
  naturalHeight?: number;
}

export const DEFAULT_PHOTO_SETTINGS: PhotoSettings = {
  fitMode: "cover",
  alignment: "center",
  verticalAlignment: "center",
};

export interface TextSlot {
  x: number;
  y: number;
  width: number;
  height: number;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
}

export interface MugTemplate {
  id: string;
  photoSlots: PhotoSlot[];
  textSlot: TextSlot;
  /** Maximum photos this template uses */
  maxPhotos: number;
  /** Canvas this template was instantiated for; renderer uses these. */
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Build the canonical 4 templates for a mug body of the given pixel canvas.
 *
 * Coordinates are derived from ratios of the legacy 2480×1134 layout, so any
 * non-default canvas (e.g. a square mug) keeps the same visual composition but
 * stretched/compressed to the new aspect ratio. Padding scales with width.
 */
export function buildMugTemplates(
  canvasWidth: number = MUG_DEFAULT_CANVAS.width,
  canvasHeight: number = MUG_DEFAULT_CANVAS.height,
): MugTemplate[] {
  const W = canvasWidth;
  const H = canvasHeight;
  // Padding: ~2.4% of width on the legacy layout (60 / 2480). Keeping it width-relative
  // means thin landscape canvases don't lose their visual margins.
  const PADDING = Math.round(W * (60 / 2480));

  return [
    // 60% photo on the left, text on the right.
    {
      id: "photo_text",
      maxPhotos: 1,
      canvasWidth: W,
      canvasHeight: H,
      photoSlots: [
        {
          x: PADDING,
          y: PADDING,
          width: Math.round(W * (1500 / 2480)),
          height: H - PADDING * 2,
        },
      ],
      textSlot: {
        x: Math.round(W * (1600 / 2480) + (W - W * (1600 / 2480)) / 2),
        y: H / 2,
        width: W - Math.round(W * (1600 / 2480)) - PADDING,
        height: H - PADDING * 2,
        align: "center",
        baseline: "middle",
      },
    },
    // Mirror of "photo_text": text on the left, photo on the right.
    {
      id: "text_photo",
      maxPhotos: 1,
      canvasWidth: W,
      canvasHeight: H,
      photoSlots: [
        {
          x: Math.round(W * (920 / 2480)),
          y: PADDING,
          width: Math.round(W * (1500 / 2480)),
          height: H - PADDING * 2,
        },
      ],
      textSlot: {
        x: PADDING + (Math.round(W * (920 / 2480)) - PADDING) / 2,
        y: H / 2,
        width: Math.round(W * (920 / 2480)) - PADDING * 2,
        height: H - PADDING * 2,
        align: "center",
        baseline: "middle",
      },
    },
    // Two photos side by side, caption below.
    {
      id: "classic",
      maxPhotos: 2,
      canvasWidth: W,
      canvasHeight: H,
      photoSlots: [
        {
          x: PADDING,
          y: PADDING,
          width: Math.round(W * (1160 / 2480)),
          height: H - PADDING * 2 - Math.round(H * (160 / 1134)),
        },
        {
          x: Math.round(W * (1260 / 2480)),
          y: PADDING,
          width: Math.round(W * (1160 / 2480)),
          height: H - PADDING * 2 - Math.round(H * (160 / 1134)),
        },
      ],
      textSlot: {
        x: W / 2,
        y: H - PADDING - Math.round(H * (60 / 1134)),
        width: W - PADDING * 2,
        height: Math.round(H * (120 / 1134)),
        align: "center",
        baseline: "middle",
      },
    },
    // Photo, text band, photo across the wrap.
    {
      id: "photo_text_photo",
      maxPhotos: 2,
      canvasWidth: W,
      canvasHeight: H,
      photoSlots: [
        {
          x: PADDING,
          y: PADDING,
          width: Math.round(W * (800 / 2480)),
          height: H - PADDING * 2,
        },
        {
          x: Math.round(W * (1620 / 2480)),
          y: PADDING,
          width: Math.round(W * (800 / 2480)),
          height: H - PADDING * 2,
        },
      ],
      textSlot: {
        x: W / 2,
        y: H / 2,
        width: Math.round(W * (700 / 2480)),
        height: H - PADDING * 2,
        align: "center",
        baseline: "middle",
      },
    },
  ];
}

/** @deprecated Use `buildMugTemplates(canvasWidth, canvasHeight)` to get size-aware templates. */
export const MUG_TEMPLATES: MugTemplate[] = buildMugTemplates();

/**
 * Look up a template by id. When `canvasWidth`/`canvasHeight` are omitted, returns
 * the legacy default-size template (kept for back-compat with old callers).
 */
export function getTemplateById(
  id: string,
  canvasWidth?: number,
  canvasHeight?: number,
): MugTemplate | undefined {
  if (canvasWidth !== undefined && canvasHeight !== undefined) {
    return buildMugTemplates(canvasWidth, canvasHeight).find((t) => t.id === id);
  }
  return MUG_TEMPLATES.find((t) => t.id === id);
}
