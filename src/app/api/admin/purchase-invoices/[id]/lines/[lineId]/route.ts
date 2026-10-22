import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManagePurchases } from "@/lib/roles";
import { postLineBodySchema } from "@/lib/purchasing/dto";
import {
  PostLineError,
  PostLineFailure,
  postPurchaseLine,
} from "@/lib/purchasing/postPurchaseLine";
import { purchaseCostsIncludeVat } from "@/lib/purchasing/purchaseCostBasis";

const ERROR_STATUS: Record<PostLineError, number> = {
  [PostLineError.NotFound]: 404,
  [PostLineError.AlreadyDone]: 409,
  [PostLineError.TargetNotFound]: 400,
  [PostLineError.InvalidFactor]: 400,
  [PostLineError.ReceiptNotFound]: 409,
};

/**
 * Posts an invoice line into stock (or ignores it with `kind: "ignore"`) and
 * confirms the supplier mapping one more time.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManagePurchases(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id, lineId } = await params;
    const owner = await prisma.purchaseInvoiceLine.findFirst({
      where: { id: lineId, invoiceId: id },
      select: { id: true },
    });
    if (!owner) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const body = postLineBodySchema.parse(await request.json());
    const actor = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });

    const result = await postPurchaseLine({
      lineId,
      kind: body.kind,
      targetId: body.targetId,
      unitsPerInvoiceUnit: body.unitsPerInvoiceUnit,
      createdById: actor?.id ?? null,
      auto: false,
      costsIncludeVat: await purchaseCostsIncludeVat(),
      linkReceiptId: body.linkReceiptId ?? null,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof PostLineFailure) {
      return NextResponse.json({ error: error.code }, { status: ERROR_STATUS[error.code] });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_failed", details: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    console.error("purchase line post:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
