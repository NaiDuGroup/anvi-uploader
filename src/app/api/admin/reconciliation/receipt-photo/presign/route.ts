import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { nanoid } from "nanoid";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { getPresignedUploadUrl } from "@/lib/r2";

export const runtime = "nodejs";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

const bodySchema = z.object({
  idno: z.string().trim().min(1).max(32),
  fileName: z.string().trim().min(1).max(200),
  contentType: z
    .string()
    .trim()
    .regex(/^image\/(jpeg|png|webp|heic|heif|gif)$/i)
    .optional(),
});

/** Presign upload for a debtors POS receipt photo under receipts/<idno>/. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { idno, fileName, contentType } = bodySchema.parse(await request.json());
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const key = `receipts/${idno}/${Date.now()}-${nanoid(8)}-${safeName}`;
    const resolvedType = contentType ?? "image/jpeg";

    if (isLocalDev) {
      const host = request.headers.get("host") ?? "localhost:3000";
      const protocol = request.headers.get("x-forwarded-proto") ?? "http";
      return NextResponse.json({
        uploadUrl: `${protocol}://${host}/api/upload-url?key=${encodeURIComponent(key)}`,
        fileKey: key,
      });
    }

    const uploadUrl = await getPresignedUploadUrl(key, resolvedType, "uploads");
    return NextResponse.json({ uploadUrl, fileKey: key });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/reconciliation/receipt-photo/presign:", error);
    return NextResponse.json({ error: "Failed to presign upload" }, { status: 500 });
  }
}
