import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import {
  businessExpenseCreateSchema,
} from "@/lib/validations";

function toJson(e: Awaited<ReturnType<typeof prisma.businessExpense.findMany>>[0]) {
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

export async function GET() {
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

  const rows = await prisma.businessExpense.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ items: rows.map(toJson) });
}

export async function POST(request: NextRequest) {
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

  try {
    const raw = (await request.json()) as unknown;
    const body = businessExpenseCreateSchema.parse(raw);
    const created = await prisma.businessExpense.create({
      data: {
        name: body.name.trim(),
        type: body.type,
        amount: body.amount,
        period: body.period,
        startDate: parseStartDate(body.startDate),
        endDate: body.endDate != null ? parseStartDate(body.endDate) : null,
        isActive: body.isActive ?? true,
        notes: body.notes?.trim() || null,
      },
    });
    return NextResponse.json({ item: toJson(created) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.flatten() },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/business-expenses:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
