import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { isCounterpartyCategory } from "@/lib/settlements/types";
import { actorOf, writeAudit } from "@/lib/settlements/audit";
import { parseIdno } from "@/lib/settlements/guard";
import { syncStaleSupplierAllocations } from "@/lib/settlements/supplierMatchLoad";

export const runtime = "nodejs";

/**
 * Sets a counterparty's category by fiscal code. `category: null` removes the
 * manual choice (back to the built-in default / guess from invoices).
 */
export async function PUT(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const idno = parseIdno(body.idno);
  if (!idno) {
    return NextResponse.json({ error: "invalid_idno" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) || null : null;

  try {
    if (body.category === null) {
      await prisma.counterpartyCategory.deleteMany({ where: { idno } });
      await writeAudit(actorOf(user), {
        action: "category_set",
        entityType: "counterparty",
        entityId: idno,
        counterpartyIdno: idno,
        details: { category: null },
      });
      // Links whose card / category basis changed become stale.
      await syncStaleSupplierAllocations().catch(() => {});
      return NextResponse.json({ ok: true, idno, category: null });
    }
    if (!isCounterpartyCategory(body.category)) {
      return NextResponse.json({ error: "invalid_category" }, { status: 400 });
    }
    const category = body.category;
    await prisma.counterpartyCategory.upsert({
      where: { idno },
      create: { idno, category, name, updatedById: user.id },
      update: { category, updatedById: user.id, ...(name ? { name } : {}) },
    });
    await writeAudit(actorOf(user), {
      action: "category_set",
      entityType: "counterparty",
      entityId: idno,
      counterpartyIdno: idno,
      details: { category, name },
    });
    // Links whose card / category basis changed become stale.
    await syncStaleSupplierAllocations().catch(() => {});
    return NextResponse.json({ ok: true, idno, category });
  } catch (error) {
    console.error("PUT /api/admin/settlements/category:", error);
    return NextResponse.json({ error: "Failed to save category" }, { status: 500 });
  }
}
