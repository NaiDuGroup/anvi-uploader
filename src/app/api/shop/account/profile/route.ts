import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { getShopCustomer } from "@/lib/shop/account/session";
import { shopProfileSchema } from "@/lib/shop/account/profileSchema";

const NO_STORE = { "Cache-Control": "no-store" };

/** `PATCH /api/shop/account/profile` — the signed-in customer's name, phone and saved delivery. */
export async function PATCH(request: NextRequest) {
  const me = await getShopCustomer();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const limit = await hitRateLimit(RATE_LIMITS.shopAccount, clientIpFromHeaders(request.headers));
  if (!limit.allowed) {
    const { body, init } = rateLimitResponseInit(limit);
    return NextResponse.json(body, init);
  }
  const parsed = shopProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "_")))];
    return NextResponse.json({ error: "invalid_input", fields }, { status: 400, headers: NO_STORE });
  }
  const d = parsed.data;
  const c = await prisma.shopCustomer.update({
    where: { id: me.id },
    data: {
      name: d.name ?? null,
      phone: d.phone ?? null,
      delivery: d.delivery ? (JSON.parse(JSON.stringify(d.delivery)) as Prisma.InputJsonValue) : undefined,
    },
    select: { name: true, phone: true, delivery: true },
  });
  return NextResponse.json({ ok: true, profile: c }, { headers: NO_STORE });
}
