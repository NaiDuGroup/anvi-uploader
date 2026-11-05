import type { BucketKind } from "@/lib/r2";
import { CORPORATE_FILE_MAX_BYTES, checkCorporateFile } from "@/lib/corporate/fileTypes";

/**
 * Policy for `POST /api/upload-url`: which scopes exist, where their objects
 * land, who may request them and how big / what type the declared file may be.
 *
 * Pure (no DB, no request objects) so it is unit-tested in isolation.
 *
 * - `order`           → main bucket, `uploads/...` (lifecycle-expired). Public:
 *                       the walk-in form on `/`, the `/mug` `/notebook` `/pen`
 *                       editors, the cabinet and the admin wizard all use it.
 * - `mugCatalog`      → catalog bucket, `catalog/mugs/...` (staff only).
 * - `notebookCatalog` → catalog bucket, `catalog/notebooks/...` (staff only).
 * - `penCatalog`      → catalog bucket, `catalog/pens/...` (staff only).
 * - `designAsset`     → catalog bucket, `catalog/design-assets/...` (staff only).
 * - `stockCatalog`    → catalog bucket, `catalog/stock/...` (staff only).
 * - `corporate`       → main bucket, `uploads/...` like `order`, but only the
 *                       «Pentru companii» logo / brief types (`corporate/fileTypes.ts`).
 */
export type UploadScope =
  | "order"
  | "corporate"
  | "mugCatalog"
  | "notebookCatalog"
  | "penCatalog"
  | "designAsset"
  | "stockCatalog";

/** `public`: anyone, no session. `staff`: admin/superadmin/workshop session. */
export type UploadAuth = "public" | "staff";

const MB = 1024 * 1024;

/**
 * Order files: large-format TIFF/PDF print files can reach several hundred MB
 * (wide banners at 150–300 dpi), so 2 GiB leaves headroom while staying well
 * under R2's 5 GiB single-PUT limit.
 */
export const ORDER_FILE_MAX_BYTES = 2048 * MB;
/** Catalog photos / clipart are web images; 25 MB is far above any real one. */
export const CATALOG_IMAGE_MAX_BYTES = 25 * MB;

export interface UploadScopeConfig {
  prefix: string;
  bucket: BucketKind;
  auth: UploadAuth;
  maxBytes: number;
  /** When true the declared content type must be `image/*`. */
  imagesOnly: boolean;
  /** Only the «Pentru companii» attachment types (extension + declared content type). */
  corporateFilesOnly?: boolean;
}

export const UPLOAD_SCOPES: Record<UploadScope, UploadScopeConfig> = {
  order: { prefix: "uploads", bucket: "uploads", auth: "public", maxBytes: ORDER_FILE_MAX_BYTES, imagesOnly: false },
  corporate: {
    prefix: "uploads",
    bucket: "uploads",
    auth: "public",
    maxBytes: CORPORATE_FILE_MAX_BYTES,
    imagesOnly: false,
    corporateFilesOnly: true,
  },
  mugCatalog: { prefix: "catalog/mugs", bucket: "catalog", auth: "staff", maxBytes: CATALOG_IMAGE_MAX_BYTES, imagesOnly: true },
  notebookCatalog: { prefix: "catalog/notebooks", bucket: "catalog", auth: "staff", maxBytes: CATALOG_IMAGE_MAX_BYTES, imagesOnly: true },
  penCatalog: { prefix: "catalog/pens", bucket: "catalog", auth: "staff", maxBytes: CATALOG_IMAGE_MAX_BYTES, imagesOnly: true },
  designAsset: { prefix: "catalog/design-assets", bucket: "catalog", auth: "staff", maxBytes: CATALOG_IMAGE_MAX_BYTES, imagesOnly: true },
  stockCatalog: { prefix: "catalog/stock", bucket: "catalog", auth: "staff", maxBytes: CATALOG_IMAGE_MAX_BYTES, imagesOnly: true },
};

export function isUploadScope(value: unknown): value is UploadScope {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(UPLOAD_SCOPES, value);
}

export interface UploadCaller {
  isStaff: boolean;
}

export interface UploadRequestInput {
  fileName: unknown;
  contentType: unknown;
  /** Declared file size in bytes (`File.size`). Optional for older clients. */
  fileSize: unknown;
  scope: unknown;
}

export type UploadDecision =
  | {
      ok: true;
      scope: UploadScope;
      config: UploadScopeConfig;
      fileName: string;
      contentType: string;
      /** Declared size, or null when an older client did not send it. */
      fileSize: number | null;
    }
  | { ok: false; status: 400 | 401 | 403 | 413 | 415; error: string };

/**
 * Strip any path component and control characters from a client file name so
 * it cannot escape the server-chosen prefix (`../`, `/`, `\`). Keeps Unicode
 * (Cyrillic / Romanian names are common) and caps the length.
 */
export function sanitizeUploadFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const safe = cleaned === "." || cleaned === ".." ? "" : cleaned;
  if (safe.length <= 200) return safe || "file";
  const dot = safe.lastIndexOf(".");
  const ext = dot > 0 && safe.length - dot <= 12 ? safe.slice(dot) : "";
  return safe.slice(0, 200 - ext.length) + ext;
}

export function decideUploadRequest(input: UploadRequestInput, caller: UploadCaller): UploadDecision {
  const { fileName, contentType, fileSize, scope: scopeInput } = input;

  if (typeof fileName !== "string" || fileName.length === 0) {
    return { ok: false, status: 400, error: "fileName is required" };
  }

  // Only an omitted scope means an order file. An unrecognised one is a
  // caller bug: falling back to `order` would put long-lived catalog images
  // under the `uploads/` prefix, which the R2 lifecycle rule deletes after 7 days.
  if (scopeInput !== undefined && !isUploadScope(scopeInput)) {
    return { ok: false, status: 400, error: "Unknown upload scope" };
  }
  const scope: UploadScope = scopeInput ?? "order";
  const config = UPLOAD_SCOPES[scope];

  if (config.auth === "staff" && !caller.isStaff) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  let size: number | null = null;
  if (fileSize !== undefined && fileSize !== null) {
    if (typeof fileSize !== "number" || !Number.isSafeInteger(fileSize) || fileSize < 0) {
      return { ok: false, status: 400, error: "Invalid fileSize" };
    }
    if (fileSize > config.maxBytes) {
      return { ok: false, status: 413, error: "file_too_large" };
    }
    size = fileSize;
  }

  const resolvedContentType =
    typeof contentType === "string" && contentType.length > 0 && contentType.length <= 200
      ? contentType
      : "application/octet-stream";
  if (config.imagesOnly && !/^image\/[a-z0-9.+-]+$/i.test(resolvedContentType)) {
    return { ok: false, status: 415, error: "unsupported_content_type" };
  }
  if (config.corporateFilesOnly) {
    // Size is checked above; a missing declared size is refused for this scope.
    if (size === null) return { ok: false, status: 400, error: "Invalid fileSize" };
    if (!checkCorporateFile({ name: fileName, contentType: resolvedContentType }).ok) {
      return { ok: false, status: 415, error: "unsupported_file_type" };
    }
  }

  return {
    ok: true,
    scope,
    config,
    fileName: sanitizeUploadFileName(fileName),
    contentType: resolvedContentType,
    fileSize: size,
  };
}

/** Server-chosen object key: fixed scope prefix + timestamp + random id + name. */
export function buildUploadKey(prefix: string, fileName: string, now: number, id: string): string {
  return `${prefix}/${now}-${id}-${fileName}`;
}
