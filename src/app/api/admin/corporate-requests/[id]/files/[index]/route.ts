import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { corporateRequestFile } from "@/lib/corporate/requests";
import { readLocalFile } from "@/lib/local-storage";
import { getPresignedDownloadUrl, isLocalObjectStorage } from "@/lib/r2";

/** Download a logo / brief file of a «Pentru companii» request (staff). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, index } = await params;
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const file = await corporateRequestFile(id, i);
    if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (isLocalObjectStorage()) {
      const data = await readLocalFile(file.key);
      if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return new NextResponse(new Uint8Array(data), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    return NextResponse.redirect(await getPresignedDownloadUrl(file.key), 302);
  } catch (error) {
    console.error("GET /api/admin/corporate-requests/[id]/files:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
