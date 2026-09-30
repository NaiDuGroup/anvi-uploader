/**
 * Workshop-batch history endpoints.
 *
 * These routes power the pen/notebook batch layout tools on
 * `/admin/workshop-batches`. A generated PNG is uploaded here (POST), the
 * history rail lists recent uploads (GET), and individual entries can be
 * (soft-)removed via `DELETE /api/workshop-batches/[id]`.
 *
 * Access is limited to workshop operators and superadmins (the same gate as
 * `/admin/workshop-board`). Studio `admin` accounts get 403.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPresignedDownloadUrl,
  isLocalObjectStorage,
  putObjectBuffer,
} from "@/lib/r2";
import { saveLocalFile } from "@/lib/local-storage";
import { buildBatchStorageKey } from "@/lib/workshopBatches/storageKey";
import { workshopBatchExpiryAt } from "@/lib/workshopBatches/lifecycle";

export const runtime = "nodejs";
/** Batch PNGs top out around 5 MB (12 pens @ 300 DPI ≈ 4939 x 5 rows). */
export const maxDuration = 60;

const MAX_BLOB_BYTES = 10 * 1024 * 1024; // 10 MB cap — well under Vercel body limit
const HISTORY_LIMIT = 20;

const KIND_VALUES = ["notebook", "pen"] as const;
type BatchKind = (typeof KIND_VALUES)[number];

const listQuerySchema = z.object({
  kind: z.enum(KIND_VALUES).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

function isAllowedRole(role: string): boolean {
  return role === "workshop" || role === "superadmin";
}

/**
 * Local-dev download URL that streams from `.local-uploads`. For R2 we return
 * a presigned URL directly so browsers hit object storage without going
 * through the Next.js server.
 */
function localDownloadUrl(id: string): string {
  return `/api/workshop-batches/${id}/download`;
}

// ─── POST: upload a generated batch ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAllowedRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart body" },
      { status: 400 },
    );
  }

  const kindRaw = form.get("kind");
  const fileNameRaw = form.get("fileName");
  const tileCountRaw = form.get("tileCount");
  const blob = form.get("file");

  if (typeof kindRaw !== "string" || !(KIND_VALUES as readonly string[]).includes(kindRaw)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  const kind = kindRaw as BatchKind;

  if (typeof fileNameRaw !== "string" || fileNameRaw.length === 0) {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }
  if (fileNameRaw.length > 200) {
    return NextResponse.json({ error: "fileName too long" }, { status: 400 });
  }

  const tileCount = Number(tileCountRaw);
  if (!Number.isInteger(tileCount) || tileCount < 2 || tileCount > 12) {
    return NextResponse.json({ error: "Invalid tileCount" }, { status: 400 });
  }

  if (!(blob instanceof Blob)) {
    return NextResponse.json({ error: "file blob is required" }, { status: 400 });
  }
  if (blob.size === 0) {
    return NextResponse.json({ error: "file blob is empty" }, { status: 400 });
  }
  if (blob.size > MAX_BLOB_BYTES) {
    return NextResponse.json(
      { error: `file too large (max ${MAX_BLOB_BYTES} bytes)` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const contentType = blob.type && blob.type.length > 0 ? blob.type : "image/png";

  const key = buildBatchStorageKey({
    timestampMs: Date.now(),
    nanoid: nanoid(8),
    fileName: fileNameRaw,
  });

  try {
    if (isLocalObjectStorage()) {
      await saveLocalFile(key, buffer);
    } else {
      await putObjectBuffer(key, buffer, contentType, {
        contentDisposition: `attachment; filename="${encodeURIComponent(fileNameRaw)}"`,
      });
    }
  } catch (error) {
    console.error("POST /api/workshop-batches: object storage put failed:", error);
    return NextResponse.json(
      { error: "Failed to persist batch layout" },
      { status: 500 },
    );
  }

  const row = await prisma.workshopBatchLayout.create({
    data: {
      kind,
      fileKey: key,
      fileName: fileNameRaw,
      contentType,
      sizeBytes: buffer.byteLength,
      tileCount,
      createdById: user.id,
    },
  });

  return NextResponse.json({
    id: row.id,
    fileKey: row.fileKey,
    fileName: row.fileName,
    createdAt: row.createdAt.toISOString(),
    expiresAt: workshopBatchExpiryAt(row.createdAt).toISOString(),
    downloadUrl: localDownloadUrl(row.id),
  });
}

// ─── GET: list recent batches ───────────────────────────────────────────────

interface ListItem {
  id: string;
  kind: BatchKind;
  fileKey: string;
  fileName: string;
  sizeBytes: number;
  tileCount: number;
  createdAt: string;
  createdByName: string | null;
  /** Presigned or local URL for the inline `<img>` preview thumbnail. */
  previewUrl: string;
  /** Server-issued redirect endpoint that force-downloads. */
  downloadUrl: string;
  expiresAt: string;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAllowedRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = listQuerySchema.safeParse({
    kind: request.nextUrl.searchParams.get("kind") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const kindFilter = parsed.data.kind;
  const limit = parsed.data.limit ?? HISTORY_LIMIT;

  // Only show rows still within the 7-day window so we do not link to
  // objects the R2 lifecycle rule has already reaped.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await prisma.workshopBatchLayout.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: cutoff },
      ...(kindFilter ? { kind: kindFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      createdBy: { select: { name: true, displayName: true } },
    },
  });

  const local = isLocalObjectStorage();
  const items: ListItem[] = [];
  for (const row of rows) {
    let previewUrl: string;
    if (local) {
      previewUrl = `/api/workshop-batches/${row.id}/download?inline=1`;
    } else {
      try {
        previewUrl = await getPresignedDownloadUrl(row.fileKey);
      } catch (error) {
        console.error(
          `GET /api/workshop-batches: presign failed for ${row.id}`,
          error,
        );
        continue;
      }
    }
    const createdByName =
      row.createdBy?.displayName ?? row.createdBy?.name ?? null;
    items.push({
      id: row.id,
      kind: row.kind as BatchKind,
      fileKey: row.fileKey,
      fileName: row.fileName,
      sizeBytes: row.sizeBytes,
      tileCount: row.tileCount,
      createdAt: row.createdAt.toISOString(),
      createdByName,
      previewUrl,
      downloadUrl: localDownloadUrl(row.id),
      expiresAt: workshopBatchExpiryAt(row.createdAt).toISOString(),
    });
  }

  return NextResponse.json({ items });
}
