import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLibraryStaff } from "@/lib/library/libraryAuth";
import { libraryItemThumb } from "@/lib/library/libraryThumb";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Small WebP preview of a library item: the first page of a PDF or a scaled
 * raster (TIF included). Rendered once and cached under `library/thumbs/`;
 * the copy behind an id never changes, so the browser may keep it for a week.
 * 404 `{ code: "no_preview" | "too_big" | "missing" }` → the UI shows the type label.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireLibraryStaff();
  if (denied) return denied;
  const { id } = await params;
  const row = await prisma.libraryFile.findUnique({ where: { id }, select: { id: true, storageKey: true, fileName: true } });
  if (!row) return NextResponse.json({ error: "Не найдено", code: "not_found" }, { status: 404 });
  try {
    const res = await libraryItemThumb(row);
    if (!res.ok) {
      // The browser keeps «no preview» for a while instead of asking on every render.
      return NextResponse.json(
        { error: "No preview", code: res.reason },
        { status: 404, headers: { "Cache-Control": res.reason === "missing" ? "no-store" : "private, max-age=86400" } },
      );
    }
    return new NextResponse(new Uint8Array(res.bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(res.bytes.byteLength),
        "Cache-Control": "private, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("GET /api/admin/library/[id]/thumb:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
