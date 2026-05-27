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

export type PhotoMask = "rect" | "circle" | "heart" | "rounded";

export interface PhotoShadow {
  dx: number;
  dy: number;
  blur: number;
  color: string;
}

export interface PhotoSlot {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Rotation in radians, applied around the slot's centre before drawing.
   * Used by templates like `polaroid_trio` to tilt photos. Omit for axis-aligned slots.
   */
  rotation?: number;
  /**
   * Clipping shape applied before the photo is drawn. `"rect"` (default) is a no-op,
   * `"rounded"` uses a quarter of the shorter side as the corner radius.
   */
  mask?: PhotoMask;
  /**
   * Optional border stroked around the slot after the photo is drawn (polaroid frame).
   * `borderColor` defaults to `#ffffff` when only `borderWidth` is set.
   */
  borderWidth?: number;
  borderColor?: string;
  /** Drop shadow drawn behind the photo slot. */
  shadow?: PhotoShadow;
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

/**
 * Optional decorative shapes drawn after the photo slots and before the text,
 * so the text always stays on top. Used by templates like `panorama`
 * (semi-transparent band behind the caption) and `heart_love` (heart accents).
 */
export type MugDecoration =
  | {
      kind: "darkBand";
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
    }
  | {
      kind: "heart";
      x: number;
      y: number;
      size: number;
      color: string;
    };

export interface MugTemplate {
  id: string;
  photoSlots: PhotoSlot[];
  textSlot: TextSlot;
  /** Maximum photos this template uses */
  maxPhotos: number;
  /** Canvas this template was instantiated for; renderer uses these. */
  canvasWidth: number;
  canvasHeight: number;
  /** Optional decoration layer rendered between photos and text. */
  decorations?: MugDecoration[];
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

  // Reusable building blocks for the new creative templates. Sized in ratios
  // of the legacy 2480×1134 layout so non-default canvases (square mug, etc.)
  // keep the same visual composition.
  const GUTTER = Math.round(W * (30 / 2480));
  const CAPTION_H = Math.round(H * (160 / 1134));

