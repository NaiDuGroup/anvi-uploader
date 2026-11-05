import { describe, expect, it } from "vitest";
import { CORPORATE_FILE_ACCEPT, CORPORATE_FILE_MAX_BYTES, checkCorporateFile, fileExtension } from "./fileTypes";

describe("corporate attachment types", () => {
  it("accept list matches the hint (PDF, AI, EPS, SVG, PNG, JPG, DOC…) and has no executables", () => {
    for (const e of [".pdf", ".ai", ".eps", ".svg", ".cdr", ".psd", ".png", ".jpg", ".doc", ".docx", ".xlsx", ".zip"]) {
      expect(CORPORATE_FILE_ACCEPT.split(",")).toContain(e);
    }
    expect(CORPORATE_FILE_ACCEPT).not.toMatch(/exe|\*/);
  });

  it("extension", () => {
    expect(fileExtension("Logo.PNG")).toBe("png");
    expect(fileExtension("a/b.c/noext")).toBe("");
    expect(fileExtension(".bashrc")).toBe("");
    expect(fileExtension("x.tar.exe")).toBe("exe");
  });

  it("allows listed types with a matching or generic content type", () => {
    expect(checkCorporateFile({ name: "logo.png", contentType: "image/png" }).ok).toBe(true);
    expect(checkCorporateFile({ name: "logo.cdr", contentType: "" }).ok).toBe(true);
    expect(checkCorporateFile({ name: "logo.eps", contentType: "application/postscript" }).ok).toBe(true);
    expect(checkCorporateFile({ name: "brief.pdf", contentType: "application/pdf; charset=binary" }).ok).toBe(true);
    expect(checkCorporateFile({ name: "brief.pdf" }).ok).toBe(true);
  });

  it("refuses executables, scripts, unlisted types and mismatched content types", () => {
    for (const f of [
      { name: "qa-bad.exe", contentType: "application/x-msdownload" },
      { name: "qa-bad.exe", contentType: "" },
      { name: "run.bat" },
      { name: "page.html", contentType: "text/html" },
      { name: "logo.png", contentType: "application/x-msdownload" },
      { name: "logo.svg", contentType: "text/html" },
      { name: "logo.gif", contentType: "image/gif" },
    ]) {
      expect(checkCorporateFile(f), f.name).toEqual({ ok: false, reason: "file_type" });
    }
  });

  it("refuses files over the size limit", () => {
    expect(checkCorporateFile({ name: "a.zip", size: CORPORATE_FILE_MAX_BYTES + 1 })).toEqual({ ok: false, reason: "file_too_large" });
    expect(checkCorporateFile({ name: "a.zip", size: CORPORATE_FILE_MAX_BYTES }).ok).toBe(true);
  });
});
