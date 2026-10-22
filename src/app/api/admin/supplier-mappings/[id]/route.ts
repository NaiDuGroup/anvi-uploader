import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManagePurchases } from "@/lib/roles";
import { updateMappingBodySchema } from "@/lib/purchasing/dto";
import { stockTargetExists } from "@/lib/purchasing/stockTargets";
import {
  AUTO_POST_CONFIRMATIONS,
  isPostableKind,
  isStockTargetKind,
  StockTargetKind,
} from "@/lib/purchasing/types";

type RouteParams = { params: Promise<{ id: string }> };

async function authorize(): Promise<boolean> {
  const user = await getSessionUser();
  return !!user && canManagePurchases(user.role);
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!(await authorize())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { id } = await params;
    const existing = await prisma.supplierItemMapping.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const body = updateMappingBodySchema.parse(await request.json());
    const kind: StockTargetKind =
      body.targetKind ??
      (isStockTargetKind(existing.targetKind) ? existing.targetKind : StockTargetKind.Ignore);
    const targetId: string | null =
      kind === StockTargetKind.Ignore ? null : (body.targetId ?? existing.targetId);
    if (isPostableKind(kind) && (!targetId || !(await stockTargetExists(prisma, kind, targetId)))) {
      return NextResponse.json({ error: "target_not_found" }, { status: 400 });
    }
    const factor: number = body.unitsPerInvoiceUnit ?? Number(existing.unitsPerInvoiceUnit);

    const ruleChanged: boolean =
      kind !== existing.targetKind ||
      targetId !== existing.targetId ||
      factor !== Number(existing.unitsPerInvoiceUnit);
    /** A changed rule must earn trust again unless the admin explicitly trusts it. */
    let confirmedCount: number = ruleChanged ? 0 : existing.confirmedCount;
    if (body.autoPost === true) confirmedCount = Math.max(confirmedCount, AUTO_POST_CONFIRMATIONS);
    if (body.autoPost === false) {
      confirmedCount = Math.min(confirmedCount, AUTO_POST_CONFIRMATIONS - 1);
    }

    await prisma.supplierItemMapping.update({
      where: { id },
      data: {
        targetKind: kind,
        targetId,
        unitsPerInvoiceUnit: new Prisma.Decimal(factor),
        confirmedCount,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_failed", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("supplier mapping update:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

/** Forget a rule; posted receipts keep their snapshot and are not touched. */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  if (!(await authorize())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id } = await params;
    await prisma.supplierItemMapping.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("supplier mapping delete:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
