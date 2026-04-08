export const CANVAS_WIDTH = 2480;
export const CANVAS_HEIGHT = 1134;

export interface PhotoSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PhotoFitMode = "cover" | "contain";
export type PhotoAlignment = "left" | "center" | "right";

export interface PhotoSettings {
  fitMode: PhotoFitMode;
  alignment: PhotoAlignment;
  naturalWidth?: number;
  naturalHeight?: number;
}

export const DEFAULT_PHOTO_SETTINGS: PhotoSettings = {
  fitMode: "cover",
  alignment: "center",
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
}

const PADDING = 60;

export const MUG_TEMPLATES: MugTemplate[] = [
  {
    id: "photo_text",
    maxPhotos: 1,
    photoSlots: [
      { x: PADDING, y: PADDING, width: 1500, height: CANVAS_HEIGHT - PADDING * 2 },
    ],
    textSlot: {
      x: 1600 + (CANVAS_WIDTH - 1600) / 2,
      y: CANVAS_HEIGHT / 2,
      width: CANVAS_WIDTH - 1600 - PADDING,
      height: CANVAS_HEIGHT - PADDING * 2,
      align: "center",
      baseline: "middle",
    },
  },
  {
    id: "text_photo",
    maxPhotos: 1,
    photoSlots: [
      { x: 920, y: PADDING, width: 1500, height: CANVAS_HEIGHT - PADDING * 2 },
    ],
    textSlot: {
      x: PADDING + (920 - PADDING) / 2,
      y: CANVAS_HEIGHT / 2,
      width: 920 - PADDING * 2,
      height: CANVAS_HEIGHT - PADDING * 2,
      align: "center",
      baseline: "middle",
    },
  },
  {
    id: "classic",
    maxPhotos: 2,
    photoSlots: [
      { x: PADDING, y: PADDING, width: 1160, height: CANVAS_HEIGHT - PADDING * 2 - 160 },
      { x: 1260, y: PADDING, width: 1160, height: CANVAS_HEIGHT - PADDING * 2 - 160 },
    ],
    textSlot: {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - PADDING - 60,
      width: CANVAS_WIDTH - PADDING * 2,
      height: 120,
      align: "center",
      baseline: "middle",
    },
  },
  {
    id: "photo_text_photo",
    maxPhotos: 2,
    photoSlots: [
      { x: PADDING, y: PADDING, width: 800, height: CANVAS_HEIGHT - PADDING * 2 },
      { x: 1620, y: PADDING, width: 800, height: CANVAS_HEIGHT - PADDING * 2 },
    ],
    textSlot: {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      width: 700,
      height: CANVAS_HEIGHT - PADDING * 2,
      align: "center",
      baseline: "middle",
    },
  },
];

export function getTemplateById(id: string): MugTemplate | undefined {
  return MUG_TEMPLATES.find((t) => t.id === id);
}
