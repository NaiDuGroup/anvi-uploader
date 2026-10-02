/**
 * Client helper: persist a generated batch PNG into the 7-day workshop
 * history. Shared by the four callers (notebook / pen / freepack manual
 * composers and the workshop-board auto-batcher).
 *
 * Flow (direct-to-R2 presigned PUT, bypasses Vercel's ~4.5 MB body limit):
 *
 *   1. POST /api/workshop-batches/presign { kind, fileName, contentType }
 *      → { uploadUrl, fileKey, contentType }
 *   2. PUT <blob> → `uploadUrl` with the matching Content-Type header.
 *      In production this hits R2 directly; in local dev it hits the
 *      `/api/upload-url?key=…` passthrough that writes to `.local-uploads/`.
 *   3. POST /api/workshop-batches { kind, fileName, tileCount, fileKey,
 *      sizeBytes, contentType } → DB row + history entry.
 *
 * Failure in any step throws {@link WorkshopBatchUploadError}; the operator
 * has already received a local `downloadBlob()`, so the surrounding caller
 * surfaces this as a non-fatal warning.
 */

export type WorkshopBatchKind = "notebook" | "pen" | "freepack";

export interface UploadWorkshopBatchArgs {
  kind: WorkshopBatchKind;
  fileName: string;
  tileCount: number;
  blob: Blob;
}

export interface UploadedWorkshopBatch {
  id: string;
  fileKey: string;
  fileName: string;
  createdAt: string;
  expiresAt: string;
  downloadUrl: string;
}

export class WorkshopBatchUploadError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "WorkshopBatchUploadError";
  }
}

interface PresignResponse {
  uploadUrl: string;
  fileKey: string;
  contentType: string;
}

async function throwFromResponse(
  res: Response,
  fallback: string,
): Promise<never> {
  let msg = `HTTP ${res.status}`;
  try {
    const payload = (await res.json()) as { error?: string };
    if (payload.error) msg = payload.error;
  } catch {
    /* body might not be JSON (e.g. R2 XML error) */
  }
  throw new WorkshopBatchUploadError(msg || fallback, res.status);
}

export async function uploadWorkshopBatch(
  args: UploadWorkshopBatchArgs,
): Promise<UploadedWorkshopBatch> {
  const resolvedContentType =
    args.blob.type && args.blob.type.length > 0 ? args.blob.type : "image/png";

  // ─ Step 1: presign ────────────────────────────────────────────────────────
  const presignRes = await fetch("/api/workshop-batches/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      kind: args.kind,
      fileName: args.fileName,
      contentType: resolvedContentType,
    }),
  });
  if (!presignRes.ok) {
    await throwFromResponse(presignRes, "Failed to presign upload");
  }
  const { uploadUrl, fileKey, contentType } =
    (await presignRes.json()) as PresignResponse;

  // ─ Step 2: direct PUT to R2 (or /api/upload-url in local dev) ─────────────
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: args.blob,
  });
  if (!putRes.ok) {
    throw new WorkshopBatchUploadError(
      `Direct upload failed: HTTP ${putRes.status}`,
      putRes.status,
    );
  }

  // ─ Step 3: commit metadata ────────────────────────────────────────────────
  const commitRes = await fetch("/api/workshop-batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      kind: args.kind,
      fileName: args.fileName,
      tileCount: args.tileCount,
      fileKey,
      sizeBytes: args.blob.size,
      contentType,
    }),
  });
  if (!commitRes.ok) {
    await throwFromResponse(commitRes, "Failed to commit batch metadata");
  }
  return (await commitRes.json()) as UploadedWorkshopBatch;
}
