import { z } from "zod";

/**
 * Design Studio document model.
 *
 * A design is a flat list of elements over a solid background. All
 * coordinates and sizes are expressed in *print pixels* (the canvas is sized
 * from the product's print area at its DPI, or from a custom cm size at
 * 300 DPI), so exporting is a 1:1 render and previews just apply a scale
 * factor. Z-order equals array order (first element = bottom layer).
 */

export const DESIGN_DOC_VERSION = 1 as const;

/** Hard cap so a runaway client can't persist unbounded documents. */
export const MAX_DESIGN_ELEMENTS = 200;

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

const baseElementSchema = z.object({
  /** Stable per-document id (nanoid). */
  id: z.string().min(1),
  /** Top-left corner of the *unrotated* box, in doc pixels. */
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  /** Rotation around the box centre, in degrees. */
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  /** Locked elements are skipped by hit-testing (background art). */
  locked: z.boolean().optional(),
});

export const textAlignZod = z.enum(["left", "center", "right"]);
export type TextAlign = z.infer<typeof textAlignZod>;

export const textElementSchema = baseElementSchema.extend({
  kind: z.literal("text"),
  /** Raw text; `\n` separates paragraphs, long lines soft-wrap to the box. */
  text: z.string().max(2000),
  /** Id from `FONT_OPTIONS` in `src/lib/editor/editorPalette.ts`. */
  fontId: z.string().min(1),
  fontSizePx: z.number().positive(),
  fontWeight: z.union([z.literal(400), z.literal(700)]).default(400),
  italic: z.boolean().optional(),
  color: z.string().min(1),
  align: textAlignZod.default("center"),
  /** Line height as a multiplier of the font size. */
  lineHeight: z.number().positive().default(1.25),
  letterSpacingPx: z.number().default(0),
  uppercase: z.boolean().optional(),
});

export const imageMaskZod = z.enum(["none", "circle", "rounded", "heart"]);
export type ImageMask = z.infer<typeof imageMaskZod>;

export const imageElementSchema = baseElementSchema.extend({
  kind: z.literal("image"),
  /**
   * Where the bitmap lives:
   * - `asset`  — shared clipart library, key in the catalog bucket
   *              (`catalog/design-assets/...`), publicly servable.
   * - `upload` — ad-hoc photo upload, key in the uploads bucket
   *              (`uploads/...`), served via the admin file-by-key route.
   */
  srcKind: z.enum(["asset", "upload"]),
  /** R2 object key (never a full URL). */
  fileKey: z.string().min(1),
  fit: z.enum(["cover", "contain"]).default("contain"),
  mask: imageMaskZod.default("none"),
  borderWidthPx: z.number().min(0).default(0),
  borderColor: z.string().default("#ffffff"),
  flipH: z.boolean().optional(),
});

export const shapeElementSchema = baseElementSchema.extend({
  kind: z.literal("shape"),
  shape: z.enum(["rect", "ellipse", "line"]),
  /** `null` = no fill (outline only). */
  fillColor: z.string().nullable().default("#000000"),
  strokeColor: z.string().default("#000000"),
  strokeWidthPx: z.number().min(0).default(0),
  cornerRadiusPx: z.number().min(0).default(0),
});

export const designElementSchema = z.discriminatedUnion("kind", [
  textElementSchema,
  imageElementSchema,
  shapeElementSchema,
]);

export type TextElement = z.infer<typeof textElementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;
export type ShapeElement = z.infer<typeof shapeElementSchema>;
export type DesignElement = z.infer<typeof designElementSchema>;
export type DesignElementKind = DesignElement["kind"];

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export const designDocSchema = z.object({
  version: z.literal(DESIGN_DOC_VERSION),
  /** Solid background color; `"transparent"` keeps the canvas transparent. */
  background: z.object({
    color: z.string().min(1),
  }),
  elements: z.array(designElementSchema).max(MAX_DESIGN_ELEMENTS),
});

export type DesignDoc = z.infer<typeof designDocSchema>;

export function emptyDesignDoc(backgroundColor: string = "#ffffff"): DesignDoc {
  return {
    version: DESIGN_DOC_VERSION,
    background: { color: backgroundColor },
    elements: [],
  };
}

// ---------------------------------------------------------------------------
// Design target (what the canvas geometry is bound to)
// ---------------------------------------------------------------------------

export const DESIGN_TARGET_TYPES = ["mug", "notebook", "custom"] as const;
export const designTargetTypeZod = z.enum(DESIGN_TARGET_TYPES);
export type DesignTargetType = z.infer<typeof designTargetTypeZod>;

export const DESIGN_STATUSES = ["draft", "ready", "archived"] as const;
export const designStatusZod = z.enum(DESIGN_STATUSES);
export type DesignStatus = z.infer<typeof designStatusZod>;
