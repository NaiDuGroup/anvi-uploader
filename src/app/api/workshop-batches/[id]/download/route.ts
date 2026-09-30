/**
 * Force-download endpoint for a workshop batch history entry.
 *
 * In production the endpoint issues a 302 to a freshly-presigned R2 URL so
 * the browser downloads straight from object storage (never buffers the PNG
 * through Vercel). In local dev the same endpoint streams the bytes from
 * `.local-uploads` — either as an `attachment` (default) or `inline` when the
 * history rail requests it as a thumbnail via `?inline=1`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPresignedDownloadUrl,
  isLocalObjectStorage,
} from "@/lib/r2";
import { readLocalFile } from "@/lib/local-storage";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "workshop" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const row = await prisma.workshopBatchLayout.findUnique({
    where: { id },
    select: {
      id: true,
      fileKey: true,
      fileName: true,
      contentType: true,
      deletedAt: true,
    },
  });
  if (!row || row.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const inline = request.nextUrl.searchParams.get("inline") === "1";
  const disposition = inline
    ? `inline; filename="${encodeURIComponent(row.fileName)}"`
    : `attachment; filename="${encodeURIComponent(row.fileName)}"`;

  if (isLocalObjectStorage()) {
    const data = await readLocalFile(row.fileKey);
    if (!data) {
      return NextResponse.json(
        { error: "File no longer available" },
        { status: 410 },
      );
    }
    const headers = new Headers();
    headers.set("Content-Type", row.contentType);
    headers.set("Content-Disposition", disposition);
    headers.set("Content-Length", String(data.byteLength));
    return new NextResponse(new Uint8Array(data), { status: 200, headers });
  }

  try {
    const url = await getPresignedDownloadUrl(row.fileKey);
    return NextResponse.redirect(url, 302);
  } catch (error) {
    console.error(
      `GET /api/workshop-batches/${row.id}/download: presign failed`,
      error,
    );
    return NextResponse.json(
      { error: "File no longer available" },
      { status: 410 },
    );
  }
}
