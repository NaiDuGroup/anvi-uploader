import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { actorOf, writeAudit } from "@/lib/settlements/audit";

export const runtime = "nodejs";

/**
 * «Оплаты картой»: binds a card merchant (normalized key) to a supplier.
 * Body `{ merchantKey, idno: string | null, name? }` — `idno: null` marks the
 * merchant «не поставщик» (stays a bank row). `{ merchantKey, reset: true }`
 * removes the manual choice (back to automatic attribution).
 */
export async function PUT(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const merchantKey = typeof body.merchantKey === "string" ? body.merchantKey.trim() : "";
  if (!merchantKey || merchantKey.length > 200 || !/^[A-Z0-9]+$/.test(merchantKey)) {
    return NextResponse.json({ error: "invalid_merchant_key" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) || null : null;

  try {
    if (body.reset === true) {
      await prisma.cardMerchantAlias.deleteMany({ where: { merchantKey } });
      await writeAudit(actorOf(user), {
        action: "card_alias_set",
        entityType: "card_merchant",
        entityId: merchantKey,
        details: { merchantKey, reset: true },
      });
      return NextResponse.json({ ok: true, merchantKey, reset: true });
    }
    let idno: string | null;
    if (body.idno === null) idno = null;
    else if (typeof body.idno === "string" && /^\d{7,20}$/.test(body.idno.trim())) idno = body.idno.trim();
    else return NextResponse.json({ error: "invalid_idno" }, { status: 400 });

    await prisma.cardMerchantAlias.upsert({
      where: { merchantKey },
      create: { merchantKey, idno, name, updatedById: user.id },
      update: { idno, updatedById: user.id, ...(name ? { name } : {}) },
    });
    await writeAudit(actorOf(user), {
      action: "card_alias_set",
      entityType: "card_merchant",
      entityId: merchantKey,
      counterpartyIdno: idno,
      details: { merchantKey, idno, name },
    });
    return NextResponse.json({ ok: true, merchantKey, idno });
  } catch (error) {
    console.error("PUT /api/admin/settlements/card-alias:", error);
    return NextResponse.json({ error: "Failed to save card alias" }, { status: 500 });
  }
}
