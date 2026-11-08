import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser, getSessionUser } from "@/lib/auth";
import { CABINET_VISIBLE_ORDER_WHERE } from "@/lib/cabinetOrderScope";
import { getPresignedDownloadUrl } from "@/lib/r2";
import { readLocalFile } from "@/lib/local-storage";
import { applySafeFileHeaders } from "@/lib/files/safeFileHeaders";
import { isUvItemPhotoKey } from "@/lib/uv/uvLineInput";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

/** Order lines whose UV client item photo is this key. */
function photoLineWhere(key: string) {
  return { uvLineData: { path: ["clientItem", "photo", "fileUrl"], equals: key } } as const;
}

/**
 * Photo of a client's item on a UV line (`uvLineData.clientItem.photo`), inline.
 * Not a `File` row (it is never artwork), so it is served by key — only when an
 * order line holds that key: any staff user, or the customer whose order it is.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") ?? "";
  if (!isUvItemPhotoKey(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const staff = await getSessionUser();
  let line: { id: string } | null = null;
  if (staff) {
    line = await prisma.orderLine.findFirst({ where: photoLineWhere(key), select: { id: true } });
  } else {
    const customer = await getCustomerSessionUser();
    if (!customer?.studioCustomerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    line = await prisma.orderLine.findFirst({
      where: {
        ...photoLineWhere(key),
        order: { clientId: customer.studioCustomerId, ...CABINET_VISIBLE_ORDER_WHERE },
      },
      select: { id: true },
    });
  }
  if (!line) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
      // The `uploads/` lifecycle rule removes order uploads after a while.
      return NextResponse.json({ error: "Not found" }, { status: r2.status === 404 ? 404 : 502 });
    }
    const cl = r2.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);
    return new NextResponse(r2.body, { status: 200, headers });
  } catch (error) {
    console.error("GET /api/uv-item-photo:", error);
    return NextResponse.json({ error: "Failed to load photo" }, { status: 500 });
  }
}
