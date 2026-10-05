/**
 * Presign a direct-to-R2 PUT URL for a workshop-batch PNG.
 *
 * Why: `POST /api/workshop-batches` with the raw blob only works for small
 * files because Vercel caps serverless-function bodies around 4.5 MB.
 * Big notebook / freepack layouts easily exceed that (8 A5 covers @ 300 DPI
 * can be 20+ MB) and get rejected with HTTP 413 before our handler ever sees
 * them. By returning a presigned R2 upload URL the browser uploads straight
 * to object storage, no body limit, and `POST /api/workshop-batches` is left
 * to do metadata-only commits.
 *
 * Access gate matches the main endpoint (workshop operators + superadmins).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getSessionUser } from "@/lib/auth";
import { getPresignedUploadUrl, isLocalObjectStorage } from "@/lib/r2";
import { buildBatchStorageKey } from "@/lib/workshopBatches/storageKey";

export const runtime = "nodejs";

const KIND_VALUES = ["notebook", "pen", "freepack", "mug"] as const;

const bodySchema = z.object({
  kind: z.enum(KIND_VALUES),
  fileName: z.string().min(1).max(200),
  /** Browser-reported MIME, used by R2 to serve the object with correct Content-Type. */
  contentType: z.string().min(1).max(100).optional(),
});

function isAllowedRole(role: string): boolean {
  return role === "workshop" || role === "superadmin";
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAllowedRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { fileName, contentType } = parsed.data;

  const key = buildBatchStorageKey({
    timestampMs: Date.now(),
    nanoid: nanoid(8),
    fileName,
  });

  const resolvedContentType =
    contentType && contentType.length > 0 ? contentType : "image/png";

  // Local dev routes PUT back through `/api/upload-url?key=...` which writes
  // to `.local-uploads/`. In production we hand the browser a real R2
  // presigned URL (bucket defaults to `uploads`, same as regular order files
  // so the 7-day lifecycle rule reaps workshop batches automatically).
  if (isLocalObjectStorage()) {
    const host = request.headers.get("host") ?? "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") ?? "http";
    return NextResponse.json({
      uploadUrl: `${protocol}://${host}/api/upload-url?key=${encodeURIComponent(key)}`,
      fileKey: key,
      contentType: resolvedContentType,
    });
  }

  try {
    const uploadUrl = await getPresignedUploadUrl(key, resolvedContentType);
    return NextResponse.json({ uploadUrl, fileKey: key, contentType: resolvedContentType });
  } catch (error) {
    console.error("POST /api/workshop-batches/presign failed:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 },
    );
  }
}
