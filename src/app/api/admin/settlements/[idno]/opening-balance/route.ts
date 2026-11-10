import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { isDayKey } from "@/lib/shop/report/period";

export const runtime = "nodejs";

async function guard(params: Promise<{ idno: string }>) {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isSuperAdmin(user.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const { idno: raw } = await params;
  const idno = decodeURIComponent(raw).trim();
  if (!idno || idno.length > 64) {
    return { error: NextResponse.json({ error: "invalid_idno" }, { status: 400 }) };
  }
  return { user, idno };
}

/**
 * Sets the carried-over balance (from 1C) of a counterparty:
 * `{ asOfDate: "YYYY-MM-DD", amount: number (+ they owe us), note?: string }`.
 * `amount: 0` removes it.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ idno: string }> }) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  const { user, idno } = g;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  if (!Number.isFinite(amount) || Math.abs(amount) > 1e11) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  const rounded = Math.round(amount * 100) / 100;
  try {
    if (rounded === 0) {
      await prisma.counterpartyOpeningBalance.deleteMany({ where: { idno } });
      return NextResponse.json({ ok: true, openingBalance: null });
    }
    if (!isDayKey(body.asOfDate)) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }
    const asOfDate = new Date(`${body.asOfDate}T00:00:00.000Z`);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;
    const row = await prisma.counterpartyOpeningBalance.upsert({
      where: { idno },
      create: { idno, asOfDate, amount: rounded, note, updatedById: user.id },
      update: { asOfDate, amount: rounded, note, updatedById: user.id },
    });
    return NextResponse.json({
      ok: true,
      openingBalance: {
        asOfDate: row.asOfDate.toISOString().slice(0, 10),
        amount: Number(row.amount),
        note: row.note,
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("PUT /api/admin/settlements/[idno]/opening-balance:", error);
    return NextResponse.json({ error: "Failed to save opening balance" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ idno: string }> }) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  try {
    await prisma.counterpartyOpeningBalance.deleteMany({ where: { idno: g.idno } });
    return NextResponse.json({ ok: true, openingBalance: null });
  } catch (error) {
    console.error("DELETE /api/admin/settlements/[idno]/opening-balance:", error);
    return NextResponse.json({ error: "Failed to delete opening balance" }, { status: 500 });
  }
}
