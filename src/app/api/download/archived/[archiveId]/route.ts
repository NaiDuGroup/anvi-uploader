import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getPresignedDownloadUrl } from "@/lib/r2";
import { readLocalFile } from "@/lib/local-storage";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

/**
 * Staff download of a previous file version the dealer replaced or removed
 * (`OrderFileArchive`), linked from the order history. Same storage path as
 * `GET /api/download/[fileId]`.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ archiveId: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { archiveId } = await params;
  const file = await prisma.orderFileArchive.findUnique({ where: { id: archiveId } });
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(file.fileName)}"`);

  if (isLocalDev) {
    const localData = await readLocalFile(file.fileUrl);
    const body = localData
      ? new Uint8Array(localData)
      : new Uint8Array(Buffer.from(`[local-dev placeholder] ${file.fileName}\n`));
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Length", String(body.byteLength));
    return new NextResponse(body, { status: 200, headers });
  }

  try {
    const downloadUrl = await getPresignedDownloadUrl(file.fileUrl);
    const r2Response = await fetch(downloadUrl);
    if (!r2Response.ok || !r2Response.body) {
      return NextResponse.json({ error: "Failed to fetch file from storage" }, { status: 502 });
    }
    const contentType = r2Response.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const contentLength = r2Response.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    return new NextResponse(r2Response.body, { status: 200, headers });
  } catch (error) {
    console.error("Failed to download archived file:", error);
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}
