import { NextRequest, NextResponse } from "next/server";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { deleteAccountFile, listAccountFiles } from "@/lib/shop/account/data";
import { getShopCustomer } from "@/lib/shop/account/session";

const NO_STORE = { "Cache-Control": "no-store" };

/** `GET /api/shop/account/files` — «Fișierele mele» of the signed-in customer. */
export async function GET() {
  const me = await getShopCustomer();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  return NextResponse.json({ files: await listAccountFiles(me.id) }, { headers: NO_STORE });
}

/**
 * `DELETE /api/shop/account/files` `{ key }` — deletes one stored file of the
 * signed-in customer (R2 object + File rows marked missing). 409 `in_use`
 * while an order in work still needs it; 404 for anyone else's key.
 */
export async function DELETE(request: NextRequest) {
  const me = await getShopCustomer();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const limit = await hitRateLimit(RATE_LIMITS.shopAccount, clientIpFromHeaders(request.headers));
  if (!limit.allowed) {
    const { body, init } = rateLimitResponseInit(limit);
    return NextResponse.json(body, init);
  }
  const raw = (await request.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof raw?.key === "string" ? raw.key : "";
  try {
    const r = await deleteAccountFile(me.id, key);
    if (r.ok) return NextResponse.json({ ok: true }, { headers: NO_STORE });
    return NextResponse.json(r, { status: r.error === "in_use" ? 409 : 404, headers: NO_STORE });
  } catch (e) {
    console.error("[shop-account-files] delete failed:", e);
    return NextResponse.json({ error: "delete_failed" }, { status: 500, headers: NO_STORE });
  }
}
