import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLibraryStaff } from "@/lib/library/libraryAuth";
import { thumbForStoredFile } from "@/lib/library/libraryThumb";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Preview of an order file in «Сохранить в библиотеку» (first PDF page /
 * scaled raster). Not stored: order files expire, the dialog is opened rarely;
 * HTTP caching covers re-opening it.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { denied } = await requireLibraryStaff();
  if (denied) return denied;
  const { fileId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return NextResponse.json({ error: "Invalid", code: "invalid" }, { status: 400 });
  const file = await prisma.file.findUnique({ where: { id: fileId }, select: { fileUrl: true, fileName: true } });
  if (!file) return NextResponse.json({ error: "Не найдено", code: "not_found" }, { status: 404 });
  if (/^https?:\/\//i.test(file.fileUrl)) {
    return NextResponse.json({ error: "No preview", code: "no_preview" }, { status: 404 });
  }
  try {
    const res = await thumbForStoredFile(file.fileUrl, file.fileName);
    if (!res.ok) return NextResponse.json({ error: "No preview", code: res.reason }, { status: 404 });
    return new NextResponse(new Uint8Array(res.bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(res.bytes.byteLength),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("GET /api/admin/library/order-file-thumb:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
