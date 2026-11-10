import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/settlements/guard";
import { prisma } from "@/lib/prisma";
import { actorOf, writeAudit } from "@/lib/settlements/audit";

export const runtime = "nodejs";

function parseKey(body: Record<string, unknown>): string | null {
  const key = typeof body.key === "string" ? body.key.trim() : "";
  return key && key.length <= 300 && /^[a-z_]+:/.test(key) ? key : null;
}

/** «Проверено»: `{ key, note?, idno?, amount? }` hides the signal. */
export async function POST(request: NextRequest) {
  const g = await requireSuperAdmin();
  if ("response" in g) return g.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const key = parseKey(body);
  if (!key) return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;
  const idno = typeof body.idno === "string" ? body.idno.trim().slice(0, 64) || null : null;
  const amount = typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : null;
  const actor = actorOf(g.user);
  try {
    await prisma.settlementCheckDismissal.upsert({
      where: { signalKey: key },
      create: { signalKey: key, note, dismissedById: actor?.id ?? null, dismissedByName: actor?.name ?? null },
      update: { note, dismissedById: actor?.id ?? null, dismissedByName: actor?.name ?? null },
    });
    await writeAudit(actor, {
      action: "check_dismissed",
      entityType: "check",
      entityId: key,
      counterpartyIdno: idno,
      amount,
      details: { key, note },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/settlements/checks/dismiss:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/** Show a dismissed signal again: `{ key }`. */
export async function DELETE(request: NextRequest) {
  const g = await requireSuperAdmin();
  if ("response" in g) return g.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const key = parseKey(body);
  if (!key) return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  try {
    const removed = await prisma.settlementCheckDismissal.deleteMany({ where: { signalKey: key } });
    if (removed.count > 0) {
      const idno = typeof body.idno === "string" ? body.idno.trim().slice(0, 64) || null : null;
      await writeAudit(actorOf(g.user), {
        action: "check_restored",
        entityType: "check",
        entityId: key,
        counterpartyIdno: idno,
        details: { key },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/admin/settlements/checks/dismiss:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
