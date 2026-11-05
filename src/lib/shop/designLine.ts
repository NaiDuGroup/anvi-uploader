import { z } from "zod";
import {
  SHOP_DESIGN_MAX_PHOTOS,
  SHOP_DESIGN_TEXT_MAX,
  SHOP_EDITOR_KINDS,
  SHOP_STUDIO_PREVIEW_MAX,
  STUDIO_APPROVAL_CHECKS,
  type ShopEditorKind,
} from "@/lib/storefront/design";
import type { AdminOrderLineInput, FileInput } from "@/lib/validations";

/**
 * Checkout side of a storefront design line (made in the shop-mode editor):
 * the order line gets the studio editor's layout JSON and its print file the
 * editor's `paperType` (`mug_layout` / `notebook_layout` / `pen_layout`), so
 * the admin sees exactly what an order from print.anvi.md/mug looks like.
 * Pure (unit-tested without the database).
 */

const photoKey = z
  .string()
  .trim()
  .min(1)
  .max(500)
  // An order-scope upload (`uploads/<13-digit ms>-…`), as `POST /api/upload-url` issues it.
  .regex(/^uploads\/\d{13}-[^\\]+$/, { message: "invalid_file_key" })
  .refine((k) => !k.includes(".."), { message: "invalid_file_key" });

/** Same fields as `mugLayoutDataSchema` (notebook / pen are identical), with storefront limits. */
export const shopDesignLayoutSchema = z.object({
  templateId: z.string().trim().min(1).max(100),
  text: z.string().max(SHOP_DESIGN_TEXT_MAX),
  fontFamily: z.string().trim().min(1).max(100),
  textColor: z.string().trim().min(1).max(40),
  backgroundColor: z.string().trim().min(1).max(40),
  photoUrls: z.array(photoKey).max(SHOP_DESIGN_MAX_PHOTOS),
  photoSettings: z
    .array(
      z.object({
        fitMode: z.enum(["cover", "contain"]),
        alignment: z.enum(["left", "center", "right"]),
        verticalAlignment: z.enum(["top", "center", "bottom"]).optional().default("center"),
        naturalWidth: z.number().positive().max(100_000).optional(),
        naturalHeight: z.number().positive().max(100_000).optional(),
      }),
    )
    .max(SHOP_DESIGN_MAX_PHOTOS),
});

/** ANVI Studio approval («Verifică designul») of a design line. */
export const shopLineStudioSchema = z.object({
  v: z.literal(1),
  docId: z.string().trim().min(1).max(60),
  approvedAt: z.string().datetime(),
  checks: z.array(z.enum(STUDIO_APPROVAL_CHECKS)).max(6),
  preview: z
    .string()
    .max(SHOP_STUDIO_PREVIEW_MAX)
    .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
  templateId: z.string().max(80).optional(),
});

export const shopLineDesignSchema = z.object({
  editor: z.enum(SHOP_EDITOR_KINDS),
  layout: shopDesignLayoutSchema,
  studio: shopLineStudioSchema.optional(),
});

/** `templateId` of a layout made in ANVI Studio (`studio` / `studio:<template>`, see `src/lib/studio/legacy.ts`). */
function isStudioTemplateId(id: string): boolean {
  return id === "studio" || id.startsWith("studio:");
}

/**
 * A Studio design line must carry the customer's approval («Am verificat
 * designul»): without it the checkout refuses the line (`studio_not_approved`).
 * Lines of the old editor need none.
 */
export function shopDesignApprovalProblem(design: ShopCheckoutDesign | undefined): "studio_not_approved" | null {
  if (!design || !isStudioTemplateId(design.layout.templateId)) return null;
  return design.studio?.approvedAt ? null : "studio_not_approved";
}

export type ShopCheckoutDesign = z.infer<typeof shopLineDesignSchema>;

/** `paperType` of the studio editor's print file. */
export function designFilePaperType(kind: ShopEditorKind): string {
  return `${kind}_layout`;
}

/**
 * The admin order line of a design line: layout JSON on the line and the
 * editor's paper type on its files. Lines of another kind (a mug design on a
 * notebook line — never sent by the shop) are left as they are.
 */
export function applyShopDesign(input: AdminOrderLineInput, design: ShopCheckoutDesign | undefined): AdminOrderLineInput {
  if (!design || input.productType !== design.editor) return input;
  const files: FileInput[] = input.files.map((f) => ({ ...f, paperType: designFilePaperType(design.editor) }));
  const layout = design.layout;
  switch (design.editor) {
    case "mug":
      return { ...input, files, mugLayoutData: layout };
    case "notebook":
      return { ...input, files, notebookLayoutData: layout };
    case "pen":
      return { ...input, files, penLayoutData: layout };
  }
}
