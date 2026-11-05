import { describe, expect, it } from "vitest";
import {
  FILE_SANDBOX_CSP,
  applySafeFileHeaders,
  contentDispositionValue,
  safeInlineMime,
} from "./safeFileHeaders";

describe("safeInlineMime", () => {
  it("maps whitelisted extensions case-insensitively", () => {
    expect(safeInlineMime("a.PDF")).toBe("application/pdf");
    expect(safeInlineMime("photo.JPG")).toBe("image/jpeg");
    expect(safeInlineMime("scan.tiff")).toBe("image/tiff");
    expect(safeInlineMime("x.heic")).toBe("image/heic");
  });

  it("never whitelists scriptable formats, whatever the stored type says", () => {
    for (const name of ["a.svg", "a.html", "a.htm", "a.xml", "a.js", "a.xhtml"]) {
      expect(safeInlineMime(name, "text/html")).toBeNull();
    }
    expect(safeInlineMime("a.psd", "image/svg+xml")).toBeNull();
  });

  it("extension wins over a lying stored type", () => {
    expect(safeInlineMime("a.pdf", "text/html")).toBe("application/pdf");
  });

  it("extensionless names fall back to a whitelisted stored type only", () => {
    expect(safeInlineMime("layout", "image/png")).toBe("image/png");
    expect(safeInlineMime("layout", "text/html; charset=utf-8")).toBeNull();
  });

  it("supports caller extras", () => {
    expect(safeInlineMime("mug.glb", null, { glb: "model/gltf-binary" })).toBe("model/gltf-binary");
  });
});

describe("applySafeFileHeaders", () => {
  it("PDF inline: forced type + nosniff, no sandbox CSP (Chrome PDF viewer)", () => {
    const h = new Headers({ "Content-Security-Policy": "x" });
    expect(applySafeFileHeaders(h, { fileName: "a.pdf", disposition: "inline" })).toBe("application/pdf");
    expect(h.get("Content-Type")).toBe("application/pdf");
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("Content-Disposition")?.startsWith("inline;")).toBe(true);
    expect(h.get("Content-Security-Policy")).toBeNull();
  });

  it("image inline gets the sandbox CSP", () => {
    const h = new Headers();
    applySafeFileHeaders(h, { fileName: "a.png", disposition: "inline" });
    expect(h.get("Content-Type")).toBe("image/png");
    expect(h.get("Content-Security-Policy")).toBe(FILE_SANDBOX_CSP);
  });

  it("unknown / scriptable types become an octet-stream attachment", () => {
    for (const fileName of ["evil.html", "logo.svg", "art.psd", "pack.zip", "noext"]) {
      const h = new Headers();
      applySafeFileHeaders(h, { fileName, disposition: "inline", storedContentType: "text/html" });
      expect(h.get("Content-Type")).toBe("application/octet-stream");
      expect(h.get("Content-Disposition")?.startsWith("attachment;")).toBe(true);
      expect(h.get("X-Content-Type-Options")).toBe("nosniff");
      expect(h.get("Content-Security-Policy")).toBe(FILE_SANDBOX_CSP);
    }
  });

  it("omitDisposition still forces attachment for non-whitelisted types", () => {
    const h = new Headers();
    applySafeFileHeaders(h, { fileName: "a.png", disposition: "inline", omitDisposition: true });
    expect(h.get("Content-Disposition")).toBeNull();
    const h2 = new Headers();
    applySafeFileHeaders(h2, { fileName: "a.html", disposition: "inline", omitDisposition: true });
    expect(h2.get("Content-Disposition")?.startsWith("attachment;")).toBe(true);
  });
});

describe("contentDispositionValue", () => {
  it("keeps the ASCII fallback quote-safe and the UTF-8 name exact", () => {
    const v = contentDispositionValue("attachment", 'банер "x".pdf');
    expect(v).toBe(`attachment; filename="_____ _x_.pdf"; filename*=UTF-8''${encodeURIComponent('банер "x".pdf')}`);
  });
});
