import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewShopAdmin } from "@/lib/shop/report/access";
import { promoDatesToDb, promoInputSchema } from "@/lib/shop/promo/promoAdmin";
import { promoRealOrdersWhere } from "@/lib/shop/promo/promoOrdersWhere";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Edit a promo code: the whole form, or `{ active }` alone (the list toggle).
 * Orders already placed keep their discount (it is stored on the order).
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user || !canViewShopAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const keys = raw && typeof raw === "object" ? Object.keys(raw) : [];
  try {
    if (keys.length === 1 && keys[0] === "active") {
      const active = (raw as { active?: unknown }).active;
      if (typeof active !== "boolean") return NextResponse.json({ error: "invalid_input" }, { status: 400 });
      await prisma.promoCode.update({ where: { id }, data: { active } });
      return NextResponse.json({ ok: true });
    }
    const parsed = promoInputSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
    }
    const d = parsed.data;
    await prisma.promoCode.update({ where: { id }, data: { ...d, ...promoDatesToDb(d.validFrom, d.validTo) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "code_taken" }, { status: 409 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("[promo-codes] update failed:", e);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}

/**
 * Delete a code nobody used; a code with orders answers 409 `has_orders` (switch it off instead).
 * Trashed and test-payment orders do not block it (their link is cleared by the FK).
 */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user || !canViewShopAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const used = await prisma.order.count({ where: promoRealOrdersWhere(id) });
  if (used > 0) return NextResponse.json({ error: "has_orders", orders: used }, { status: 409 });
  try {
    await prisma.promoCode.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("[promo-codes] delete failed:", e);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
