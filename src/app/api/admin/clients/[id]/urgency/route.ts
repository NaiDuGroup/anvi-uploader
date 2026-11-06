import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { dealerUrgencyOverrideSchema } from "@/lib/validations";
import { dealerUrgencyMode, dealerUrgencyOverrideColumns, toFeeMdl } from "@/lib/dealerUrgency";
import { getGlobalDealerUrgencyFeeMdl } from "@/lib/dealerUrgencyServer";

/**
 * Client card: the dealer's «Срочно» override. Body `{ mode, amountMdl? }`:
 * `default` = «как у всех» (global setting), `custom` = own amount (0 = free),
 * `unavailable` = no checkbox. Superadmin only (like the dealer flag itself).
 * Existing orders keep the fee they were created / edited with.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const input = dealerUrgencyOverrideSchema.parse(await request.json());
    const existing = await prisma.studioCustomer.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const columns = dealerUrgencyOverrideColumns(input.mode, input.amountMdl ?? null);
    const client = await prisma.studioCustomer.update({
      where: { id },
      data: columns,
      select: { urgencyFeeMdl: true, urgencyDisabled: true },
    });
    return NextResponse.json({
      mode: dealerUrgencyMode(client),
      amountMdl: toFeeMdl(client.urgencyFeeMdl),
      globalFeeMdl: await getGlobalDealerUrgencyFeeMdl(),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    console.error("Failed to update client urgency override:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
