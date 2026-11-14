import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMaybeCustomerUser } from "@/lib/auth";
import { orderContactFromStudioCustomer } from "@/lib/studioClient";
import { createTshirtOrder, tshirtOrderSchema, TshirtOrderError } from "@/lib/tshirt/tshirtOrder";

/**
 * Public: send a t-shirt from the /tshirt designer. Becomes a normal DTF order
 * (status NEW) that an operator checks before it goes to the workshop.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const customer = await getMaybeCustomerUser();
    // A logged-in client orders with the phone of their account.
    if (customer?.studioCustomer) {
      const contact = orderContactFromStudioCustomer(customer.studioCustomer);
      if (contact.phone) raw.phone = contact.phone;
      if (contact.clientName && !raw.name) raw.name = contact.clientName;
    }
    const input = tshirtOrderSchema.parse(raw);
    const result = await createTshirtOrder(input, {
      customerType: customer?.studioCustomer?.isDealer ? "dealer" : "retail",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "validation_failed", details: e.flatten() }, { status: 400 });
    }
    if (e instanceof TshirtOrderError) return NextResponse.json({ error: e.code }, { status: 400 });
    console.error("POST /api/tshirt/orders", e);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
