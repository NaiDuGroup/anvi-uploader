/**
 * «Библиотека макетов» storage keys and the order-file key rules around them.
 * Pure (no DB, no storage) — client-safe and unit-tested.
 *
 * Order uploads live under `uploads/…`, which an R2 lifecycle rule deletes
 * after 7 days (`ORDER_FILE_LIFECYCLE_DAYS`). Saving a file to the library
 * copies it server-side to `library/<clientId|common>/<id>-<name>` in the same
 * bucket: no lifecycle rule covers that prefix, so the copy stays until staff
 * delete it. Nothing in the code deletes `library/` keys except the library's
 * own hard delete (only when no order file uses the key).
 */
import { sanitizeUploadFileName } from "@/lib/uploads/uploadScopePolicy";

export const LIBRARY_PREFIX = "library/";
/** Folder of the studio-wide («Общий») items. */
export const LIBRARY_COMMON_FOLDER = "common";

export const LIBRARY_TITLE_MAX = 200;
export const LIBRARY_TAG_MAX = 40;
export const LIBRARY_TAGS_MAX = 20;

function normaliseKey(key: string): string {
  return key.replace(/^\/+/, "");
}

export function isLibraryKey(key: string | null | undefined): boolean {
  return typeof key === "string" && normaliseKey(key).startsWith(LIBRARY_PREFIX);
}

/** An order upload (`uploads/…`): the only source a library copy is made from besides storefront copies. */
export function isUploadsKey(key: string | null | undefined): boolean {
  return typeof key === "string" && normaliseKey(key).startsWith("uploads/");
}

/**
 * Storage key of a new library copy. The client id is a uuid (checked by the
 * caller); anything else would be unsafe in a path, so it falls back to the
 * common folder only when null.
 */
export function buildLibraryKey(clientId: string | null, fileName: string, id: string): string {
  if (clientId !== null && !/^[0-9a-f-]{36}$/i.test(clientId)) {
    throw new Error("Invalid client id for a library key");
  }
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) throw new Error("Invalid library key id");
  const folder = clientId ?? LIBRARY_COMMON_FOLDER;
  return `${LIBRARY_PREFIX}${folder}/${id}-${sanitizeUploadFileName(fileName)}`;
}

/** Default title: the file name without its extension. */
export function defaultLibraryTitle(fileName: string): string {
  const name = fileName.trim();
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return (base.trim() || name || "Макет").slice(0, LIBRARY_TITLE_MAX);
}

/** Tags: trimmed, lower-cased, no `#`, unique, capped (input as array or a comma list). */
export function normalizeLibraryTags(input: readonly string[] | string | null | undefined): string[] {
  const raw = typeof input === "string" ? input.split(/[,;\n]/) : (input ?? []);
  const out: string[] = [];
  for (const t of raw) {
    const tag = String(t).trim().replace(/^#+/, "").trim().toLowerCase().slice(0, LIBRARY_TAG_MAX);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= LIBRARY_TAGS_MAX) break;
  }
  return out;
}

const HTTP_LINK_RE = /^https?:\/\//i;

/**
 * Storage prefixes a staff-created order file may point at:
 * - `uploads/`     — fresh uploads (admin wizard, Design Studio renders re-uploaded as order files);
 * - `library/`     — «Из библиотеки» (reused, not copied);
 * - `shop-orders/` — «Повторить заказ» of a storefront order whose copy still exists;
 * - an absolute http(s) link («Вставьте ссылку»).
 */
export const STAFF_ORDER_FILE_PREFIXES = ["uploads/", LIBRARY_PREFIX, "shop-orders/"] as const;

function hasSafePath(key: string): boolean {
  return !key.includes("..") && !key.includes("\\") && !/[\u0000-\u001f\u007f]/.test(key);
}

export function isStaffOrderFileUrl(value: string): boolean {
  if (HTTP_LINK_RE.test(value)) return true;
  return hasSafePath(value) && STAFF_ORDER_FILE_PREFIXES.some((p) => value.startsWith(p) && value.length > p.length);
}

/**
 * Dealer cabinet order files: own uploads and links only. Library and
 * storefront keys belong to the studio / other customers, so they are refused
 * (a dealer could otherwise reference and then download someone else's file).
 * `pending-upload` is the dry-run price preview placeholder (nothing is saved).
 */
export function isDealerOrderFileUrl(value: string, opts: { dryRun?: boolean } = {}): boolean {
  if (opts.dryRun && value === "pending-upload") return true;
  if (HTTP_LINK_RE.test(value)) return true;
  return hasSafePath(value) && value.startsWith("uploads/") && value.length > "uploads/".length;
}

/** Field paths (`lines.0.files.1.fileUrl`) of new files whose `fileUrl` fails `accept`. */
export function orderFileUrlIssues(
  lines: ReadonlyArray<{ files?: ReadonlyArray<unknown> }>,
  accept: (fileUrl: string) => boolean,
): string[] {
  const issues: string[] = [];
  lines.forEach((line, li) => {
    (line.files ?? []).forEach((f, fi) => {
      if (!f || typeof f !== "object" || !("fileUrl" in f)) return; // existing file kept by id
      const url = (f as { fileUrl: unknown }).fileUrl;
      if (typeof url !== "string" || !accept(url)) issues.push(`lines.${li}.files.${fi}.fileUrl`);
    });
  });
  return issues;
}

/** Distinct library keys among order files (for the use counter). */
export function libraryKeysOf(fileUrls: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const u of fileUrls) if (isLibraryKey(u)) out.add(normaliseKey(u));
  return [...out];
}

