import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getPresignedUploadUrl } from "@/lib/r2";
import { saveLocalFile } from "@/lib/local-storage";
import { getSessionUser } from "@/lib/auth";
import { buildUploadKey, decideUploadRequest } from "@/lib/uploads/uploadScopePolicy";
import {
  RATE_LIMITS,
  clientIpFromHeaders,
  hitRateLimit,
  rateLimitResponseInit,
} from "@/lib/rateLimit";
import { guardUploaderTurnstile } from "@/lib/turnstile/guard";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

/**
 * Presigned PUT URLs for browser uploads. Scopes, their buckets/prefixes, who
 * may request them and the size / type limits live in
 * `src/lib/uploads/uploadScopePolicy.ts`:
 *
 * - `order` (default) is public — the walk-in form on `/`, the `/mug`
 *   `/notebook` `/pen` editors, the cabinet and the admin wizard.
 * - every catalog scope (`mugCatalog`, `notebookCatalog`, `penCatalog`,
 *   `designAsset`, `stockCatalog`) needs a staff session.
 *
 * The object key is always built here; the client only supplies a display
 * file name, which is stripped of any path. Callers without a staff session
 * are rate-limited per IP.
 */

export async function PUT(request: NextRequest) {
  if (isLocalDev) {
    const key = request.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json({ error: "Missing key param" }, { status: 400 });
    }
    const buf = Buffer.from(await request.arrayBuffer());
    await saveLocalFile(key, buf);
    return new NextResponse(null, { status: 200 });
  }
  await request.arrayBuffer();
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      fileName?: unknown;
      contentType?: unknown;
      fileSize?: unknown;
      scope?: unknown;
    };

    const staff = await getSessionUser();
    // Kill switch: UPLOAD_SIGN_CONTENT_LENGTH=0 falls back to unsigned length
    // and also stops requiring a declared size.
    const signLength = process.env.UPLOAD_SIGN_CONTENT_LENGTH !== "0";
    const decision = decideUploadRequest(
      {
        fileName: body.fileName,
        contentType: body.contentType,
        fileSize: body.fileSize,
        scope: body.scope,
      },
      { isStaff: staff !== null, requireFileSize: staff === null && signLength },
    );
    if (!decision.ok) {
      return NextResponse.json({ error: decision.error }, { status: decision.status });
    }

    if (!staff) {
      const limit = await hitRateLimit(RATE_LIMITS.uploadUrl, clientIpFromHeaders(request.headers));
      if (!limit.allowed) {
        const { body: errBody, init } = rateLimitResponseInit(limit);
        return NextResponse.json(errBody, init);
      }
      // Turnstile only with TURNSTILE_PROTECT_UPLOADER=1 (default off — walk-in clients).
      const blocked = await guardUploaderTurnstile(request);
      if (blocked) return blocked;
    }

    const { prefix, bucket } = decision.config;
    const key = buildUploadKey(prefix, decision.fileName, Date.now(), nanoid(8));

    if (isLocalDev) {
      const host = request.headers.get("host") ?? "localhost:3000";
      const protocol = request.headers.get("x-forwarded-proto") ?? "http";
      return NextResponse.json({
        uploadUrl: `${protocol}://${host}/api/upload-url?key=${encodeURIComponent(key)}`,
        fileKey: key,
        contentType: decision.contentType,
      });
    }

    // With a declared size, Content-Length is signed into the URL, so R2
    // rejects a PUT whose body differs from what passed the size check.
    // Kill switch: see `signLength` above.
    const uploadUrl = await getPresignedUploadUrl(key, decision.contentType, bucket, {
      contentLength: signLength ? (decision.fileSize ?? undefined) : undefined,
    });

    // The signed Content-Type may differ from the declared one (scriptable
    // types are coerced to octet-stream); the client must PUT with this one.
    return NextResponse.json({ uploadUrl, fileKey: key, contentType: decision.contentType });
  } catch (error) {
    console.error("Failed to generate upload URL:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
