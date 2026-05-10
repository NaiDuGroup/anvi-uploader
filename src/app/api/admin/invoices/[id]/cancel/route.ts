import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { cancelInvoiceSchema } from "@/lib/validations";
import {
  INVOICE_INCLUDE,
  toSerializableInvoice,
} from "@/lib/invoice/invoiceSerialization";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const validated = cancelInvoiceSchema.parse(body ?? {});

    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status === "PAID" || existing.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Cannot cancel paid or already cancelled invoice" },
        { status: 409 },
      );
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: validated.reason ?? null,
      },
      include: INVOICE_INCLUDE,
    });
    return NextResponse.json({ invoice: toSerializableInvoice(updated) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/invoices/[id]/cancel:", error);
    const message =
      error instanceof Error ? error.message : "Failed to cancel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
