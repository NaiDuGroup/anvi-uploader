// Pen print area defaults: 4 cm × 1.5 cm @ 300 DPI ≈ 472 × 177 px.
export const PEN_DEFAULT_CANVAS = {
  width: 472,
  height: 177,
} as const;

export interface TextSlot {
  x: number;
  y: number;
  width: number;
  height: number;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
}

export interface PhotoSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PhotoFitMode = "cover" | "contain";
export type PhotoAlignment = "left" | "center" | "right";
export type PhotoVerticalAlignment = "top" | "center" | "bottom";

export interface PenTemplate {
  id: string;
  photoSlots: PhotoSlot[];
  textSlot: TextSlot | null;
  maxPhotos: number;
  canvasWidth: number;
  canvasHeight: number;
  noText?: boolean;
  /**
   * Fit mode new photos start with. Logos need `contain` so nothing is cropped;
   * full-bleed backgrounds want `cover`.
   */
  defaultFitMode?: PhotoFitMode;
  /**
   * Draw the logo hugging the caption and centre the pair as one block, rather
   * than pinning the logo to the edge of the print area. Without it a short
   * caption leaves a wide gap between the two. The side the logo sits on comes
   * from its slot position, so there is no second field to keep in sync.
   */
  groupPhotoWithText?: boolean;
}

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

/**
 * Build pen templates for the given pixel canvas.
 *
 * A pen barrel gives us roughly 40 x 15 mm, so the layouts stay far simpler
 * than mug ones: a single caption line, and that is the limit. Splitting it in
 * two leaves about 5 mm per line, which stops being readable at actual size,
 * so the set is built around text and logo placement instead.
 *
 * The `text_only`, `logo_text` and `photo_only` ids are load-bearing — existing
 * orders reference them — so they keep their meaning here.
 */
export function buildPenTemplates(
  canvasWidth: number = PEN_DEFAULT_CANVAS.width,
  canvasHeight: number = PEN_DEFAULT_CANVAS.height,
): PenTemplate[] {
  const W = canvasWidth;
  const H = canvasHeight;
  // Driven by the shorter edge: catalog pens can have a print area under 1 cm
  // tall, and a width-only padding would eat most of that height.
  const PADDING = Math.max(2, Math.round(Math.min(W * 0.04, H * 0.12)));

  /** Square logo block, inset by the padding on the short edge. */
  const logoSize = H - PADDING * 2;
  /** Text area that sits beside a logo block, and its centre anchor. */
  const besideLogoWidth = W - H - PADDING;
  const besideLogoLeftX = Math.round(H + besideLogoWidth / 2);
  const besideLogoRightX = Math.round(W - H - besideLogoWidth / 2);

  const fullWidth = W - PADDING * 2;

  const logoSlotLeft: PhotoSlot = {
    x: PADDING,
    y: PADDING,
    width: logoSize,
    height: logoSize,
  };
  const logoSlotRight: PhotoSlot = {
    x: W - PADDING - logoSize,
    y: PADDING,
    width: logoSize,
    height: logoSize,
  };

  return [
    // One line across the whole strip — a name or a short slogan.
    {
      id: "text_only",
      maxPhotos: 0,
      canvasWidth: W,
      canvasHeight: H,
      photoSlots: [],
      textSlot: {
        x: W / 2,
        y: H / 2,
        width: fullWidth,
        height: H - PADDING * 2,
        align: "center",
        baseline: "middle",
      },
    },
    // Logo at the cap end, caption filling the rest.
    {
      id: "logo_text",
      maxPhotos: 1,
      canvasWidth: W,
      canvasHeight: H,
      defaultFitMode: "contain",
      groupPhotoWithText: true,
      photoSlots: [logoSlotLeft],
      textSlot: {
        x: besideLogoLeftX,
        y: H / 2,
        width: besideLogoWidth - PADDING,
        height: H - PADDING * 2,
        align: "center",
        baseline: "middle",
      },
    },
    // Mirror of the above — logo at the tip end instead.
    {
      id: "text_logo",
      maxPhotos: 1,
      canvasWidth: W,
      canvasHeight: H,
      defaultFitMode: "contain",
      groupPhotoWithText: true,
      photoSlots: [logoSlotRight],
      textSlot: {
        x: besideLogoRightX,
        y: H / 2,
        width: besideLogoWidth - PADDING,
        height: H - PADDING * 2,
        align: "center",
        baseline: "middle",
      },
    },
    // Logo on its own, centred and never cropped.
    {
      id: "logo_only",
      maxPhotos: 1,
      canvasWidth: W,
      canvasHeight: H,
      noText: true,
      defaultFitMode: "contain",
      photoSlots: [
        {
          x: PADDING,
          y: PADDING,
          width: fullWidth,
          height: H - PADDING * 2,
        },
      ],
      textSlot: null,
    },
    // Ready-made artwork covering the whole print area.
    {
      id: "photo_only",
      maxPhotos: 1,
      canvasWidth: W,
      canvasHeight: H,
      noText: true,
      defaultFitMode: "cover",
      photoSlots: [
        {
          x: 0,
          y: 0,
          width: W,
          height: H,
        },
      ],
      textSlot: null,
    },
  ];
}

export const PEN_TEMPLATES: PenTemplate[] = buildPenTemplates();

export function getTemplateById(
  id: string,
  canvasWidth?: number,
  canvasHeight?: number,
): PenTemplate | undefined {
  if (canvasWidth !== undefined && canvasHeight !== undefined) {
    return buildPenTemplates(canvasWidth, canvasHeight).find((t) => t.id === id);
  }
  return PEN_TEMPLATES.find((t) => t.id === id);
}
