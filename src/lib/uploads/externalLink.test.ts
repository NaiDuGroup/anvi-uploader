import { describe, expect, it } from "vitest";
import { normalizeExternalLink } from "./externalLink";

describe("normalizeExternalLink", () => {
  it("keeps full http(s) links as typed", () => {
    expect(normalizeExternalLink("https://drive.google.com/file/d/abc/view?usp=sharing")).toBe(
      "https://drive.google.com/file/d/abc/view?usp=sharing",
    );
    expect(normalizeExternalLink("  http://wetransfer.com/downloads/x  ")).toBe("http://wetransfer.com/downloads/x");
    expect(normalizeExternalLink("HTTPS://Dropbox.com/s/1")).toBe("HTTPS://Dropbox.com/s/1");
  });

  it("adds https:// to a bare domain", () => {
    expect(normalizeExternalLink("drive.google.com/file/d/abc")).toBe("https://drive.google.com/file/d/abc");
    expect(normalizeExternalLink("www.example.md")).toBe("https://www.example.md");
    expect(normalizeExternalLink("disk.yandex.ru/d/xyz")).toBe("https://disk.yandex.ru/d/xyz");
  });

  it("refuses text that is not a link", () => {
    for (const s of ["", "   ", "abc", "abc def", "hello.", "файл", "ftp://x.com/a", "javascript:alert(1)", "mailto:a@b.md", "http://", "https://abc", "https://user:pw@x.com"]) {
      expect(normalizeExternalLink(s), s).toBeNull();
    }
  });
});
