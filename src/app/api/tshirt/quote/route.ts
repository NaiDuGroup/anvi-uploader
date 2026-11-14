import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMaybeCustomerUser } from "@/lib/auth";
import { publicQuote, quoteTshirt, tshirtQuoteSchema, TshirtOrderError } from "@/lib/tshirt/tshirtOrder";

/** Public: live price of a designed t-shirt (DTF rules; dealer prices for dealer accounts). */
export async function POST(request: NextRequest) {
  try {
    const input = tshirtQuoteSchema.parse(await request.json());
    const customer = await getMaybeCustomerUser();
    const line = await quoteTshirt(input, customer?.studioCustomer?.isDealer ? "dealer" : "retail");
    return NextResponse.json(publicQuote(line));
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "validation_failed" }, { status: 400 });
    if (e instanceof TshirtOrderError) return NextResponse.json({ error: e.code }, { status: 400 });
    console.error("POST /api/tshirt/quote", e);
    return NextResponse.json({ error: "Failed to price" }, { status: 500 });
  }
}