  // Square slot used by polaroid / circle / heart templates. Capped so it
  // stays inside the wrap height even after rotation enlarges the bounding
  // box (~10% extra at 6°).
  const SQUARE_SLOT = Math.min(
    Math.round(H * (820 / 1134)),
    Math.round(W * (820 / 2480)),
  );

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
    // Full-bleed single photo across the whole wrap, caption sitting on a
    // soft darkened band along the bottom 28% so the user's text stays
    // readable even when the photo is bright.
    (() => {
      const BAND_H = Math.round(H * (320 / 1134));
      const BAND_Y = H - BAND_H;
      return {
        id: "panorama",
        maxPhotos: 1,
        canvasWidth: W,
        canvasHeight: H,
        photoSlots: [{ x: 0, y: 0, width: W, height: H }],
        decorations: [
          {
            kind: "darkBand",
            x: 0,
            y: BAND_Y,
            width: W,
            height: BAND_H,
            color: "rgba(0, 0, 0, 0.45)",
          },
        ],
        textSlot: {
          x: W / 2,
          y: BAND_Y + BAND_H / 2,
          width: W - PADDING * 4,
          height: BAND_H - Math.round(H * (40 / 1134)),
          align: "center",
          baseline: "middle",
        },
      } satisfies MugTemplate;
    })(),
    // Three equal photos across the wrap with thin white gutters, caption
    // band below. Natural fit for the landscape geometry: phone snapshots
    // pop in side-by-side without any cropping gymnastics.
    (() => {
      const PHOTO_W = Math.round((W - PADDING * 2 - GUTTER * 2) / 3);
      const PHOTO_H = H - PADDING * 2 - CAPTION_H;
      return {
        id: "three_photos",
        maxPhotos: 3,
        canvasWidth: W,
        canvasHeight: H,
        photoSlots: [
          { x: PADDING, y: PADDING, width: PHOTO_W, height: PHOTO_H },
          {
            x: PADDING + PHOTO_W + GUTTER,
            y: PADDING,
            width: PHOTO_W,
            height: PHOTO_H,
          },
          {
            x: PADDING + (PHOTO_W + GUTTER) * 2,
            y: PADDING,
            width: PHOTO_W,
            height: PHOTO_H,
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
      } satisfies MugTemplate;
    })(),
    // Polaroid trio — three photos with white borders, drop shadows and a
    // playful tilt. Caption tucks into the bottom band.
    (() => {
      const SIZE = SQUARE_SLOT;
      const BORDER = Math.max(8, Math.round(W * (40 / 2480)));
      const SHADOW = {
        dx: Math.round(W * (12 / 2480)),
        dy: Math.round(W * (14 / 2480)),
        blur: Math.round(W * (28 / 2480)),
        color: "rgba(0, 0, 0, 0.28)",
      } as const;
      const CY = Math.round(H * 0.46);
      // Centre each polaroid at 1/5, 1/2, 4/5 of the wrap width. Margins are
      // tuned so the ±6° rotation never pushes the polaroid past the canvas
      // edge for any catalog product (21×9.6 default, square 1500×1500, etc.).
      const cxs = [W * 0.2, W * 0.5, W * 0.8];
      const rotations = [-6, 4, -3].map((deg) => (deg * Math.PI) / 180);
      return {
        id: "polaroid_trio",
        maxPhotos: 3,
        canvasWidth: W,
        canvasHeight: H,
        photoSlots: cxs.map((cx, i) => ({
          x: Math.round(cx - SIZE / 2),
          y: CY - Math.round(SIZE / 2),
          width: SIZE,
          height: SIZE,
          rotation: rotations[i],
          borderWidth: BORDER,
          borderColor: "#ffffff",
          shadow: SHADOW,
        })),
        textSlot: {
          x: W / 2,
          y: H - PADDING - Math.round(H * (40 / 1134)),
          width: W - PADDING * 2,
          height: Math.round(H * (140 / 1134)),
          align: "center",
          baseline: "middle",
        },
      } satisfies MugTemplate;
    })(),
    // Big quote — huge centred text takes ~65% of the wrap, with a single
    // circle-masked accent photo pinned to the right. Perfect for "Best Mom"
    // style mugs where the words carry the design.
    (() => {
      const PHOTO_SIZE = SQUARE_SLOT;
      const PHOTO_X = W - PHOTO_SIZE - PADDING * 2;
      const PHOTO_Y = Math.round((H - PHOTO_SIZE) / 2);
      const TEXT_LEFT = PADDING * 2;
      const TEXT_RIGHT = PHOTO_X - PADDING * 2;
      return {
        id: "big_quote",
        maxPhotos: 1,
        canvasWidth: W,
        canvasHeight: H,
        photoSlots: [
          {
            x: PHOTO_X,
            y: PHOTO_Y,
            width: PHOTO_SIZE,
            height: PHOTO_SIZE,
            mask: "circle",
          },
        ],
        textSlot: {
          x: TEXT_LEFT + (TEXT_RIGHT - TEXT_LEFT) / 2,
          y: H / 2,
          width: Math.max(0, TEXT_RIGHT - TEXT_LEFT),
          height: H - PADDING * 2,
          align: "center",
          baseline: "middle",
        },
      } satisfies MugTemplate;
    })(),
    // Heart-love — heart-masked photo on the left, decorative caption to the
    // right, with small heart accents scattered around the text.
    (() => {
      const HEART_SIZE = SQUARE_SLOT;
      const HEART_X = PADDING * 2;
      const HEART_Y = Math.round((H - HEART_SIZE) / 2);
      const TEXT_LEFT = HEART_X + HEART_SIZE + PADDING * 2;
      const TEXT_RIGHT = W - PADDING * 2;
      const ACCENT_SIZE = Math.round(H * (90 / 1134));
      const ACCENT_COLOR = "rgba(225, 29, 72, 0.85)"; // rose-600 @ 85%
      return {
        id: "heart_love",
        maxPhotos: 1,
        canvasWidth: W,
        canvasHeight: H,
        photoSlots: [
          {
            x: HEART_X,
            y: HEART_Y,
            width: HEART_SIZE,
            height: HEART_SIZE,
            mask: "heart",
          },
        ],
        decorations: [
          {
            kind: "heart",
            x: TEXT_RIGHT - ACCENT_SIZE,
            y: PADDING,
            size: ACCENT_SIZE,
            color: ACCENT_COLOR,
          },
          {
            kind: "heart",
            x: TEXT_LEFT,
            y: H - PADDING - ACCENT_SIZE,
            size: Math.round(ACCENT_SIZE * 0.75),
            color: ACCENT_COLOR,
          },
          {
            kind: "heart",
            x: TEXT_RIGHT - Math.round(ACCENT_SIZE * 0.6),
            y: H - PADDING - Math.round(ACCENT_SIZE * 0.6),
            size: Math.round(ACCENT_SIZE * 0.55),
            color: ACCENT_COLOR,
          },
        ],
        textSlot: {
          x: TEXT_LEFT + (TEXT_RIGHT - TEXT_LEFT) / 2,
          y: H / 2,
          width: Math.max(0, TEXT_RIGHT - TEXT_LEFT),
          height: Math.round(H * (700 / 1134)),
          align: "center",
          baseline: "middle",
        },
      } satisfies MugTemplate;
    })(),
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
