import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { ZodError, z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { getPresignedUploadUrl, isLocalObjectStorage } from "@/lib/r2";

const presignBodySchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
});

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function safeLogoBaseName(fileName: string): string {
  const base = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 0 ? base.slice(0, 120) : "logo.png";
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { fileName, contentType } = presignBodySchema.parse(body);
    const ct = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!ALLOWED_IMAGE_TYPES.has(ct)) {
      return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
    }

    const key = `company/logo/${Date.now()}-${nanoid(8)}-${safeLogoBaseName(fileName)}`;

    if (isLocalObjectStorage()) {
      const host = request.headers.get("host") ?? "localhost:3000";
      const protocol = request.headers.get("x-forwarded-proto") ?? "http";
      return NextResponse.json({
        uploadUrl: `${protocol}://${host}/api/upload-url?key=${encodeURIComponent(key)}`,
        fileKey: key,
      });
    }

    const uploadUrl = await getPresignedUploadUrl(key, ct);
    return NextResponse.json({ uploadUrl, fileKey: key });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.flatten() },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/company-logo/presign:", e);
    return NextResponse.json({ error: "Failed to presign upload" }, { status: 500 });
  }
}
