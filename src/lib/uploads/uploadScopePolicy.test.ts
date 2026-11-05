import { describe, expect, it } from "vitest";
import {
  CATALOG_IMAGE_MAX_BYTES,
  ORDER_FILE_MAX_BYTES,
  UPLOAD_SCOPES,
  buildUploadKey,
  decideUploadRequest,
  isScriptableContentType,
  isUploadScope,
  sanitizeUploadFileName,
  type UploadScope,
} from "./uploadScopePolicy";

const anon = { isStaff: false };
const staff = { isStaff: true };
const base = { fileName: "a.pdf", contentType: "application/pdf", fileSize: 1000, scope: undefined };

const catalogScopes: UploadScope[] = ["mugCatalog", "notebookCatalog", "penCatalog", "designAsset", "stockCatalog"];

describe("upload scope policy", () => {
  it("only the order scope is public; every catalog scope needs staff", () => {
    const publicScopes = (Object.keys(UPLOAD_SCOPES) as UploadScope[]).filter(
      (s) => UPLOAD_SCOPES[s].auth === "public",
    );
    expect(publicScopes).toEqual(["order"]);
    for (const s of catalogScopes) {
      expect(UPLOAD_SCOPES[s].auth).toBe("staff");
      expect(UPLOAD_SCOPES[s].bucket).toBe("catalog");
    }
    expect(UPLOAD_SCOPES.order).toMatchObject({ bucket: "uploads", prefix: "uploads" });
  });

  it("anonymous caller with no scope gets an order upload", () => {
    const d = decideUploadRequest(base, anon);
    expect(d.ok && d.scope).toBe("order");
    expect(d.ok && d.config.prefix).toBe("uploads");
  });

  it("explicit order scope is allowed anonymously", () => {
    expect(decideUploadRequest({ ...base, scope: "order" }, anon).ok).toBe(true);
  });

  it.each(catalogScopes)("anonymous %s is rejected with 401", (scope) => {
    const d = decideUploadRequest({ ...base, contentType: "image/png", scope }, anon);
    expect(d).toEqual({ ok: false, status: 401, error: "Unauthorized" });
  });

  it.each(catalogScopes)("staff %s image is allowed", (scope) => {
    const d = decideUploadRequest({ ...base, contentType: "image/jpeg", scope }, staff);
    expect(d.ok).toBe(true);
  });

  it("unknown or prototype scope names are rejected", () => {
    expect(decideUploadRequest({ ...base, scope: "admin" }, staff)).toMatchObject({ ok: false, status: 400 });
    expect(decideUploadRequest({ ...base, scope: "toString" }, staff)).toMatchObject({ ok: false, status: 400 });
    expect(decideUploadRequest({ ...base, scope: 1 }, staff)).toMatchObject({ ok: false, status: 400 });
    expect(isUploadScope("__proto__")).toBe(false);
  });

  it("requires a file name", () => {
    expect(decideUploadRequest({ ...base, fileName: "" }, anon)).toMatchObject({ ok: false, status: 400 });
    expect(decideUploadRequest({ ...base, fileName: 5 }, anon)).toMatchObject({ ok: false, status: 400 });
  });

  it("enforces the declared size per scope", () => {
    expect(decideUploadRequest({ ...base, fileSize: ORDER_FILE_MAX_BYTES }, anon).ok).toBe(true);
    expect(decideUploadRequest({ ...base, fileSize: ORDER_FILE_MAX_BYTES + 1 }, anon)).toMatchObject({
      ok: false,
      status: 413,
    });
    expect(
      decideUploadRequest(
        { ...base, contentType: "image/png", scope: "stockCatalog", fileSize: CATALOG_IMAGE_MAX_BYTES + 1 },
        staff,
      ),
    ).toMatchObject({ ok: false, status: 413 });
  });

  it("rejects malformed sizes but accepts a missing one (older clients)", () => {
    expect(decideUploadRequest({ ...base, fileSize: -1 }, anon)).toMatchObject({ status: 400 });
    expect(decideUploadRequest({ ...base, fileSize: 1.5 }, anon)).toMatchObject({ status: 400 });
    expect(decideUploadRequest({ ...base, fileSize: "10" }, anon)).toMatchObject({ status: 400 });
    const d = decideUploadRequest({ ...base, fileSize: undefined }, anon);
    expect(d.ok && d.fileSize).toBeNull();
  });

  it("catalog scopes only accept images; order files accept anything", () => {
    expect(
      decideUploadRequest({ ...base, contentType: "application/pdf", scope: "mugCatalog" }, staff),
    ).toMatchObject({ ok: false, status: 415 });
    expect(decideUploadRequest({ ...base, contentType: "", scope: "designAsset" }, staff)).toMatchObject({
      status: 415,
    });
    expect(decideUploadRequest({ ...base, contentType: "image/svg+xml", scope: "designAsset" }, staff).ok).toBe(true);
    const d = decideUploadRequest({ ...base, contentType: "" }, anon);
    expect(d.ok && d.contentType).toBe("application/octet-stream");
    expect(decideUploadRequest({ ...base, contentType: "image/vnd.adobe.photoshop" }, anon).ok).toBe(true);
  });
});

