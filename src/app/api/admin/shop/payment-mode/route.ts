import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { isShopPayOnDelivery, setShopPayOnDelivery } from "@/lib/shop/payOnDelivery";

const NO_STORE = { "Cache-Control": "no-store" };

const bodySchema = z.object({ payOnDelivery: z.boolean() }).strict();

/** «Оплата только при получении (временно)»: current state. Super admin only. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isSuperAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ payOnDelivery: await isShopPayOnDelivery() }, { headers: NO_STORE });
}

/** Turn it on / off: `{ payOnDelivery: boolean }`. Takes effect on the storefront at once. Super admin only. */
export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isSuperAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const payOnDelivery = await setShopPayOnDelivery(parsed.data.payOnDelivery);
  console.info(`[shop] pay-on-delivery set to ${payOnDelivery} by ${user.id}`);
  return NextResponse.json({ payOnDelivery }, { headers: NO_STORE });
}
