import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CABINET_VISIBLE_ORDER_WHERE } from "@/lib/cabinetOrderScope";
import { getCustomerSessionUser } from "@/lib/auth";
import { getPresignedDownloadUrl } from "@/lib/r2";
import { readLocalFile } from "@/lib/local-storage";
import { applySafeFileHeaders } from "@/lib/files/safeFileHeaders";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

/**
 * Customer-facing inline preview for a file attached to one of the
 * logged-in customer's own orders. Mirrors `/api/preview/[fileId]` but
 * scoped to the customer's `StudioCustomer.id`, so a customer cannot
 * peek at another studio client's files even if they guess the UUID.
 */
function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const user = await getCustomerSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await params;

  const file = await prisma.file.findFirst({
    where: {
      id: fileId,
      order: {
        clientId: user.studioCustomerId!,
        // Dealer-cancelled orders stay viewable in the cabinet.
        ...CABINET_VISIBLE_ORDER_WHERE,
      },
    },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const headers = new Headers();
  // Type comes from the extension whitelist, never from the uploader-declared
  // object type (a guest could store `a.pdf` as text/html).
  const mime = applySafeFileHeaders(headers, { fileName: file.fileName, disposition: "inline" });
  headers.set("Cache-Control", "private, max-age=3600");

  if (isLocalDev) {
    const localData = await readLocalFile(file.fileUrl);
    if (localData) {
      headers.set("Content-Length", String(localData.byteLength));
      return new NextResponse(new Uint8Array(localData), {
        status: 200,
        headers,
      });
    }
    if (mime.startsWith("image/")) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
        <rect width="200" height="200" fill="#f3f4f6"/>
        <text x="100" y="95" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#9ca3af">Preview</text>
        <text x="100" y="115" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#9ca3af">${escapeXml(file.fileName.slice(0, 20))}</text>
      </svg>`;
      headers.set("Content-Type", "image/svg+xml");
      return new NextResponse(svg, { status: 200, headers });
    }
    const placeholder = Buffer.from(`[local-dev preview] ${file.fileName}\n`);
    return new NextResponse(placeholder, { status: 200, headers });
  }

  try {
    const downloadUrl = await getPresignedDownloadUrl(file.fileUrl);
    const r2Response = await fetch(downloadUrl);

    if (!r2Response.ok || !r2Response.body) {
      return NextResponse.json(
        { error: "Failed to fetch file from storage" },
        { status: 502 },
      );
    }

    // Extensionless names: the stored type is used only if it is whitelisted.
    applySafeFileHeaders(headers, {
      fileName: file.fileName,
      disposition: "inline",
      storedContentType: r2Response.headers.get("content-type"),
    });
    const contentLength = r2Response.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);

    return new NextResponse(r2Response.body, { status: 200, headers });
  } catch (error) {
    console.error("Failed to serve cabinet preview:", error);
    return NextResponse.json(
      { error: "Failed to serve preview" },
      { status: 500 },
    );
  }
}
