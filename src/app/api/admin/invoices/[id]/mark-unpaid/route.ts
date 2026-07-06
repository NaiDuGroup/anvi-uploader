import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import {
  INVOICE_INCLUDE,
  toSerializableInvoice,
} from "@/lib/invoice/invoiceSerialization";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * Revert a PAID invoice back to ISSUED (undo an accidental "mark paid").
 * Clears the payment timestamp/note. Only PAID invoices can be reverted.
 */
export async function POST(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "PAID") {
      return NextResponse.json(
        { error: "Only paid invoices can be marked unpaid" },
        { status: 409 },
      );
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status: "ISSUED",
        paidAt: null,
        paidNote: null,
      },
      include: INVOICE_INCLUDE,
    });
    return NextResponse.json({ invoice: toSerializableInvoice(updated) });
  } catch (error) {
    console.error("POST /api/admin/invoices/[id]/mark-unpaid:", error);
    const message =
      error instanceof Error ? error.message : "Failed to mark unpaid";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
