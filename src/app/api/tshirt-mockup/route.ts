import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getPresignedDownloadUrl } from "@/lib/r2";
import { readLocalFile } from "@/lib/local-storage";
import { applySafeFileHeaders } from "@/lib/files/safeFileHeaders";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

/**
 * The photo of a T-shirt order side as the client saw it in the designer
 * (`designerData.sides[].mockupKey`), inline. Not a `File` row (it is never
 * printed), so it is served by key — to staff, only when an order line holds it.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") ?? "";
  if (!/^uploads\/[\w.\-]+$/.test(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }
  const staff = await getSessionUser();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const line = await prisma.orderLine.findFirst({
    where: { productType: "dtf_apparel", designerData: { path: ["sides"], array_contains: [{ mockupKey: key }] } },
    select: { id: true },
  });
  if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const headers = new Headers();
  applySafeFileHeaders(headers, { fileName: key, disposition: "inline" });
  headers.set("Cache-Control", "private, max-age=3600");

  if (isLocalDev) {
    const data = await readLocalFile(key);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    headers.set("Content-Length", String(data.byteLength));
    return new NextResponse(new Uint8Array(data), { status: 200, headers });
  }
  try {
    const r2 = await fetch(await getPresignedDownloadUrl(key));
    if (!r2.ok || !r2.body) {
      return NextResponse.json({ error: "Not found" }, { status: r2.status === 404 ? 404 : 502 });
    }
    const cl = r2.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);
    return new NextResponse(r2.body, { status: 200, headers });
  } catch (error) {
    console.error("GET /api/tshirt-mockup:", error);
    return NextResponse.json({ error: "Failed to load photo" }, { status: 500 });
  }
}
