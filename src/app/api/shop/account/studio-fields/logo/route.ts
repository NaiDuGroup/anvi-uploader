import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getObjectBytesIfSmall } from "@/lib/r2";
import { ownsReusableShopFile } from "@/lib/shop/account/data";
import { getShopCustomer } from "@/lib/shop/account/session";
import { parseStudioFields } from "@/lib/studio/smartFields";

const NO_STORE = { "Cache-Control": "no-store" };
/** A logo bigger than this is not sent back (the Studio only needs it for the card and its colours). */
const MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPE: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/**
 * `GET /api/shop/account/studio-fields/logo` — the logo saved in the signed-in
 * customer's «Datele mele» (a durable `shop-orders/…` copy), for a browser
 * that has no local copy of it: the card draws it and reads its colours.
 * Only the account's own saved logo, only while its order file still exists.
 */
export async function GET() {
  const me = await getShopCustomer();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const row = await prisma.shopCustomer.findUnique({ where: { id: me.id }, select: { studioFields: true } });
  const key: string | undefined = row?.studioFields == null ? undefined : parseStudioFields(row.studioFields).logo?.key;
  if (!key || !(await ownsReusableShopFile(me.id, key))) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  const got = await getObjectBytesIfSmall(key, MAX_BYTES).catch(() => null);
  if (!got || "tooBig" in got) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  const ext: string = key.split(".").pop()?.toLowerCase() ?? "";
  if (!IMAGE_TYPE[ext]) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  return new NextResponse(new Uint8Array(got.bytes), {
    headers: { ...NO_STORE, "Content-Type": IMAGE_TYPE[ext]!, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}
