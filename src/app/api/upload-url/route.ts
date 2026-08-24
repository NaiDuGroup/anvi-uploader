import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getPresignedUploadUrl, type BucketKind } from "@/lib/r2";
import { saveLocalFile } from "@/lib/local-storage";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

/**
 * Upload scope determines both the object key prefix and which storage bucket
 * the file lands in.
 *
 * - `order`         → main bucket, `uploads/...` prefix (lifecycle-expired).
 * - `mugCatalog`    → catalog bucket, `catalog/mugs/...` prefix (long-lived, public).
 * - `notebookCatalog` → catalog bucket, `catalog/notebooks/...` prefix (long-lived, public).
 * - `designAsset`   → catalog bucket, `catalog/design-assets/...` prefix (shared clipart, long-lived).
 */
type UploadScope = "order" | "mugCatalog" | "notebookCatalog" | "designAsset";

const SCOPES: Record<UploadScope, { prefix: string; bucket: BucketKind }> = {
  order: { prefix: "uploads", bucket: "uploads" },
  mugCatalog: { prefix: "catalog/mugs", bucket: "catalog" },
  notebookCatalog: { prefix: "catalog/notebooks", bucket: "catalog" },
  designAsset: { prefix: "catalog/design-assets", bucket: "catalog" },
};

function isUploadScope(value: unknown): value is UploadScope {
  return typeof value === "string" && value in SCOPES;
}

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
      scope?: unknown;
    };
    const { fileName, contentType, scope: scopeInput } = body;

    if (typeof fileName !== "string" || fileName.length === 0) {
      return NextResponse.json(
        { error: "fileName is required" },
        { status: 400 }
      );
    }

    const scope: UploadScope = isUploadScope(scopeInput) ? scopeInput : "order";
    const { prefix, bucket } = SCOPES[scope];
    const key = `${prefix}/${Date.now()}-${nanoid(8)}-${fileName}`;

    if (isLocalDev) {
      const host = request.headers.get("host") ?? "localhost:3000";
      const protocol = request.headers.get("x-forwarded-proto") ?? "http";
      return NextResponse.json({
        uploadUrl: `${protocol}://${host}/api/upload-url?key=${encodeURIComponent(key)}`,
        fileKey: key,
      });
    }

    const resolvedContentType =
      typeof contentType === "string" && contentType.length > 0
        ? contentType
        : "application/octet-stream";

    const uploadUrl = await getPresignedUploadUrl(key, resolvedContentType, bucket);

    return NextResponse.json({ uploadUrl, fileKey: key });
  } catch (error) {
    console.error("Failed to generate upload URL:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
