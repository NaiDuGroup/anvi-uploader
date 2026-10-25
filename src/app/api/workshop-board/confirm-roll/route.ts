import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { confirmRollTransfersInTx } from "@/lib/largeFormat/lfRollTransferLedger";

export const runtime = "nodejs";

const bodySchema = z.object({
  targetMaterialId: z.string().min(1),
  orderLineIds: z.array(z.string().min(1)).min(1).max(200),
});

/**
 * Records that a workshop layout was physically printed on `targetMaterialId`.
 *
 * For every line whose consumption currently sits on a different roll, moves
 * it between the rolls' unified stock variants as a pair of movements:
 * `LAYOUT_TRANSFER_BACK` (+ what the line holds on the previously charged
 * roll) and `LAYOUT_TRANSFER_OUT` (− the order-time metres on the actual roll). Order prices and
 * `largeFormatLineData` stay untouched. Idempotent: lines already charged to
 * the target roll are skipped, so re-confirming is safe.
 *
 * The target deduction is *not* blocked by low stock — the print already
 * happened; a negative balance is reported as a warning instead.
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
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { targetMaterialId, orderLineIds } = parsed.data;

  const target = await prisma.largeFormatMaterial.findUnique({
    where: { id: targetMaterialId },
    select: { id: true, name: true, isActive: true },
  });
  if (!target || !target.isActive) {
    return NextResponse.json({ error: "material_not_found" }, { status: 404 });
  }

  const result = await prisma.$transaction((tx) =>
    confirmRollTransfersInTx(tx, {
      target: { id: target.id, name: target.name },
      orderLineIds,
      createdById: user.id,
    }),
  );

  return NextResponse.json(result);
}
