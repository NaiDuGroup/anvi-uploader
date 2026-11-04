import { z } from "zod";
import { BUSINESS_CARD_SIDES } from "@/lib/businessCard/businessCardConstants";
import {
  DTF_MAX_PIECES,
  DTF_MAX_PLACEMENT_NOTE,
  DTF_MAX_SIZES,
  DTF_MAX_ZONES,
  DTF_PLACEMENTS,
} from "@/lib/dtf/dtfConstants";
import {
  SHEET_PRODUCT_PRESET_IDS,
  SHEET_PRODUCT_TYPES,
  isSheetProductPresetFor,
  sheetProductConfig,
} from "@/lib/sheetProduct/sheetProductConfig";
import { uvZoneInputSchema } from "@/lib/uv/uvLineInput";
import {
  UV_MAX_PIECES,
  UV_MAX_ZONES,
  UV_TECHNIQUES,
} from "@/lib/uv/uvConstants";

/**
 * What the public storefront may send to `POST /api/public/quote`. Only the
 * line configuration: the customer tier is always retail (set on the server),
 * and staff-only knobs (client garments, «без прессовки», client UV items,
 * manual prices) are not accepted.
 */

/** Hard cap on lines in one quote (same as an order). */
export const PUBLIC_QUOTE_MAX_LINES = 50;
/** Pieces of a catalog item (mug, notebook, pen, plain stock item) in one line. */
export const PUBLIC_QUOTE_MAX_ITEM_QTY = 10_000;

const quantity = z.number().int().min(1).max(PUBLIC_QUOTE_MAX_ITEM_QTY);
const productId = z.string().trim().min(1).max(200);

/** Mug / notebook / pen: the unified stock variant id (a legacy product id still resolves). */
const mugLine = z
  .object({ kind: z.literal("mug"), productId, quantity })
  .strict();
const notebookLine = z
  .object({ kind: z.literal("notebook"), productId, quantity })
  .strict();
const penLine = z
  .object({ kind: z.literal("pen"), productId, quantity })
  .strict();

/** Any stock variant sold as-is: its run-size tiers, else `sellPrice` from one piece. */
const stockItemLine = z
  .object({
    kind: z.literal("stockItem"),
    variantId: z.string().uuid(),
    quantity,
  })
  .strict();

/** DTF garment from stock: colour id `<stockItemId>:<colorKey>`, sizes and print zones. */
const dtfLine = z
  .object({
    kind: z.literal("dtf"),
    garmentId: z.string().trim().min(1).max(200),
    sizes: z
      .array(
        z
          .object({
            size: z.string().trim().min(1).max(16),
            quantity: z.number().int().min(1).max(DTF_MAX_PIECES),
          })
          .strict(),
      )
      .min(1)
      .max(DTF_MAX_SIZES),
    zones: z
      .array(
        z
          .object({
            id: z.string().min(1).max(40),
            placement: z.enum(DTF_PLACEMENTS),
            placementNote: z
              .string()
              .trim()
              .max(DTF_MAX_PLACEMENT_NOTE)
              .optional(),
            /** Price list format; null with an explicit size for a custom transfer. */
            presetId: z.string().uuid().nullable(),
            widthCm: z.number().positive().max(200).optional(),
            heightCm: z.number().positive().max(200).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(DTF_MAX_ZONES),
    /** Cart lines with the same key share one layout: run-size prices count their pieces together. */
    layoutKey: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

/** UV print on a stock item (main print included in the item price) or UV-DTF stickers. */
const uvLine = z
  .object({
    kind: z.literal("uv"),
    source: z.enum(["stock", "stickers"]),
    technique: z.enum(UV_TECHNIQUES).optional(),
    variantId: z.string().uuid().optional(),
    quantity: z.number().int().min(1).max(UV_MAX_PIECES),
    zones: z.array(uvZoneInputSchema.strict()).min(1).max(UV_MAX_ZONES),
  })
  .strict();

/** Business cards / flyers: paper, sides, run (raised to whole sheets in the answer). */
const businessCardObject = z
  .object({
    kind: z.literal("businessCard"),
    productType: z.enum(SHEET_PRODUCT_TYPES).default("business_card"),
    sheetPaperId: z.string().uuid(),
    sides: z.enum(BUSINESS_CARD_SIDES),
    quantity: z.number().int().min(1),
    cardPresetId: z.enum(SHEET_PRODUCT_PRESET_IDS).optional(),
    cardTrimWidthCm: z.number().optional(),
    cardTrimHeightCm: z.number().optional(),
  })
  .strict();

const businessCardLine = businessCardObject.superRefine((data, ctx) => {
  // Same checks as `POST /api/business-card-quote`.
  const config = sheetProductConfig(data.productType);
  if (data.quantity > config.maxQuantity) {
    ctx.addIssue({
      code: "custom",
      message: "bc_quantity_max",
      path: ["quantity"],
    });
  }
  if (
    data.cardPresetId != null &&
    !isSheetProductPresetFor(data.productType, data.cardPresetId)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "bc_preset_unknown",
      path: ["cardPresetId"],
    });
  }
  for (const side of ["cardTrimWidthCm", "cardTrimHeightCm"] as const) {
    const value = data[side];
    if (
      value != null &&
      (value < config.minSideCm || value > config.maxSideCm)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "bc_card_size_range",
        path: [side],
      });
    }
  }
});

export const publicQuoteLineSchema = z.discriminatedUnion("kind", [
  mugLine,
  notebookLine,
  penLine,
  stockItemLine,
  dtfLine,
  uvLine,
  // `discriminatedUnion` needs plain objects; the refinements run in `parsePublicQuoteLine`.
  businessCardObject,
]);

export type PublicQuoteLineInput = z.infer<typeof publicQuoteLineSchema>;
export type PublicQuoteKind = PublicQuoteLineInput["kind"];
export type PublicDtfLineInput = Extract<PublicQuoteLineInput, { kind: "dtf" }>;
export type PublicUvLineInput = Extract<PublicQuoteLineInput, { kind: "uv" }>;
export type PublicBusinessCardLineInput = Extract<
  PublicQuoteLineInput,
  { kind: "businessCard" }
>;

/** Validate one cart line on its own, so a bad line does not fail the whole cart. */
export function parsePublicQuoteLine(
  raw: unknown,
): { ok: true; line: PublicQuoteLineInput } | { ok: false; code: string } {
  const parsed = publicQuoteLineSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: firstIssueCode(parsed.error) };
  if (parsed.data.kind === "businessCard") {
    const refined = businessCardLine.safeParse(raw);
    if (!refined.success)
      return { ok: false, code: firstIssueCode(refined.error) };
    return { ok: true, line: refined.data };
  }
  return { ok: true, line: parsed.data };
}

function firstIssueCode(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue?.code === "custom" && issue.message
    ? issue.message
    : "invalid_input";
}

export const PUBLIC_QUOTE_LOCALES = ["ro", "ru", "en"] as const;
export type PublicQuoteLocale = (typeof PUBLIC_QUOTE_LOCALES)[number];

/** Request body: the lines stay raw here and are validated one by one. */
export const publicQuoteRequestSchema = z
  .object({
    lines: z.array(z.unknown()).min(1).max(PUBLIC_QUOTE_MAX_LINES),
    locale: z.enum(PUBLIC_QUOTE_LOCALES).default("ro"),
  })
  .strict();

export type PublicQuoteRequest = z.infer<typeof publicQuoteRequestSchema>;
