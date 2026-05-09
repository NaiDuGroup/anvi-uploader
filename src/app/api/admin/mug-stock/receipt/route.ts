import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { recordMugStockReceipt } from "@/lib/mug/mugStockLedger";

const receiptBodySchema = z.object({
  lines: z.array(
    z.object({
      mugProductId: z.string().uuid(),
      quantity: z.number().int().min(0),
    }),
  ),
  note: z.string().max(2000).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const json = await request.json();
    const parsed = receiptBodySchema.parse(json);
    const lines = parsed.lines.filter((l) => l.quantity > 0);
    if (lines.length === 0) {
      return NextResponse.json(
        { error: "no_lines", message: "At least one line with quantity > 0" },
        { status: 400 },
      );
    }

    const ids = [...new Set(lines.map((l) => l.mugProductId))];
    const existing = await prisma.mugProduct.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      return NextResponse.json({ error: "unknown_product" }, { status: 400 });
    }

    const note = parsed.note?.trim() ? parsed.note.trim() : null;

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        await recordMugStockReceipt(tx, {
          mugProductId: line.mugProductId,
          quantity: line.quantity,
          note: i === 0 ? note : null,
          createdById: user.id,
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_failed", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("mug-stock receipt:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