describe("dangerous declared types on public uploads", () => {
  const scriptable = [
    "text/html",
    "TEXT/HTML; charset=utf-8",
    " text/html ",
    "application/xhtml+xml",
    "image/svg+xml",
    "image/svg",
    "text/xml",
    "application/xml",
    "application/rss+xml",
    "text/xsl",
    "text/javascript",
    "application/javascript",
    "application/x-javascript",
    "application/ecmascript",
    "text/js",
    "text/html,image/png",
    "nonsense",
  ];
  it.each(scriptable)("coerces %j to octet-stream for anon and staff order uploads", (contentType) => {
    expect(isScriptableContentType(contentType)).toBe(true);
    for (const caller of [anon, staff]) {
      const d = decideUploadRequest({ ...base, fileName: "a.pdf", contentType }, caller);
      expect(d.ok && d.contentType).toBe("application/octet-stream");
    }
  });

  const walkIn = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/tiff",
    "image/webp",
    "image/heic",
    "image/vnd.adobe.photoshop",
    "application/postscript",
    "application/illustrator",
    "application/vnd.adobe.illustrator",
    "application/x-cdr",
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  it.each(walkIn)("keeps walk-in type %j unchanged", (contentType) => {
    expect(isScriptableContentType(contentType)).toBe(false);
    const d = decideUploadRequest({ ...base, contentType }, anon);
    expect(d.ok && d.contentType).toBe(contentType);
  });

  it("empty type still falls back to octet-stream; staff svg design assets keep their type", () => {
    const d = decideUploadRequest({ ...base, contentType: "" }, anon);
    expect(d.ok && d.contentType).toBe("application/octet-stream");
    const svg = decideUploadRequest({ ...base, contentType: "image/svg+xml", scope: "designAsset" }, staff);
    expect(svg.ok && svg.contentType).toBe("image/svg+xml");
  });
});

describe("upload keys", () => {
  it("strips paths so a client cannot choose the prefix", () => {
    expect(sanitizeUploadFileName("../../catalog/stock/x.png")).toBe("x.png");
    expect(sanitizeUploadFileName("C:\\Users\\a\\банер 3x1.tif")).toBe("банер 3x1.tif");
    expect(sanitizeUploadFileName("..")).toBe("file");
    expect(sanitizeUploadFileName("a\u0000b.pdf")).toBe("ab.pdf");
  });

  it("caps long names and keeps the extension", () => {
    const out = sanitizeUploadFileName(`${"a".repeat(300)}.pdf`);
    expect(out.length).toBe(200);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("builds the key from the server prefix", () => {
    const d = decideUploadRequest({ ...base, fileName: "../catalog/evil.png" }, anon);
    if (!d.ok) throw new Error("expected ok");
    expect(buildUploadKey(d.config.prefix, d.fileName, 123, "abcdefgh")).toBe("uploads/123-abcdefgh-evil.png");
  });
});
