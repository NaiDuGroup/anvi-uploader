import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { readLocalFile } from "@/lib/local-storage";
import { getPresignedDownloadUrl } from "@/lib/r2";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

function guessMime(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

/**
 * Serve a file by its R2 storage key (admin-only).
 * Used when re-editing a mug layout to load the original source photos.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = request.nextUrl.searchParams.get("key");
  if (!key || key.includes("..")) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const mime = guessMime(key);
  const headers = new Headers({
    "Content-Type": mime,
    "Cache-Control": "private, max-age=3600, immutable",
  });

  if (isLocalDev) {
    const data = await readLocalFile(key);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    headers.set("Content-Length", String(data.byteLength));
    return new NextResponse(new Uint8Array(data), { status: 200, headers });
  }

  try {
    const downloadUrl = await getPresignedDownloadUrl(key);
    const r2Res = await fetch(downloadUrl);
    if (!r2Res.ok || !r2Res.body) {
      return NextResponse.json({ error: "Storage error" }, { status: 502 });
    }
    const cl = r2Res.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);
    return new NextResponse(r2Res.body, { status: 200, headers });
  } catch (error) {
    console.error("GET /api/admin/file-by-key:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
