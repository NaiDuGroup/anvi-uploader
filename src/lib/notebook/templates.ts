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

export interface NotebookTemplate {
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
