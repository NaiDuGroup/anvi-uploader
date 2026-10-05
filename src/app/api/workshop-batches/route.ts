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
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPresignedDownloadUrl,
  isLocalObjectStorage,
} from "@/lib/r2";
import { isWorkshopBatchKey } from "@/lib/workshopBatches/storageKey";
import { workshopBatchExpiryAt } from "@/lib/workshopBatches/lifecycle";

export const runtime = "nodejs";
/** Batch PNGs top out around 5 MB (12 pens @ 300 DPI ≈ 4939 x 5 rows). */
export const maxDuration = 60;

/**
 * Hard safety ceiling for the committed object size. Notebook batches with
 * 8 A5 covers at 300 DPI run 20-30 MB; raise this if freepack layouts ever
 * get bigger. R2 itself has no practical limit for the bucket.
 */
const MAX_COMMIT_SIZE_BYTES = 80 * 1024 * 1024; // 80 MB
const HISTORY_LIMIT = 20;

const KIND_VALUES = ["notebook", "pen", "freepack", "mug"] as const;
type BatchKind = (typeof KIND_VALUES)[number];
/**
 * Server-side `tileCount` bounds. Per-kind UI limits (notebook=8, pen=12,
 * freepack=20, mug=2) are enforced on the client; these are the absolute
 * bounds the DB column accepts. Keeps the server validator kind-agnostic.
 *
 * The floor is 1 rather than 2 because an A4 mug sheet with an odd trailing
 * design is a legitimate single-tile layout.
 */
const TILE_COUNT_MIN = 1;
const TILE_COUNT_MAX = 20;

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

// ─── POST: commit a batch that was already uploaded via presigned PUT ───────
//
// The browser:
//   1. POST /api/workshop-batches/presign { kind, fileName, contentType }
//      → { uploadUrl, fileKey }
//   2. PUT the blob directly to `uploadUrl` (R2 in prod, /api/upload-url in dev)
//   3. POST /api/workshop-batches (this endpoint) with JSON metadata, no blob.
//
// Step 2 bypasses Vercel's ~4.5 MB serverless body limit; this handler only
// writes a DB row referencing the already-uploaded object. For objects that
// never actually landed in R2 the client-side download link will later 410,
// which is a visible symptom but not a corruption risk.

const commitSchema = z.object({
  kind: z.enum(KIND_VALUES),
  fileName: z.string().min(1).max(200),
  tileCount: z.number().int().min(TILE_COUNT_MIN).max(TILE_COUNT_MAX),
  fileKey: z.string().min(1).max(500),
  sizeBytes: z.number().int().positive().max(MAX_COMMIT_SIZE_BYTES),
  contentType: z.string().min(1).max(100).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAllowedRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = commitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { kind, fileName, tileCount, fileKey, sizeBytes, contentType } =
    parsed.data;

  // Defence-in-depth: only accept keys produced by our presign endpoint so a
  // compromised session can't commit arbitrary R2 objects into the history.
  if (!isWorkshopBatchKey(fileKey)) {
    return NextResponse.json(
      { error: "Invalid fileKey (must be a workshop-batches/ key)" },
      { status: 400 },
    );
  }

  const resolvedContentType =
    contentType && contentType.length > 0 ? contentType : "image/png";

  const row = await prisma.workshopBatchLayout.create({
    data: {
      kind,
      fileKey,
      fileName,
      contentType: resolvedContentType,
      sizeBytes,
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
