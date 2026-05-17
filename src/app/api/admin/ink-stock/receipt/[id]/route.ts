import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import {
  DeleteInkStockReceiptError,
  deleteInkStockReceiptById,
} from "@/lib/ink/inkStockReceipt";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, ctx: RouteParams) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await deleteInkStockReceiptById(tx, id);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DeleteInkStockReceiptError) {
      if (error.code === "not_found") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      if (error.code === "would_go_negative") {
        return NextResponse.json(
          {
            error: "would_go_negative",
            hint: "Inventory would go negative (ink may have been used from this batch).",
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "invalid_tank" }, { status: 400 });
    }
    console.error("DELETE ink receipt:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
