import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMaybeCustomerUser } from "@/lib/auth";
import {
  AdminOrderResolveError,
  resolveBusinessCardLine,
} from "@/lib/adminOrderCreateHelpers";
import {
  BUSINESS_CARD_MAX_QUANTITY,
  BUSINESS_CARD_MAX_SIDE_CM,
  BUSINESS_CARD_MIN_SIDE_CM,
  BUSINESS_CARD_SIDES,
} from "@/lib/businessCard/businessCardConstants";
import type { BusinessCardCustomerType } from "@/lib/businessCard/types";

const quoteSchema = z.object({
  sheetPaperId: z.string().uuid(),
  quantity: z.number().int().min(1).max(BUSINESS_CARD_MAX_QUANTITY),
  sides: z.enum(BUSINESS_CARD_SIDES),
  cardWidthCm: z
    .number()
    .min(BUSINESS_CARD_MIN_SIDE_CM)
    .max(BUSINESS_CARD_MAX_SIDE_CM)
    .optional(),
  cardHeightCm: z
    .number()
    .min(BUSINESS_CARD_MIN_SIDE_CM)
    .max(BUSINESS_CARD_MAX_SIDE_CM)
    .optional(),
});

/**
 * Price quote for a single business-card line. Uses the same resolver as order
 * creation (`resolveBusinessCardLine`) so the quoted total always equals the
 * price charged on submit. The retail/dealer tier comes from the logged-in
 * customer's `isDealer` flag — never trusted from the client. Returns only the
 * final sell total plus the sheet maths (no cost breakdown).
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
    const res = await resolveBusinessCardLine({
      sheetPaperId: parsed.sheetPaperId,
      quantity: parsed.quantity,
      sides: parsed.sides,
      cardWidthCm: parsed.cardWidthCm,
      cardHeightCm: parsed.cardHeightCm,
      customerType,
    });
    return NextResponse.json({
      ok: true,
      totalSellPriceMdl: res.totalSellPriceMdl,
      sheetsUsed: res.sheetsUsed,
      cardsPerSheet: res.businessCardLineData.cardsPerSheet,
      pricePerSheetMdl: res.businessCardLineData.pricePerSheetMdl,
      customerType,
    });
  } catch (error) {
    if (error instanceof AdminOrderResolveError) {
      return NextResponse.json({ ok: false, code: error.message }, { status: 400 });
    }
    console.error("Failed to quote business card line:", error);
    return NextResponse.json({ ok: false, code: "quote_failed" }, { status: 500 });
  }
}
