import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMaybeCustomerUser } from "@/lib/auth";
import {
  AdminOrderResolveError,
  resolveLargeFormatLine,
} from "@/lib/adminOrderCreateHelpers";
import { LF_ROLL_PACK_MAX_QUANTITY } from "@/lib/largeFormat/largeFormatRollConstants";
import type { LargeFormatCustomerType } from "@/lib/largeFormat/types";

const quoteSchema = z.object({
  largeFormatMaterialId: z.string().uuid(),
  printWidthCm: z.number().positive(),
  printHeightCm: z.number().positive(),
  quantity: z.number().int().min(1).max(LF_ROLL_PACK_MAX_QUANTITY),
  lfSizePresetId: z.string().uuid().nullable().optional(),
});

/**
 * Price quote for a single large-format line. Uses the exact same server-side
 * resolver as order creation (`resolveLargeFormatLine`) so the quoted total
 * always equals the price charged on submit. The retail/dealer tier is derived
 * from the logged-in customer's `isDealer` flag — never trusted from the client.
 * Returns only the final sell total + linear meters (no cost breakdown).
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

  const customerType: LargeFormatCustomerType =
    customer.studioCustomer?.isDealer === true ? "dealer" : "retail";

  try {
    const res = await resolveLargeFormatLine({
      largeFormatMaterialId: parsed.largeFormatMaterialId,
      printWidthCm: parsed.printWidthCm,
      printHeightCm: parsed.printHeightCm,
      quantity: parsed.quantity,
      customerType,
      lfSizePresetId: parsed.lfSizePresetId ?? null,
    });
    return NextResponse.json({
      ok: true,
      totalSellPriceMdl: res.totalSellPriceMdl,
      calculatedLinearMeters: res.calculatedLinearMeters,
      customerType,
    });
  } catch (error) {
    if (error instanceof AdminOrderResolveError) {
      return NextResponse.json({ ok: false, code: error.message }, { status: 400 });
    }
    console.error("Failed to quote large format line:", error);
    return NextResponse.json({ ok: false, code: "quote_failed" }, { status: 500 });
  }
}
