// Hardcover A5 print area defaults: 14 cm × 21.4 cm @ 300 DPI ≈ 1654 × 2528 px.
// `NOTEBOOK_DEFAULT_CANVAS` is kept for legacy callers that don't yet pass dimensions.
export const NOTEBOOK_DEFAULT_CANVAS = {
  width: 1654,
  height: 2528,
} as const;

/** @deprecated Use `NOTEBOOK_DEFAULT_CANVAS.width` or pass dimensions explicitly. */
export const CANVAS_WIDTH = NOTEBOOK_DEFAULT_CANVAS.width;
/** @deprecated Use `NOTEBOOK_DEFAULT_CANVAS.height` or pass dimensions explicitly. */
export const CANVAS_HEIGHT = NOTEBOOK_DEFAULT_CANVAS.height;

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
   * Used by templates like `polaroid_trio` to tilt photos. Omit for
   * axis-aligned slots.
   */
  rotation?: number;
  /**
   * Clipping shape applied before the photo is drawn. `"rect"` (default)
   * is a no-op, `"rounded"` uses ~18% of the shorter side as the corner
   * radius.
   */
  mask?: PhotoMask;
  /**
   * Optional border stroked around the slot after the photo is drawn
   * (polaroid frame). `borderColor` defaults to `#ffffff` when only
   * `borderWidth` is set.
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
 * Optional decorative shapes drawn after the photo slots and before the
 * text, so the text always stays on top. Used by `panorama` (a soft
 * darkened band behind the caption) and `heart_love` (heart accents).
 */
export type NotebookDecoration =
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

export interface NotebookTemplate {
  id: string;
  photoSlots: PhotoSlot[];
  textSlot: TextSlot;
  /** Maximum photos this template uses */
  maxPhotos: number;
  /** Canvas this template was instantiated for; renderer uses these. */
  canvasWidth: number;
  canvasHeight: number;
  /** Optional decoration layer rendered between photos and text. */
  decorations?: NotebookDecoration[];
}

/**
 * Build the canonical 4 portrait templates for a hardcover notebook of the given pixel canvas.
 *
 * Coordinates are derived from ratios of the legacy 1654×2528 layout, so any non-default
 * canvas (e.g. landscape A4 hardcover) keeps the same composition stretched/compressed
 * to the new aspect ratio. Padding scales with width.
 */
