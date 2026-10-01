/**
 * Client helper: POST a generated batch PNG to `/api/workshop-batches` so it
 * lands in the shared 7-day history. Wrapped in a small module so both tools
 * (notebook + pen) share the exact same request shape and error surface.
 *
 * Failure here is non-fatal: the tool has already handed the operator a
 * local download via {@link downloadBlob}. We only surface a soft warning
 * so the workshop knows to re-run compose if they wanted the history record.
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

/** POST as `multipart/form-data`. Reject only on 4xx/5xx or network failure. */
export async function uploadWorkshopBatch(
  args: UploadWorkshopBatchArgs,
): Promise<UploadedWorkshopBatch> {
  const form = new FormData();
  form.set("kind", args.kind);
  form.set("fileName", args.fileName);
  form.set("tileCount", String(args.tileCount));
  form.set("file", args.blob, args.fileName);

  const res = await fetch("/api/workshop-batches", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload.error) msg = payload.error;
    } catch {
      /* body might not be JSON */
    }
    throw new WorkshopBatchUploadError(msg, res.status);
  }
  return (await res.json()) as UploadedWorkshopBatch;
}
