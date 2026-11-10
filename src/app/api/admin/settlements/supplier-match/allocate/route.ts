import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireSuperAdmin } from "@/lib/settlements/guard";
import { actorOf } from "@/lib/settlements/audit";
import { manualSupplierAllocate, SupplierMatchError } from "@/lib/settlements/supplierMatchLoad";

export const runtime = "nodejs";

const schema = z.object({
  bankTransactionId: z.string().min(1).max(64),
  allocations: z
    .array(z.object({ purchaseInvoiceId: z.string().min(1).max(64), amount: z.number().positive().max(1e10) }))
    .min(1)
    .max(50),
});

/** Manual link: one payment → one or more supplier invoices (confirmed, capped). */
export async function POST(request: NextRequest) {
  const g = await requireSuperAdmin();
  if ("response" in g) return g.response;
  try {
    const body = schema.parse(await request.json().catch(() => null));
    return NextResponse.json(await manualSupplierAllocate(body, actorOf(g.user)));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    if (error instanceof SupplierMatchError) return NextResponse.json({ error: error.code }, { status: 400 });
    console.error("POST /api/admin/settlements/supplier-match/allocate:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
