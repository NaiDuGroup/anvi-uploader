import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { businessExpenseUpdateSchema } from "@/lib/validations";

function toJson(e: NonNullable<Awaited<ReturnType<typeof prisma.businessExpense.findUnique>>>) {
  return {
    id: e.id,
    name: e.name,
    type: e.type,
    amount: e.amount,
    period: e.period,
    startDate: e.startDate.toISOString().slice(0, 10),
    endDate: e.endDate ? e.endDate.toISOString().slice(0, 10) : null,
    isActive: e.isActive,
    notes: e.notes,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

function parseStartDate(s: string): Date {
  return new Date(`${s}T12:00:00.000Z`);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: superadmin only" },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    const raw = (await request.json()) as unknown;
    const body = businessExpenseUpdateSchema.parse(raw);

    const existing = await prisma.businessExpense.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const nextStart =
      body.startDate !== undefined
        ? parseStartDate(body.startDate)
        : existing.startDate;
    const nextEnd =
      body.endDate !== undefined
        ? body.endDate != null
          ? parseStartDate(body.endDate)
          : null
        : existing.endDate;
    if (nextEnd && nextEnd < nextStart) {
      return NextResponse.json(
        { error: "Validation failed", details: { end_before_start: true } },
        { status: 400 },
      );
    }

    const updated = await prisma.businessExpense.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.period !== undefined ? { period: body.period } : {}),
        ...(body.startDate !== undefined
          ? { startDate: parseStartDate(body.startDate) }
          : {}),
        ...(body.endDate !== undefined
          ? {
              endDate:
                body.endDate != null ? parseStartDate(body.endDate) : null,
            }
          : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.notes !== undefined
          ? { notes: body.notes?.trim() || null }
          : {}),
      },
    });
    return NextResponse.json({ item: toJson(updated) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.flatten() },
        { status: 400 },
      );
    }
    console.error("PATCH /api/admin/business-expenses/[id]:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: superadmin only" },
      { status: 403 },
    );
  }

  const { id } = await params;
  try {
    await prisma.businessExpense.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? (e as { code?: string }).code
        : undefined;
    if (code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("DELETE /api/admin/business-expenses/[id]:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
