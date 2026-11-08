import { describe, expect, it } from "vitest";
import { libraryRu } from "@/lib/i18n/library/ru";
import { reuseFromRepeatFile } from "./wizardReuse";

describe("reuseFromRepeatFile", () => {
  it("gives library rows their title and size / dpi", () => {
    const r = reuseFromRepeatFile(
      {
        fileName: "logo-final.pdf",
        fileUrl: "library/common/abc123-logo-final.pdf",
        source: "library",
        libraryFileId: "L1",
        library: {
          title: "Логотип Vip-Ramka",
          sizeBytes: 1024 * 1024 * 3,
          pixelWidth: null,
          pixelHeight: null,
          dpi: 300,
          widthMm: 90,
          heightMm: 50,
          pageCount: 1,
        },
      },
      libraryRu.meta,
    );
    expect(r).toMatchObject({ source: "library", libraryFileId: "L1", title: "Логотип Vip-Ramka" });
    expect(r.metaText).toBe("3 МБ · 300 dpi · 9×5 см");
  });

  it("leaves stored files and links without library facts", () => {
    const r = reuseFromRepeatFile({ fileName: "a.png", fileUrl: "uploads/x/a.png", source: "storage", libraryFileId: null });
    expect(r.title).toBeUndefined();
    expect(r.metaText).toBeUndefined();
  });
});
