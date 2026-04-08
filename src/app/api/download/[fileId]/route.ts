import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getPresignedDownloadUrl } from "@/lib/r2";
import { readLocalFile } from "@/lib/local-storage";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
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

  const headers = new Headers();
  headers.set(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(file.fileName)}"`
  );

  if (isLocalDev) {
    const localData = await readLocalFile(file.fileUrl);
    if (localData) {
      const ext = file.fileName.split(".").pop()?.toLowerCase() ?? "";
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
        pdf: "application/pdf",
      };
      headers.set("Content-Type", mimeMap[ext] ?? "application/octet-stream");
      headers.set("Content-Length", String(localData.byteLength));
      return new NextResponse(localData, { status: 200, headers });
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
        { status: 502 }
      );
    }

    const contentType = r2Response.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const contentLength = r2Response.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);

    return new NextResponse(r2Response.body, { status: 200, headers });
  } catch (error) {
    console.error("Failed to download file:", error);
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 }
    );
  }
}