/**
 * Digit variants of a search query for matching client phones, which are
 * stored inconsistently (`+37369…`, `069…`, `69…`): the plain digits and the
 * local part without a leading `373` / `0`. Empty when fewer than 3 digits.
 */
export function libraryPhoneSearchDigits(query: string): string[] {
  const digits = query.replace(/\D/g, "");
  if (digits.length < 3) return [];
  const local = digits.replace(/^(?:373|0)+/, "");
  return local.length >= 3 && local !== digits ? [digits, local] : [digits];
}

/** Folder of cached preview thumbnails (`library/thumbs/<id>.webp`); never a client id or «common». */
export const LIBRARY_THUMBS_FOLDER = "thumbs";

/** Cached thumbnail of a library item, and the marker left when its file cannot be previewed. */
export function libraryThumbKeys(libraryId: string): { thumb: string; none: string } {
  if (!/^[0-9a-f-]{36}$/i.test(libraryId)) throw new Error("Invalid library id");
  const base = `${LIBRARY_PREFIX}${LIBRARY_THUMBS_FOLDER}/${libraryId.toLowerCase()}`;
  return { thumb: `${base}.webp`, none: `${base}.none` };
}

const RASTER_THUMB_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "tif", "tiff", "bmp"]);

/** How a file gets a thumbnail: first PDF page, a scaled raster, or none (PSD, AI, ZIP, …). */
export function thumbKindOf(fileName: string): "pdf" | "raster" | null {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  if (ext === "pdf") return "pdf";
  return RASTER_THUMB_EXTS.has(ext) ? "raster" : null;
}

/**
 * Library state of order files from the matching library rows (saved from the
 * file, or the file's own key): the active copy wins over archived ones.
 */
export function libraryStatusOf(
  files: ReadonlyArray<{ id: string; fileUrl: string }>,
  rows: ReadonlyArray<{ id: string; sourceFileId: string | null; storageKey: string; archivedAt: Date | string | null }>,
): { inLibrary: Record<string, string>; archived: Record<string, string> } {
  const inLibrary: Record<string, string> = {};
  const archived: Record<string, string> = {};
  for (const f of files) {
    const hits = rows.filter((r) => r.storageKey === f.fileUrl || r.sourceFileId === f.id);
    const active = hits.find((r) => !r.archivedAt);
    if (active) inLibrary[f.id] = active.id;
    else if (hits.length) archived[f.id] = hits[hits.length - 1]!.id;
  }
  return { inLibrary, archived };
}
