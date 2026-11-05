import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { getShopCustomer } from "@/lib/shop/account/session";
import { accountStudioFields, parseStudioFields, studioFieldsSchema } from "@/lib/studio/smartFields";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * `GET /api/shop/account/studio-fields` — the signed-in customer's «Datele mele»
 * (null when never saved). A guest gets a quiet `{ fields: null, signedIn: false }`
 * (the Studio asks on every visit; a 401 would only fill the console).
 */
export async function GET() {
  const me = await getShopCustomer();
  if (!me) return NextResponse.json({ fields: null, signedIn: false }, { headers: NO_STORE });
  const row = await prisma.shopCustomer.findUnique({ where: { id: me.id }, select: { studioFields: true } });
  return NextResponse.json(
    { fields: row?.studioFields == null ? null : parseStudioFields(row.studioFields), signedIn: true },
    { headers: NO_STORE },
  );
}

/** `PUT /api/shop/account/studio-fields` — replace them (the logo is kept only with a durable key). */
export async function PUT(request: NextRequest) {
  const me = await getShopCustomer();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const limit = await hitRateLimit(RATE_LIMITS.shopAccount, clientIpFromHeaders(request.headers));
  if (!limit.allowed) {
    const { body, init } = rateLimitResponseInit(limit);
    return NextResponse.json(body, init);
  }
  const body: unknown = await request.json().catch(() => null);
  const parsed = studioFieldsSchema.safeParse((body as { fields?: unknown } | null)?.fields);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "_")))];
    return NextResponse.json({ error: "invalid_input", fields }, { status: 400, headers: NO_STORE });
  }
  const fields = accountStudioFields(parsed.data);
  await prisma.shopCustomer.update({
    where: { id: me.id },
    data: { studioFields: JSON.parse(JSON.stringify(fields)) as Prisma.InputJsonValue },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, fields }, { headers: NO_STORE });
}
