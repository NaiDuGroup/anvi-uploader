import { z } from "zod";
import { cmToPx, DPI_PRESETS, PRINT_DIMENSION_LIMITS } from "@/lib/printDimensions";
import {
  designDocSchema,
  designStatusZod,
  designTargetTypeZod,
  emptyDesignDoc,
  type DesignDoc,
  type DesignStatus,
  type DesignTargetType,
} from "./doc";

/**
 * Wire shapes + validation for the Design Studio API. Kept out of the route
 * files so the client can import the response types without pulling server
 * code into the bundle.
 */

/** Custom-size designs are capped like the catalog print area (1–60 cm). */
const sizeCm = z
  .number()
  .min(PRINT_DIMENSION_LIMITS.minCm)
  .max(PRINT_DIMENSION_LIMITS.maxCm);

const dpi = z.number().int().refine(
  (v): v is (typeof DPI_PRESETS)[number] =>
    (DPI_PRESETS as readonly number[]).includes(v),
  { message: `dpi must be one of ${DPI_PRESETS.join(", ")}` },
);

export const createDesignSchema = z
  .object({
    title: z.string().min(1).max(200),
    targetType: designTargetTypeZod,
    mugProductId: z.string().uuid().nullable().optional(),
    notebookProductId: z.string().uuid().nullable().optional(),
    /** Required for `custom`; ignored for catalog-bound designs. */
    widthCm: sizeCm.optional(),
    heightCm: sizeCm.optional(),
    dpi: dpi.optional(),
    /** Optional starting document (used when duplicating a template). */
    doc: designDocSchema.optional(),
    isTemplate: z.boolean().optional(),
    tags: z.array(z.string().min(1).max(50)).max(20).optional(),
    /** Copy geometry + doc from this design (library "use as template"). */
    fromDesignId: z.string().uuid().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.targetType === "mug" && !val.mugProductId && !val.fromDesignId) {
      ctx.addIssue({
        code: "custom",
        path: ["mugProductId"],
        message: "mugProductId is required for mug designs",
      });
    }
    if (val.targetType === "notebook" && !val.notebookProductId && !val.fromDesignId) {
      ctx.addIssue({
        code: "custom",
        path: ["notebookProductId"],
        message: "notebookProductId is required for notebook designs",
      });
    }
    if (
      val.targetType === "custom" &&
      !val.fromDesignId &&
      (val.widthCm === undefined || val.heightCm === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["widthCm"],
        message: "widthCm and heightCm are required for custom designs",
      });
    }
  });

export type CreateDesignInput = z.infer<typeof createDesignSchema>;

export const updateDesignSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: designStatusZod.optional(),
  doc: designDocSchema.optional(),
  isTemplate: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  /** Set together after a client-side re-render + upload. */
  renderKey: z.string().min(1).optional(),
  thumbKey: z.string().min(1).optional(),
});

export type UpdateDesignInput = z.infer<typeof updateDesignSchema>;

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

/** Library card payload — no `doc`, so listing many designs stays cheap. */
export interface DesignListItemJson {
  id: string;
  title: string;
  status: DesignStatus;
  targetType: DesignTargetType;
  mugProductId: string | null;
  notebookProductId: string | null;
  productLabel: string | null;
  productSku: string | null;
  widthCm: number;
  heightCm: number;
  dpi: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
  thumbKey: string | null;
  renderKey: string | null;
  isTemplate: boolean;
  tags: string[];
  updatedAt: string;
}

export interface DesignDetailJson extends DesignListItemJson {
  doc: DesignDoc;
}

interface DesignRow {
  id: string;
  title: string;
  status: string;
  targetType: string;
  mugProductId: string | null;
  notebookProductId: string | null;
  widthCm: unknown;
  heightCm: unknown;
  dpi: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
  doc: unknown;
  thumbKey: string | null;
  renderKey: string | null;
  isTemplate: boolean;
  tags: string[];
  updatedAt: Date;
  mugProduct?: { sku: string; nameRu: string } | null;
  notebookProduct?: { sku: string; nameRu: string } | null;
}

function decimalToNumber(value: unknown): number {
  if (typeof value === "number") return value;
  return Number(String(value));
}

export function toDesignListItemJson(row: DesignRow): DesignListItemJson {
  const product = row.mugProduct ?? row.notebookProduct ?? null;
  return {
    id: row.id,
    title: row.title,
    status: row.status as DesignStatus,
    targetType: row.targetType as DesignTargetType,
    mugProductId: row.mugProductId,
    notebookProductId: row.notebookProductId,
    productLabel: product?.nameRu ?? null,
    productSku: product?.sku ?? null,
    widthCm: decimalToNumber(row.widthCm),
    heightCm: decimalToNumber(row.heightCm),
    dpi: row.dpi,
    canvasWidthPx: row.canvasWidthPx,
    canvasHeightPx: row.canvasHeightPx,
    thumbKey: row.thumbKey,
    renderKey: row.renderKey,
    isTemplate: row.isTemplate,
    tags: row.tags,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Full design payload. A document that fails validation (hand-edited JSON, or
 * written by a future version) degrades to an empty canvas rather than
 * breaking the editor.
 */
export function toDesignDetailJson(row: DesignRow): DesignDetailJson {
  const parsed = designDocSchema.safeParse(row.doc);
  return {
    ...toDesignListItemJson(row),
    doc: parsed.success ? parsed.data : emptyDesignDoc(),
  };
}

/** Canvas geometry for a design bound to a catalog product or a custom size. */
export function resolveDesignGeometry(input: {
  widthCm: number;
  heightCm: number;
  dpi: number;
}): { canvasWidthPx: number; canvasHeightPx: number } {
  return {
    canvasWidthPx: cmToPx(input.widthCm, input.dpi),
    canvasHeightPx: cmToPx(input.heightCm, input.dpi),
  };
}
