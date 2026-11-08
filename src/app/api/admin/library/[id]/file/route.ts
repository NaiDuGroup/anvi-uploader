import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLibraryStaff } from "@/lib/library/libraryAuth";
import { isLocalObjectStorage, getPresignedDownloadUrl } from "@/lib/r2";
import { readLocalFile } from "@/lib/local-storage";
import { applySafeFileHeaders } from "@/lib/files/safeFileHeaders";

export const runtime = "nodejs";

/**
 * The library copy itself: inline preview (whitelisted types only, see
 * `applySafeFileHeaders`) or `?download=1` as an attachment. Staff only.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireLibraryStaff();
  if (denied) return denied;
  const { id } = await params;
  const row = await prisma.libraryFile.findUnique({ where: { id }, select: { storageKey: true, fileName: true } });
  if (!row) return NextResponse.json({ error: "Не найдено", code: "not_found" }, { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const headers = new Headers({ "Cache-Control": "private, max-age=3600" });
  applySafeFileHeaders(headers, { fileName: row.fileName, disposition: download ? "attachment" : "inline" });

  if (isLocalObjectStorage()) {
    const data = await readLocalFile(row.storageKey);
    if (!data) return NextResponse.json({ error: "Файл не найден в хранилище" }, { status: 404 });
    headers.set("Content-Length", String(data.byteLength));
    return new NextResponse(new Uint8Array(data), { status: 200, headers });
  }

  try {
    const res = await fetch(await getPresignedDownloadUrl(row.storageKey));
    if (res.status === 404) return NextResponse.json({ error: "Файл не найден в хранилище" }, { status: 404 });
    if (!res.ok || !res.body) return NextResponse.json({ error: "Storage error" }, { status: 502 });
    const cl = res.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);
    return new NextResponse(res.body, { status: 200, headers });
  } catch (error) {
    console.error("GET /api/admin/library/[id]/file:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
