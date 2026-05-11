import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser } from "@/lib/auth";
import { getPresignedDownloadUrl } from "@/lib/r2";
import { readLocalFile } from "@/lib/local-storage";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

/**
 * Customer-facing download for a file attached to one of the logged-in
 * customer's own orders. Mirrors `/api/download/[fileId]` but scoped to
 * the customer's `StudioCustomer.id`.
 */
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
        deletedAt: null,
      },
    },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(file.fileName)}"`,
  );

  if (isLocalDev) {
    const localData = await readLocalFile(file.fileUrl);
    if (localData) {
      const ext = file.fileName.split(".").pop()?.toLowerCase() ?? "";
      headers.set("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
      headers.set("Content-Length", String(localData.byteLength));
      return new NextResponse(new Uint8Array(localData), {
        status: 200,
        headers,
      });
    }
    const placeholder = Buffer.from(`[local-dev placeholder] ${file.fileName}\n`);
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Length", String(placeholder.byteLength));
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

    const contentType = r2Response.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const contentLength = r2Response.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);

    return new NextResponse(r2Response.body, { status: 200, headers });
  } catch (error) {
    console.error("Failed to serve cabinet download:", error);
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 },
    );
  }
}
