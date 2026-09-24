import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, HEAVY_TX_OPTIONS } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { recordPenStockReceipt } from "@/lib/pen/penStockLedger";

const receiptBody = z.object({
  penProductId: z.string().uuid(),
  quantity: z.number().int().min(1).max(999_999),
  note: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || !canManageMugCatalog(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = receiptBody.parse(body);

    await prisma.$transaction(
      async (tx) => {
        await recordPenStockReceipt(tx, {
          penProductId: parsed.penProductId,
          quantity: parsed.quantity,
          note: parsed.note,
          createdById: user.id,
        });
      },
      HEAVY_TX_OPTIONS,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/admin/pen-stock/receipt]", e);
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", details: e.errors },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