export function buildNotebookTemplates(
  canvasWidth: number = NOTEBOOK_DEFAULT_CANVAS.width,
  canvasHeight: number = NOTEBOOK_DEFAULT_CANVAS.height,
): NotebookTemplate[] {
  const W = canvasWidth;
  const H = canvasHeight;
  // Padding ~4.8% of width on the legacy A5 layout (80 / 1654).
  const PADDING = Math.round(W * (80 / 1654));
  // Vertical gap between stacked photos ~2.4% of height (60 / 2528).
  const GAP = Math.round(H * (60 / 2528));
  const CONTENT_WIDTH = W - PADDING * 2;
  const CENTER_X = W / 2;

  // Reference y-anchors from the legacy 2528-tall layout.
  const PHOTO_TEXT_PHOTO_H = Math.round(H * (1820 / 2528));
  const TEXT_PHOTO_TEXT_H = Math.round(H * (540 / 2528));
  const CLASSIC_PHOTO_H = Math.round(H * (1020 / 2528));
  const PTP_TOP_PHOTO_H = Math.round(H * (980 / 2528));
  const PTP_TEXT_H = Math.round(H * (360 / 2528));

  return [
    // Photo on top, text on bottom (single photo, large).
    {
      id: "photo_text",
      maxPhotos: 1,
      canvasWidth: W,
      canvasHeight: H,
      photoSlots: [
        { x: PADDING, y: PADDING, width: CONTENT_WIDTH, height: PHOTO_TEXT_PHOTO_H },
      ],
      textSlot: {
        x: CENTER_X,
        y: (PADDING + PHOTO_TEXT_PHOTO_H + GAP + (H - PADDING)) / 2,
        width: CONTENT_WIDTH,
        height: H - PADDING - (PADDING + PHOTO_TEXT_PHOTO_H + GAP),
        align: "center",
        baseline: "middle",
      },
    },
    // Text on top, photo on bottom (single photo).
    {
      id: "text_photo",
      maxPhotos: 1,
      canvasWidth: W,
      canvasHeight: H,
      photoSlots: [
        {
          x: PADDING,
          y: PADDING + TEXT_PHOTO_TEXT_H + GAP,
          width: CONTENT_WIDTH,
          height: H - (PADDING + TEXT_PHOTO_TEXT_H + GAP) - PADDING,
        },
      ],
      textSlot: {
        x: CENTER_X,
        y: PADDING + TEXT_PHOTO_TEXT_H / 2,
        width: CONTENT_WIDTH,
        height: TEXT_PHOTO_TEXT_H,
        align: "center",
        baseline: "middle",
      },
    },
    // Two photos stacked top, text caption bottom.
    {
      id: "classic",
      maxPhotos: 2,
      canvasWidth: W,
      canvasHeight: H,
      photoSlots: [
        { x: PADDING, y: PADDING, width: CONTENT_WIDTH, height: CLASSIC_PHOTO_H },
        {
          x: PADDING,
          y: PADDING + CLASSIC_PHOTO_H + GAP,
          width: CONTENT_WIDTH,
          height: CLASSIC_PHOTO_H,
        },
      ],
      textSlot: {
        x: CENTER_X,
        y:
          (PADDING +
            CLASSIC_PHOTO_H +
            GAP +
            CLASSIC_PHOTO_H +
            GAP +
            (H - PADDING)) /
          2,
        width: CONTENT_WIDTH,
        height:
          H -
          PADDING -
          (PADDING + CLASSIC_PHOTO_H + GAP + CLASSIC_PHOTO_H + GAP),
        align: "center",
        baseline: "middle",
      },
    },
    // Photo, text, photo (vertically stacked: photo top, text middle, photo bottom).
    {
      id: "photo_text_photo",
      maxPhotos: 2,
      canvasWidth: W,
      canvasHeight: H,
      photoSlots: [
        { x: PADDING, y: PADDING, width: CONTENT_WIDTH, height: PTP_TOP_PHOTO_H },
        {
          x: PADDING,
          y: PADDING + PTP_TOP_PHOTO_H + GAP + PTP_TEXT_H + GAP,
          width: CONTENT_WIDTH,
          height:
            H -
            (PADDING + PTP_TOP_PHOTO_H + GAP + PTP_TEXT_H + GAP) -
            PADDING,
        },
      ],
      textSlot: {
        x: CENTER_X,
        y: PADDING + PTP_TOP_PHOTO_H + GAP + PTP_TEXT_H / 2,
        width: CONTENT_WIDTH,
        height: PTP_TEXT_H,
        align: "center",
        baseline: "middle",
      },
    },
    // Full-bleed single photo across the whole cover with a soft darkened
    // band along the bottom ~20% so the user's caption stays readable
    // even on a busy photo.
    (() => {
      const BAND_H = Math.round(H * (520 / 2528));
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
          x: CENTER_X,
          y: BAND_Y + BAND_H / 2,
          width: W - PADDING * 2,
          height: BAND_H - Math.round(H * (60 / 2528)),
          align: "center",
          baseline: "middle",
        },
      } satisfies NotebookTemplate;
    })(),
    // Three equal photos stacked vertically with thin gutters, caption
    // at the bottom. Natural fit for portrait notebooks: phone snapshots
    // pop in stacked without any cropping gymnastics.
    (() => {
      const CAPTION_H = Math.round(H * (260 / 2528));
      const STACK_H = H - PADDING * 2 - CAPTION_H - GAP;
      const PHOTO_H = Math.round((STACK_H - GAP * 2) / 3);
      return {
        id: "three_photos",
        maxPhotos: 3,
        canvasWidth: W,
        canvasHeight: H,
        photoSlots: [
          { x: PADDING, y: PADDING, width: CONTENT_WIDTH, height: PHOTO_H },
          {
            x: PADDING,
            y: PADDING + PHOTO_H + GAP,
            width: CONTENT_WIDTH,
            height: PHOTO_H,
          },
          {
            x: PADDING,
            y: PADDING + (PHOTO_H + GAP) * 2,
            width: CONTENT_WIDTH,
            height: PHOTO_H,
          },
        ],
        textSlot: {
          x: CENTER_X,
          y: H - PADDING - CAPTION_H / 2,
          width: CONTENT_WIDTH,
          height: CAPTION_H,
          align: "center",
          baseline: "middle",
        },
      } satisfies NotebookTemplate;
    })(),
    // Polaroid trio — three photos with white borders, drop shadows and
    // a playful tilt. Caption tucks into the bottom band.
    (() => {
      const CAPTION_H = Math.round(H * (260 / 2528));
      // Three vertical positions inside the polaroid stack. Centres are
      // at ~1/6, 1/2 and 5/6 of the cover height (above the caption).
      const STACK_TOP = PADDING;
      const STACK_BOTTOM = H - PADDING - CAPTION_H;
      const STACK_H = STACK_BOTTOM - STACK_TOP;
      // Photo size: ~80% of content width (square), capped so rotation
      // doesn't push the polaroid past the cover edge for any product
      // shape (~10% extra extent at 6°).
      const SIZE = Math.min(
        Math.round(CONTENT_WIDTH * 0.78),
        Math.round((STACK_H - GAP * 2) / 3),
      );
      const BORDER = Math.max(8, Math.round(W * (40 / 1654)));
      const SHADOW = {
        dx: Math.round(W * (12 / 1654)),
        dy: Math.round(W * (16 / 1654)),
        blur: Math.round(W * (32 / 1654)),
        color: "rgba(0, 0, 0, 0.28)",
      } as const;
      const cys = [
        STACK_TOP + STACK_H * 0.18,
        STACK_TOP + STACK_H * 0.5,
        STACK_TOP + STACK_H * 0.82,
      ];
      // Alternate horizontal offsets so the stack feels lived-in instead
      // of robotically centred.
      const cxs = [
        CENTER_X - W * 0.06,
        CENTER_X + W * 0.05,
        CENTER_X - W * 0.04,
      ];
      const rotations = [-5, 4, -3].map((deg) => (deg * Math.PI) / 180);
      return {
        id: "polaroid_trio",
        maxPhotos: 3,
        canvasWidth: W,
        canvasHeight: H,
        photoSlots: cys.map((cy, i) => ({
          x: Math.round(cxs[i] - SIZE / 2),
          y: Math.round(cy - SIZE / 2),
          width: SIZE,
          height: SIZE,
          rotation: rotations[i],
          borderWidth: BORDER,
          borderColor: "#ffffff",
          shadow: SHADOW,
        })),
        textSlot: {
          x: CENTER_X,
          y: H - PADDING - CAPTION_H / 2,
          width: CONTENT_WIDTH,
          height: CAPTION_H,
          align: "center",
          baseline: "middle",
        },
      } satisfies NotebookTemplate;
    })(),
    // Big quote — huge centred text takes most of the cover, with a
    // single circle-masked accent photo pinned to the bottom. Perfect
    // for journals where the words carry the design.
    (() => {
      const PHOTO_SIZE = Math.round(CONTENT_WIDTH * 0.55);
      const PHOTO_X = Math.round((W - PHOTO_SIZE) / 2);
      const PHOTO_Y = H - PADDING - PHOTO_SIZE;
      const TEXT_TOP = PADDING * 2;
      const TEXT_BOTTOM = PHOTO_Y - PADDING;
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
          x: CENTER_X,
          y: (TEXT_TOP + TEXT_BOTTOM) / 2,
          width: CONTENT_WIDTH,
          height: Math.max(0, TEXT_BOTTOM - TEXT_TOP),
          align: "center",
          baseline: "middle",
        },
      } satisfies NotebookTemplate;
    })(),
    // Heart-love — heart-masked photo on top, decorative caption below
    // with small heart accents scattered around the text.
    (() => {
      const HEART_SIZE = Math.round(CONTENT_WIDTH * 0.78);
      const HEART_X = Math.round((W - HEART_SIZE) / 2);
      const HEART_Y = PADDING * 2;
      const TEXT_TOP = HEART_Y + HEART_SIZE + PADDING;
      const TEXT_BOTTOM = H - PADDING * 2;
      const ACCENT_SIZE = Math.round(W * (140 / 1654));
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
            x: PADDING,
            y: TEXT_TOP - ACCENT_SIZE / 2,
            size: ACCENT_SIZE,
            color: ACCENT_COLOR,
          },
          {
            kind: "heart",
            x: W - PADDING - Math.round(ACCENT_SIZE * 0.7),
            y: TEXT_BOTTOM - Math.round(ACCENT_SIZE * 0.7),
            size: Math.round(ACCENT_SIZE * 0.7),
            color: ACCENT_COLOR,
          },
          {
            kind: "heart",
            x: W - PADDING - Math.round(ACCENT_SIZE * 0.55),
            y: TEXT_TOP,
            size: Math.round(ACCENT_SIZE * 0.55),
            color: ACCENT_COLOR,
          },
        ],
        textSlot: {
          x: CENTER_X,
          y: (TEXT_TOP + TEXT_BOTTOM) / 2,
          width: CONTENT_WIDTH,
          height: Math.max(0, TEXT_BOTTOM - TEXT_TOP),
          align: "center",
          baseline: "middle",
        },
      } satisfies NotebookTemplate;
    })(),
    // Split horizontal — two full-bleed photos (top half / bottom half)
    // with a bold dark text ribbon stretched across the middle. Dramatic
    // editorial feel; distinct from `photo_text_photo` which keeps both
    // photos padded and the text small in the gap.
    (() => {
      const RIBBON_H = Math.round(H * (300 / 2528));
      const RIBBON_Y = Math.round((H - RIBBON_H) / 2);
      const TOP_H = RIBBON_Y;
      const BOTTOM_Y = RIBBON_Y + RIBBON_H;
      const BOTTOM_H = H - BOTTOM_Y;
      return {
        id: "split_horizontal",
        maxPhotos: 2,
        canvasWidth: W,
        canvasHeight: H,
        photoSlots: [
          { x: 0, y: 0, width: W, height: TOP_H },
          { x: 0, y: BOTTOM_Y, width: W, height: BOTTOM_H },
        ],
        decorations: [
          {
            kind: "darkBand",
            x: 0,
            y: RIBBON_Y,
            width: W,
            height: RIBBON_H,
            color: "rgba(17, 24, 39, 0.92)", // gray-900 @ 92%
          },
        ],
        textSlot: {
          x: CENTER_X,
          y: RIBBON_Y + RIBBON_H / 2,
          width: W - PADDING * 2,
          height: RIBBON_H - Math.round(H * (40 / 2528)),
          align: "center",
          baseline: "middle",
        },
      } satisfies NotebookTemplate;
    })(),
    // Grid quad — 2×2 photo collage in the Instagram-square style with a
    // caption ribbon at the bottom. The first 4-photo template; perfect
    // for travel diaries or family albums.
    (() => {
      const CAPTION_H = Math.round(H * (260 / 2528));
      const GRID_H = H - PADDING * 2 - CAPTION_H - GAP;
      const CELL_H = Math.round((GRID_H - GAP) / 2);
      const CELL_W = Math.round((CONTENT_WIDTH - GAP) / 2);
      const RIGHT_X = PADDING + CELL_W + GAP;
      const BOTTOM_Y = PADDING + CELL_H + GAP;
      return {
        id: "grid_quad",
        maxPhotos: 4,
        canvasWidth: W,
        canvasHeight: H,
        photoSlots: [
          { x: PADDING, y: PADDING, width: CELL_W, height: CELL_H },
          { x: RIGHT_X, y: PADDING, width: CELL_W, height: CELL_H },
          { x: PADDING, y: BOTTOM_Y, width: CELL_W, height: CELL_H },
          { x: RIGHT_X, y: BOTTOM_Y, width: CELL_W, height: CELL_H },
        ],
        textSlot: {
          x: CENTER_X,
          y: H - PADDING - CAPTION_H / 2,
          width: CONTENT_WIDTH,
          height: CAPTION_H,
          align: "center",
          baseline: "middle",
        },
      } satisfies NotebookTemplate;
    })(),
    // Collage — one large photo on top, two equal photos side by side
    // below, caption at the bottom. Magazine-style asymmetric layout
    // distinct from the equal stacks of `three_photos`.
    (() => {
      const CAPTION_H = Math.round(H * (260 / 2528));
      const TOP_H = Math.round(H * (1180 / 2528));
      const BOTTOM_H =
        H - PADDING - CAPTION_H - GAP - (PADDING + TOP_H + GAP);
      const BOTTOM_W = Math.round((CONTENT_WIDTH - GAP) / 2);
      const BOTTOM_Y = PADDING + TOP_H + GAP;
      return {
        id: "collage",
        maxPhotos: 3,
        canvasWidth: W,
        canvasHeight: H,
        photoSlots: [
          { x: PADDING, y: PADDING, width: CONTENT_WIDTH, height: TOP_H },
          {
            x: PADDING,
            y: BOTTOM_Y,
            width: BOTTOM_W,
            height: BOTTOM_H,
          },
          {
            x: PADDING + BOTTOM_W + GAP,
            y: BOTTOM_Y,
            width: BOTTOM_W,
            height: BOTTOM_H,
          },
        ],
        textSlot: {
          x: CENTER_X,
          y: H - PADDING - CAPTION_H / 2,
          width: CONTENT_WIDTH,
          height: CAPTION_H,
          align: "center",
          baseline: "middle",
        },
      } satisfies NotebookTemplate;
    })(),
  ];
}

/** @deprecated Use `buildNotebookTemplates(canvasWidth, canvasHeight)` to get size-aware templates. */
export const NOTEBOOK_TEMPLATES: NotebookTemplate[] = buildNotebookTemplates();

/**
 * Look up a template by id. When `canvasWidth`/`canvasHeight` are omitted, returns
 * the legacy default-size template (kept for back-compat with old callers).
 */
export function getTemplateById(
  id: string,
  canvasWidth?: number,
  canvasHeight?: number,
): NotebookTemplate | undefined {
  if (canvasWidth !== undefined && canvasHeight !== undefined) {
    return buildNotebookTemplates(canvasWidth, canvasHeight).find((t) => t.id === id);
  }
  return NOTEBOOK_TEMPLATES.find((t) => t.id === id);
}
