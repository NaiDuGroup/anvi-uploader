import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
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
  bmp: "image/bmp",
  pdf: "application/pdf",
};

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await params;

  const file = await prisma.file.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const mime = getMimeType(file.fileName);
  const headers = new Headers();
  headers.set("Content-Type", mime);
  headers.set(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(file.fileName)}"`,
  );
  headers.set("Cache-Control", "private, max-age=3600");

  if (isLocalDev) {
    const localData = await readLocalFile(file.fileUrl);
    if (localData) {
      headers.set("Content-Length", String(localData.byteLength));
      return new NextResponse(new Uint8Array(localData), { status: 200, headers });
    }
    if (mime.startsWith("image/")) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
        <rect width="200" height="200" fill="#f3f4f6"/>
        <text x="100" y="95" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#9ca3af">Preview</text>
        <text x="100" y="115" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#9ca3af">${file.fileName.slice(0, 20)}</text>
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

    const contentType = r2Response.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const contentLength = r2Response.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);

    return new NextResponse(r2Response.body, { status: 200, headers });
  } catch (error) {
    console.error("Failed to serve preview:", error);
    return NextResponse.json(
      { error: "Failed to serve preview" },
      { status: 500 },
    );
  }
}
