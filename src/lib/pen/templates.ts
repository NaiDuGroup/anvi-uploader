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

export interface PenTemplate {
  id: string;
  photoSlots: PhotoSlot[];
  textSlot: TextSlot | null;
  maxPhotos: number;
  canvasWidth: number;
  canvasHeight: number;
  noText?: boolean;
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

/**
 * Build pen templates for the given pixel canvas.
 * Pens have a small print area, so templates are simpler than mug templates.
 */
export function buildPenTemplates(
  canvasWidth: number = PEN_DEFAULT_CANVAS.width,
  canvasHeight: number = PEN_DEFAULT_CANVAS.height,
): PenTemplate[] {
  const W = canvasWidth;
  const H = canvasHeight;
  const PADDING = Math.max(4, Math.round(W * 0.04));

  return [
    // Text-only template
    {
      id: "text_only",
      maxPhotos: 0,
      canvasWidth: W,
      canvasHeight: H,
      photoSlots: [],
      textSlot: {
        x: W / 2,
        y: H / 2,
        width: W - PADDING * 2,
        height: H - PADDING * 2,
        align: "center",
        baseline: "middle",
      },
    },
    // Logo + text: small photo on left, text on right
    {
      id: "logo_text",
      maxPhotos: 1,
      canvasWidth: W,
      canvasHeight: H,
      photoSlots: [
        {
          x: PADDING,
          y: PADDING,
          width: Math.round(H - PADDING * 2),
          height: H - PADDING * 2,
        },
      ],
      textSlot: {
        x: Math.round(H + PADDING),
        y: H / 2,
        width: W - H - PADDING * 2,
        height: H - PADDING * 2,
        align: "center",
        baseline: "middle",
      },
    },
    // Photo only (full bleed)
    {
      id: "photo_only",
      maxPhotos: 1,
      canvasWidth: W,
      canvasHeight: H,
      noText: true,
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
