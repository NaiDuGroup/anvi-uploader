import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readLocalFile } from "@/lib/local-storage";
import { getPresignedDownloadUrl } from "@/lib/r2";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const order = await prisma.order.findUnique({
      where: { publicToken: token },
      select: {
        productType: true,
        expiresAt: true,
        files: { select: { fileUrl: true, fileName: true }, take: 1 },
      },
    });

    if (!order || order.productType !== "mug") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (new Date() > order.expiresAt) {
      return NextResponse.json({ error: "Expired" }, { status: 410 });
    }

    const file = order.files[0];
    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", "image/png");
    headers.set("Cache-Control", "public, max-age=3600, immutable");

    if (isLocalDev) {
      const data = await readLocalFile(file.fileUrl);
      if (!data) {
        return NextResponse.json({ error: "File not on disk" }, { status: 404 });
      }
      headers.set("Content-Length", String(data.byteLength));
      return new NextResponse(data, { status: 200, headers });
    }

    const downloadUrl = await getPresignedDownloadUrl(file.fileUrl);
    const r2Res = await fetch(downloadUrl);
    if (!r2Res.ok || !r2Res.body) {
      return NextResponse.json({ error: "Storage error" }, { status: 502 });
    }

    const cl = r2Res.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);

    return new NextResponse(r2Res.body, { status: 200, headers });
  } catch (error) {
    console.error("GET /api/approve/[token]/image:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
