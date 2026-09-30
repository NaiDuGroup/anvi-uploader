import { describe, expect, it } from "vitest";
import {
  buildNotebookBatchFileName,
  isoDateStampLocal,
  notebookBatchSlotSlug,
  parseNotebookColorFromFileName,
} from "./parseNotebookColorFromFileName";

describe("parseNotebookColorFromFileName", () => {
  describe("Romanian colours (primary)", () => {
    it.each([
      ["8228-negru.png", "negru", 8228],
      ["8229 rosu.png", "rosu", 8229],
      ["8230_albastru.png", "albastru", 8230],
      ["8231-verde.png", "verde", 8231],
      ["caiet_galben_A5.jpg", "galben", null],
      ["notebook-portocaliu-final.png", "portocaliu", null],
      ["order-1234-bordo.pdf", "bordo", 1234],
      ["gri.png", "gri", null],
      ["roz.png", "roz", null],
      ["maro.png", "maro", null],
      ["alb.png", "alb", null],
      ["violet.png", "violet", null],
      ["mov.png", "violet", null],
    ])("recognises %s → %s (order %s)", (fileName, slug, orderNumber) => {
      const parsed = parseNotebookColorFromFileName(fileName);
      expect(parsed.color.slug).toBe(slug);
      expect(parsed.orderNumber).toBe(orderNumber);
    });

    it("strips Romanian diacritics (roșu → rosu)", () => {
      expect(parseNotebookColorFromFileName("Roșu-8228.png").color.slug).toBe("rosu");
      expect(parseNotebookColorFromFileName("rosu-8228.png").color.slug).toBe("rosu");
      expect(parseNotebookColorFromFileName("ROȘU-8228.png").color.slug).toBe("rosu");
    });

    it("prefers albastru over alb when both could match", () => {
      // `albastru` starts with `alb`; the parser must not stop at `alb`.
      expect(parseNotebookColorFromFileName("albastru.png").color.slug).toBe("albastru");
      expect(parseNotebookColorFromFileName("8228-albastru.png").color.slug).toBe("albastru");
    });

    it("picks the first color when several appear in the filename", () => {
      expect(parseNotebookColorFromFileName("rosu-not-albastru.png").color.slug).toBe("rosu");
      expect(parseNotebookColorFromFileName("verde-then-negru.png").color.slug).toBe("verde");
    });
  });

  describe("Russian and English synonyms", () => {
    it.each([
      ["8228-black.png", "negru"],
      ["8229-red.png", "rosu"],
      ["8230-blue.png", "albastru"],
      ["8231-green.png", "verde"],
      ["8232-white.png", "alb"],
      ["8233-yellow.png", "galben"],
    ])("EN: %s → %s", (fileName, slug) => {
      expect(parseNotebookColorFromFileName(fileName).color.slug).toBe(slug);
    });

    it.each([
      // Cyrillic isn't recognised directly; admins transliterate. Cover the
      // common transliterations only.
      ["8228-chernyj.png", "negru"],
      ["8229-krasnyj.png", "rosu"],
      ["8230-sinii.png", "albastru"],
      ["8231-zelenyi.png", "verde"],
      ["8232-belyj.png", "alb"],
    ])("RU-translit: %s → %s", (fileName, slug) => {
      expect(parseNotebookColorFromFileName(fileName).color.slug).toBe(slug);
    });
  });

  describe("order number extraction", () => {
    it("takes the first 3–6 digit run", () => {
      expect(parseNotebookColorFromFileName("8228-negru.png").orderNumber).toBe(8228);
      expect(parseNotebookColorFromFileName("order_00742_rosu.png").orderNumber).toBe(742);
      expect(parseNotebookColorFromFileName("notebook-negru.png").orderNumber).toBeNull();
    });

    it("ignores 7+ digit runs (timestamps)", () => {
      // 13-digit epoch timestamp is not an order number.
      expect(
        parseNotebookColorFromFileName("notebook-layout-1727712345678.png").orderNumber,
      ).toBeNull();
    });

    it("recognises the earliest 3–6 digit run when both are present", () => {
      expect(
        parseNotebookColorFromFileName("8228-negru-v2-1727712345678.png").orderNumber,
      ).toBe(8228);
    });
  });

  describe("unknown / no colour", () => {
    it("returns unknown when nothing matches", () => {
      const parsed = parseNotebookColorFromFileName("notebook-layout-1727712345678.png");
      expect(parsed.color.slug).toBe("unknown");
    });

    it("returns unknown for empty base names", () => {
      expect(parseNotebookColorFromFileName(".png").color.slug).toBe("unknown");
      expect(parseNotebookColorFromFileName("").color.slug).toBe("unknown");
    });

    it("does not match partial words (albas ≠ alb)", () => {
      expect(parseNotebookColorFromFileName("albas.png").color.slug).toBe("unknown");
    });
  });
});

describe("notebookBatchSlotSlug", () => {
  it("combines order number and colour when both are known", () => {
    const parsed = parseNotebookColorFromFileName("8228-negru.png");
    expect(notebookBatchSlotSlug(parsed, 1)).toBe("8228-negru");
  });

  it("uses colour only when no order number is detected", () => {
    const parsed = parseNotebookColorFromFileName("negru.png");
    expect(notebookBatchSlotSlug(parsed, 1)).toBe("negru");
  });

  it("falls back to unknown-N when nothing was parsed", () => {
    const parsed = parseNotebookColorFromFileName("random-file.png");
    expect(notebookBatchSlotSlug(parsed, 3)).toBe("unknown-3");
  });

  it("still uses the order number even when colour is unknown", () => {
    const parsed = parseNotebookColorFromFileName("8228.png");
    expect(notebookBatchSlotSlug(parsed, 1)).toBe("8228-unknown-1");
  });
});

describe("buildNotebookBatchFileName", () => {
  it("joins slots left-to-right with the drop order preserved", () => {
    const parsed = [
      parseNotebookColorFromFileName("8228-negru.png"),
      parseNotebookColorFromFileName("8229-rosu.png"),
      parseNotebookColorFromFileName("8230-albastru.png"),
      parseNotebookColorFromFileName("8231-verde.png"),
    ];
    const fileName = buildNotebookBatchFileName(parsed, new Date(2026, 8, 30));
    expect(fileName).toBe(
      "notebook-batch_8228-negru_8229-rosu_8230-albastru_8231-verde_20260930.png",
    );
  });

  it("works with 2 files", () => {
    const parsed = [
      parseNotebookColorFromFileName("8228-negru.png"),
      parseNotebookColorFromFileName("8229-rosu.png"),
    ];
    const fileName = buildNotebookBatchFileName(parsed, new Date(2026, 8, 30));
    expect(fileName).toBe("notebook-batch_8228-negru_8229-rosu_20260930.png");
  });

  it("uses unknown-N placeholders when colours are missing", () => {
    const parsed = [
      parseNotebookColorFromFileName("random-1.png"),
      parseNotebookColorFromFileName("random-2.png"),
    ];
    const fileName = buildNotebookBatchFileName(parsed, new Date(2026, 8, 30));
    expect(fileName).toBe("notebook-batch_unknown-1_unknown-2_20260930.png");
  });
});

describe("isoDateStampLocal", () => {
  it("pads month and day to 2 digits", () => {
    expect(isoDateStampLocal(new Date(2026, 0, 5))).toBe("20260105");
    expect(isoDateStampLocal(new Date(2026, 11, 31))).toBe("20261231");
  });
});
