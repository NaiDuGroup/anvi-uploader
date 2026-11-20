import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { confirmSheetPoolInTx, SheetPoolError } from "@/lib/largeFormat/lfSheetPoolLedger";

export const runtime = "nodejs";

const bodySchema = z.object({
  orderLineIds: z.array(z.string().min(1)).min(1).max(200),
  /** Sheets the checked lines were printed on together (the modal's layout). */
  poolSheets: z.number().int().min(1).max(10_000),
});

/**
 * Sheet materials (VATMAN A1): records that the workshop printed the checked
 * lines together on `poolSheets` whole sheets — the sheet counterpart of
 * `confirm-roll`. Lines keep their per-line write-off from the order until
 * then; this gives the saved sheets back to stock (`LAYOUT_POOL_RETURN`, per
 * line) and re-bases each line's material cost on its area share. Order
 * prices never change. Idempotent (see {@link confirmSheetPoolInTx}).
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "workshop" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction((tx) =>
      confirmSheetPoolInTx(tx, {
        orderLineIds: parsed.data.orderLineIds,
        poolSheets: parsed.data.poolSheets,
        createdById: user.id,
      }),
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SheetPoolError) {
      const status = err.code === "lines_not_found" ? 404 : 409;
      return NextResponse.json({ error: err.code }, { status });
    }
    throw err;
  }
}
