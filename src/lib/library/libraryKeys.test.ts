import { describe, expect, it } from "vitest";
import {
  libraryStatusOf,
  libraryThumbKeys,
  thumbKindOf,
  LIBRARY_PREFIX,
  buildLibraryKey,
  defaultLibraryTitle,
  isDealerOrderFileUrl,
  isLibraryKey,
  isStaffOrderFileUrl,
  libraryKeysOf,
  libraryPhoneSearchDigits,
  normalizeLibraryTags,
  orderFileUrlIssues,
} from "./libraryKeys";

const CLIENT = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc";

describe("buildLibraryKey", () => {
  it("puts client items under library/<clientId>/ and common ones under library/common/", () => {
    expect(buildLibraryKey(CLIENT, "logo.pdf", "abcDEF1234")).toBe(`library/${CLIENT}/abcDEF1234-logo.pdf`);
    expect(buildLibraryKey(null, "logo.pdf", "abcDEF1234")).toBe("library/common/abcDEF1234-logo.pdf");
  });

  it("never lands under uploads/ (the 7-day lifecycle prefix)", () => {
    const key = buildLibraryKey(null, "x.png", "abcDEF1234");
    expect(key.startsWith(LIBRARY_PREFIX)).toBe(true);
    expect(key.startsWith("uploads/")).toBe(false);
  });

  it("strips path parts from the file name", () => {
    expect(buildLibraryKey(null, "../../etc/passwd", "abcDEF1234")).toBe("library/common/abcDEF1234-passwd");
    expect(buildLibraryKey(null, "a\\b\\Визитка.pdf", "abcDEF1234")).toBe("library/common/abcDEF1234-Визитка.pdf");
  });

  it("rejects a client id or key id that is not path-safe", () => {
    expect(() => buildLibraryKey("../x", "a.pdf", "abcDEF1234")).toThrow();
    expect(() => buildLibraryKey(null, "a.pdf", "a/b")).toThrow();
  });
});

describe("isLibraryKey", () => {
  it("matches library/ keys only", () => {
    expect(isLibraryKey("library/common/x-a.pdf")).toBe(true);
    expect(isLibraryKey("/library/common/x-a.pdf")).toBe(true);
    expect(isLibraryKey("uploads/1700000000000-abcdefgh-a.pdf")).toBe(false);
    expect(isLibraryKey("shop-orders/1700000000000-abcdefgh-a.pdf")).toBe(false);
    expect(isLibraryKey(null)).toBe(false);
  });
});

describe("isStaffOrderFileUrl", () => {
  it("accepts uploads, library, storefront copies and http(s) links", () => {
    expect(isStaffOrderFileUrl("uploads/1700000000000-abcdefgh-a.pdf")).toBe(true);
    expect(isStaffOrderFileUrl(`library/${CLIENT}/abcDEF1234-a.pdf`)).toBe(true);
    expect(isStaffOrderFileUrl("shop-orders/1700000000000-abcdefgh-a.pdf")).toBe(true);
    expect(isStaffOrderFileUrl("https://drive.google.com/file/d/x/view")).toBe(true);
  });

  it("rejects other prefixes, bare prefixes, traversal and junk", () => {
    expect(isStaffOrderFileUrl("catalog/mugs/a.png")).toBe(false);
    expect(isStaffOrderFileUrl("designs/1700000000000-abcdefgh-a.png")).toBe(false);
    expect(isStaffOrderFileUrl("uploads/")).toBe(false);
    expect(isStaffOrderFileUrl("uploads/../library/x")).toBe(false);
    expect(isStaffOrderFileUrl("uploads/..")).toBe(false);
    expect(isStaffOrderFileUrl("uploads/./x")).toBe(false);
    expect(isStaffOrderFileUrl("uploads/..\\x")).toBe(false);
    expect(isStaffOrderFileUrl("uploads/a\u0001.png")).toBe(false);
  });

  it("accepts file names with double dots (already uploaded keys)", () => {
    expect(isStaffOrderFileUrl("uploads/1700000000000-abcdefgh-a..png")).toBe(true);
    expect(isStaffOrderFileUrl("uploads/1700000000000-abcdefgh-DTF_spate_ A3_tricou_negru_L....png")).toBe(true);
    expect(isStaffOrderFileUrl("pending-upload")).toBe(false);
    expect(isStaffOrderFileUrl("javascript:alert(1)")).toBe(false);
    expect(isStaffOrderFileUrl("")).toBe(false);
  });
});

describe("isDealerOrderFileUrl", () => {
  it("accepts own uploads and links, refuses library and storefront keys", () => {
    expect(isDealerOrderFileUrl("uploads/1700000000000-abcdefgh-a.pdf")).toBe(true);
    expect(isDealerOrderFileUrl("https://example.com/a.pdf")).toBe(true);
    expect(isDealerOrderFileUrl(`library/${CLIENT}/abcDEF1234-a.pdf`)).toBe(false);
    expect(isDealerOrderFileUrl("library/common/abcDEF1234-a.pdf")).toBe(false);
    expect(isDealerOrderFileUrl("shop-orders/1700000000000-abcdefgh-a.pdf")).toBe(false);
    expect(isDealerOrderFileUrl("uploads/1700000000000-abcdefgh-a..png")).toBe(true);
    expect(isDealerOrderFileUrl("uploads/../library/x")).toBe(false);
  });

  it("allows the dry-run placeholder only in a dry run", () => {
    expect(isDealerOrderFileUrl("pending-upload", { dryRun: true })).toBe(true);
    expect(isDealerOrderFileUrl("pending-upload")).toBe(false);
  });
});

