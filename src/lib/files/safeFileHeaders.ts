/**
 * Response headers for routes that stream user-uploaded files back from our
 * own origin (`/api/preview`, `/api/download`, `/api/public/file`, …).
 *
 * The stored object Content-Type comes from the uploader (a guest can declare
 * `text/html` for `a.pdf`), so it is never trusted: the type is derived from
 * the file extension through a small whitelist of formats browsers render
 * without running scripts. Everything else is served as an
 * `application/octet-stream` attachment. `nosniff` stops the browser from
 * guessing HTML out of the body, and a sandbox CSP blocks scripts even if a
 * whitelisted type is somehow rendered as a document.
 */

/** Extension → MIME for formats that are safe to render inline. No SVG / HTML / XML / JS. */
export const SAFE_INLINE_MIME: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  avif: "image/avif",
};

const SAFE_MIME_VALUES = new Set(Object.values(SAFE_INLINE_MIME));

/** Sandbox CSP for non-PDF responses: no scripts, no plugins, no fetches. */
export const FILE_SANDBOX_CSP =
  "sandbox; default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'";

function extOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/**
 * Whitelisted inline MIME for a file name, or null. When the name has no
 * known extension, a stored type is accepted only if it is itself one of the
 * whitelisted values (e.g. an extensionless generated `image/png`).
 */
export function safeInlineMime(
  fileName: string,
  storedContentType?: string | null,
  extra?: Readonly<Record<string, string>>,
): string | null {
  const ext = extOf(fileName);
  const byExt = SAFE_INLINE_MIME[ext] ?? extra?.[ext];
  if (byExt) return byExt;
  const stored = storedContentType?.split(";")[0]?.trim().toLowerCase();
  if (stored && SAFE_MIME_VALUES.has(stored)) return stored;
  return null;
}

/** RFC 6266 filename parameters: ASCII fallback (quotes/controls stripped) + UTF-8 form. */
export function contentDispositionValue(kind: "inline" | "attachment", fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_") || "file";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Set Content-Type, Content-Disposition, nosniff and CSP on `headers`.
 * `disposition: "inline"` is honoured only for whitelisted types; anything
 * else becomes an octet-stream attachment. Returns the chosen MIME.
 */
export function applySafeFileHeaders(
  headers: Headers,
  opts: {
    fileName: string;
    disposition: "inline" | "attachment";
    storedContentType?: string | null;
    extraMime?: Readonly<Record<string, string>>;
    /** Skip Content-Disposition (callers that never set one, e.g. `<img>` sources). */
    omitDisposition?: boolean;
  },
): string {
  const safe = safeInlineMime(opts.fileName, opts.storedContentType, opts.extraMime);
  const mime = safe ?? "application/octet-stream";
  const kind = safe && opts.disposition === "inline" ? "inline" : "attachment";
  headers.set("Content-Type", mime);
  if (!opts.omitDisposition || kind === "attachment") {
    headers.set("Content-Disposition", contentDispositionValue(kind, opts.fileName));
  }
  headers.set("X-Content-Type-Options", "nosniff");
  // Chrome's built-in PDF viewer does not render inside a CSP-sandboxed
  // document, so PDFs get no sandbox: the forced application/pdf type plus
  // nosniff already rule out HTML rendering.
  if (mime === "application/pdf") headers.delete("Content-Security-Policy");
  else headers.set("Content-Security-Policy", FILE_SANDBOX_CSP);
  return mime;
}
