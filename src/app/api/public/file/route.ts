import { NextRequest, NextResponse } from "next/server";
import { readLocalFile } from "@/lib/local-storage";
import { getPresignedDownloadUrl, type BucketKind } from "@/lib/r2";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

/**
 * Whitelisted key prefixes per logical bucket. Any request whose key does not
 * match an allowed prefix for the requested bucket is rejected, so this route
 * can never be tricked into fetching arbitrary objects (or objects from the
 * wrong bucket, e.g. private order files).
 */
const ALLOWED_PREFIXES: Record<BucketKind, readonly string[]> = {
  uploads: ["uploads/"],
  catalog: ["catalog/", "company/"],
};

function guessMime(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

function parseBucket(value: string | null): BucketKind | null {
  if (value === null || value === "uploads") return "uploads";
  if (value === "catalog") return "catalog";
  return null;
}

/**
 * Unauthenticated read for public assets:
 * - Order files / legacy catalog assets under `uploads/` (main bucket).
 * - Catalog product photos under `catalog/` and company logo under `company/`
 *   (catalog bucket, when `?bucket=catalog`).
 *
 * Used as a fallback when no public R2 CDN URL is configured; otherwise the
 * client points `<img>` tags directly at `R2_(CATALOG_)PUBLIC_URL`.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key || key.includes("..")) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const bucket = parseBucket(request.nextUrl.searchParams.get("bucket"));
  if (bucket === null) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  const allowed = ALLOWED_PREFIXES[bucket];
  if (!allowed.some((p) => key.startsWith(p))) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const mime = guessMime(key);
  const headers = new Headers({
    "Content-Type": mime,
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
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
    const downloadUrl = await getPresignedDownloadUrl(key, bucket);
    const r2Res = await fetch(downloadUrl);
    if (!r2Res.ok || !r2Res.body) {
      return NextResponse.json({ error: "Storage error" }, { status: 502 });
    }
    const cl = r2Res.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);
    return new NextResponse(r2Res.body, { status: 200, headers });
  } catch (error) {
    console.error("GET /api/public/file:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