describe("orderFileUrlIssues", () => {
  it("reports new files with a bad fileUrl and ignores files kept by id", () => {
    const issues = orderFileUrlIssues(
      [
        { files: [{ fileName: "a", fileUrl: "uploads/1700000000000-abcdefgh-a" }, { fileId: "x" }] },
        { files: [{ fileName: "b", fileUrl: "library/common/abcDEF1234-b" }] },
      ],
      (u) => isDealerOrderFileUrl(u),
    );
    expect(issues).toEqual(["lines.1.files.0.fileUrl"]);
  });
});

describe("defaultLibraryTitle", () => {
  it("drops the extension", () => {
    expect(defaultLibraryTitle("Логотип Ромашка.pdf")).toBe("Логотип Ромашка");
    expect(defaultLibraryTitle("archive.tar.gz")).toBe("archive.tar");
    expect(defaultLibraryTitle(".hidden")).toBe(".hidden");
    expect(defaultLibraryTitle("noext")).toBe("noext");
  });
});

describe("normalizeLibraryTags", () => {
  it("trims, lower-cases, strips #, dedupes; accepts a comma list", () => {
    expect(normalizeLibraryTags(" Визитки, #ЛОГО ,визитки,, ")).toEqual(["визитки", "лого"]);
    expect(normalizeLibraryTags(["A", "a", "b"])).toEqual(["a", "b"]);
    expect(normalizeLibraryTags(null)).toEqual([]);
  });
});

describe("libraryKeysOf", () => {
  it("returns distinct library keys only", () => {
    expect(
      libraryKeysOf([
        "library/common/x-a.pdf",
        "uploads/1700000000000-abcdefgh-a.pdf",
        "library/common/x-a.pdf",
        "https://example.com/library/a",
      ]),
    ).toEqual(["library/common/x-a.pdf"]);
  });
});

describe("libraryPhoneSearchDigits", () => {
  it("adds the local part so 069… and +373 69… find the same client", () => {
    expect(libraryPhoneSearchDigits("069000101")).toEqual(["069000101", "69000101"]);
    expect(libraryPhoneSearchDigits("+373 69 000 101")).toEqual(["37369000101", "69000101"]);
    expect(libraryPhoneSearchDigits("69000101")).toEqual(["69000101"]);
  });
  it("ignores queries with fewer than 3 digits", () => {
    expect(libraryPhoneSearchDigits("логотип A4")).toEqual([]);
    expect(libraryPhoneSearchDigits("0")).toEqual([]);
  });
});

describe("library thumbnails", () => {
  it("keeps thumbs under library/thumbs by item id", () => {
    const id = "4C6C8A30-658B-48EA-A550-E09FD6009C0B";
    expect(libraryThumbKeys(id)).toEqual({
      thumb: "library/thumbs/4c6c8a30-658b-48ea-a550-e09fd6009c0b.webp",
      none: "library/thumbs/4c6c8a30-658b-48ea-a550-e09fd6009c0b.none",
    });
    expect(isLibraryKey(libraryThumbKeys(id).thumb)).toBe(true);
    expect(() => libraryThumbKeys("../x")).toThrow();
  });

  it("previews PDFs and rasters (TIF included), not PSD / AI / archives", () => {
    expect(thumbKindOf("Макет.PDF")).toBe("pdf");
    expect(thumbKindOf("banner.tiff")).toBe("raster");
    expect(thumbKindOf("logo.png")).toBe("raster");
    expect(thumbKindOf("logo.psd")).toBeNull();
    expect(thumbKindOf("files.zip")).toBeNull();
    expect(thumbKindOf("noext")).toBeNull();
  });
});

describe("libraryStatusOf", () => {
  const files = [
    { id: "f1", fileUrl: "uploads/a.pdf" },
    { id: "f2", fileUrl: "uploads/b.pdf" },
    { id: "f3", fileUrl: "library/common/x-c.pdf" },
    { id: "f4", fileUrl: "uploads/d.pdf" },
  ];
  it("reports active copies, archived-only copies, and nothing for the rest", () => {
    const res = libraryStatusOf(files, [
      { id: "L1", sourceFileId: "f1", storageKey: "library/common/1-a.pdf", archivedAt: new Date() },
      { id: "L2", sourceFileId: "f1", storageKey: "library/common/2-a.pdf", archivedAt: null },
      { id: "L3", sourceFileId: "f2", storageKey: "library/common/3-b.pdf", archivedAt: "2026-11-01T00:00:00Z" },
      { id: "L4", sourceFileId: null, storageKey: "library/common/x-c.pdf", archivedAt: null },
    ]);
    expect(res.inLibrary).toEqual({ f1: "L2", f3: "L4" });
    expect(res.archived).toEqual({ f2: "L3" });
  });
});
