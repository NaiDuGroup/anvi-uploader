/**
 * «Pentru companii» attachments (logo / brief): which files are accepted.
 * One list for the form's `accept`, the upload-URL signing (`corporate`
 * scope) and the final submit check. Pure (client-safe, unit-tested).
 */

const MB = 1024 * 1024;

/** One logo / brief file. Vector logos and briefs are small; 100 MB covers a heavy PSD or a ZIP of them. */
export const CORPORATE_FILE_MAX_BYTES = 100 * MB;

/** Extension (lower case, no dot) → declared MIME types accepted for it (besides an empty / generic one). */
const CORPORATE_FILE_TYPES: Record<string, readonly string[]> = {
  pdf: ["application/pdf", "application/x-pdf"],
  ai: ["application/postscript", "application/illustrator", "application/pdf", "application/vnd.adobe.illustrator"],
  eps: ["application/postscript", "application/eps", "application/x-eps", "image/eps", "image/x-eps"],
  svg: ["image/svg+xml"],
  cdr: [
    "application/cdr",
    "application/x-cdr",
    "application/coreldraw",
    "application/x-coreldraw",
    "application/vnd.corel-draw",
    "image/x-cdr",
  ],
  psd: ["image/vnd.adobe.photoshop", "application/x-photoshop", "application/photoshop", "application/psd", "image/psd", "image/x-photoshop"],
  png: ["image/png"],
  jpg: ["image/jpeg", "image/pjpeg"],
  jpeg: ["image/jpeg", "image/pjpeg"],
  webp: ["image/webp"],
  tif: ["image/tiff", "image/x-tiff"],
  tiff: ["image/tiff", "image/x-tiff"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  txt: ["text/plain"],
  zip: ["application/zip", "application/x-zip-compressed", "application/x-zip", "multipart/x-zip"],
};

/** Accepted extensions (lower case, no dot). */
export const CORPORATE_FILE_EXTENSIONS: readonly string[] = Object.keys(CORPORATE_FILE_TYPES);

/** The file input's `accept`: the extensions only (MIME wildcards like `image/*` would let other image types through). */
export const CORPORATE_FILE_ACCEPT = CORPORATE_FILE_EXTENSIONS.map((e) => `.${e}`).join(",");

/** Browsers send these when they do not know the type (common for .ai / .cdr / .eps). */
const GENERIC_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream", "application/unknown"]);

/** Lower-case extension of a file name, "" when there is none. */
export function fileExtension(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export type CorporateFileCheck = { ok: true } | { ok: false; reason: "file_type" | "file_too_large" };

/**
 * Is this attachment allowed? The extension must be on the list AND the
 * declared content type must match it (or be the browsers' generic «unknown»),
 * so `logo.png` sent as `application/x-msdownload` is refused as well.
 */
export function checkCorporateFile(file: { name: string; contentType?: string | null; size?: number | null }): CorporateFileCheck {
  const ext = fileExtension(file.name);
  const allowed = CORPORATE_FILE_TYPES[ext];
  if (!allowed) return { ok: false, reason: "file_type" };
  const type = (file.contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!GENERIC_TYPES.has(type) && !allowed.includes(type)) return { ok: false, reason: "file_type" };
  if (file.size != null && file.size > CORPORATE_FILE_MAX_BYTES) return { ok: false, reason: "file_too_large" };
  return { ok: true };
}
