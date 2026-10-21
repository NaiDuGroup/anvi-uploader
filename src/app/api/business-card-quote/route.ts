import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMaybeCustomerUser } from "@/lib/auth";
import {
  AdminOrderResolveError,
  resolveSheetProductLine,
} from "@/lib/adminOrderCreateHelpers";
import { BUSINESS_CARD_SIDES } from "@/lib/businessCard/businessCardConstants";
import {
  SHEET_PRODUCT_PRESET_IDS,
  SHEET_PRODUCT_TYPES,
  isSheetProductPresetFor,
  sheetProductConfig,
} from "@/lib/sheetProduct/sheetProductConfig";
import type { BusinessCardCustomerType } from "@/lib/businessCard/types";

const quoteSchema = z
  .object({
    /** Business cards when omitted (older clients). */
    productType: z.enum(SHEET_PRODUCT_TYPES).default("business_card"),
    sheetPaperId: z.string().uuid(),
    quantity: z.number().int().min(1),
    sides: z.enum(BUSINESS_CARD_SIDES),
    cardPresetId: z.enum(SHEET_PRODUCT_PRESET_IDS).optional(),
    cardTrimWidthCm: z.number().optional(),
    cardTrimHeightCm: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    const config = sheetProductConfig(data.productType);
    if (data.quantity > config.maxQuantity) {
      ctx.addIssue({ code: "custom", message: "bc_quantity_max", path: ["quantity"] });
    }
    if (data.cardPresetId != null && !isSheetProductPresetFor(data.productType, data.cardPresetId)) {
      ctx.addIssue({ code: "custom", message: "bc_preset_unknown", path: ["cardPresetId"] });
    }
    for (const side of ["cardTrimWidthCm", "cardTrimHeightCm"] as const) {
      const value = data[side];
      if (value != null && (value < config.minSideCm || value > config.maxSideCm)) {
        ctx.addIssue({ code: "custom", message: "bc_card_size_range", path: [side] });
      }
    }
  });

/**
 * Price quote for a single sheet-product line (business cards or flyers). Uses
 * the same resolver as order creation (`resolveSheetProductLine`) so the
 * quoted total always equals the price charged on submit. The retail/dealer
 * tier comes from the logged-in customer's `isDealer` flag — never trusted
 * from the client. Returns only the final sell total plus the sheet maths (no
 * cost breakdown).
 */
export async function POST(request: NextRequest) {
  const customer = await getMaybeCustomerUser();
  if (!customer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof quoteSchema>;
  try {
    parsed = quoteSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_input" }, { status: 400 });
  }

  const customerType: BusinessCardCustomerType =
    customer.studioCustomer?.isDealer === true ? "dealer" : "retail";

  try {
    const res = await resolveSheetProductLine({
      productType: parsed.productType,
      sheetPaperId: parsed.sheetPaperId,
      quantity: parsed.quantity,
      sides: parsed.sides,
      cardPresetId: parsed.cardPresetId,
      cardTrimWidthCm: parsed.cardTrimWidthCm,
      cardTrimHeightCm: parsed.cardTrimHeightCm,
      customerType,
      // Quote the next whole-sheet run rather than erroring, and report it back
      // so the form can show what the requested figure was raised to.
      snapQuantity: true,
    });
    return NextResponse.json({
      ok: true,
      totalSellPriceMdl: res.totalSellPriceMdl,
      sheetsUsed: res.sheetsUsed,
      cardsPerSheet: res.businessCardLineData.cardsPerSheet,
      pricePerSheetMdl: res.businessCardLineData.pricePerSheetMdl,
      /** Possibly raised from the requested run to fill whole sheets. */
      quantity: res.businessCardLineData.quantity,
      customerType,
    });
  } catch (error) {
    if (error instanceof AdminOrderResolveError) {
      return NextResponse.json({ ok: false, code: error.message }, { status: 400 });
    }
    console.error("Failed to quote sheet product line:", error);
    return NextResponse.json({ ok: false, code: "quote_failed" }, { status: 500 });
  }
}
