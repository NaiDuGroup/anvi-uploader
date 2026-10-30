import { describe, expect, it } from "vitest";
import {
  gorFactoryGalleryUrls,
  gorFactoryModelCode,
  metaDescription,
  usableDescription,
  type GorFactoryCatalog,
} from "./gorFactoryMedia";

const H = "https://static.gorfactory.es";

const catalog: GorFactoryCatalog = {
  MODELS: {
    TZ1615: {
      COLORS: {
        "02": { IMG: "/images/models/1615/model/large/1615_02_2_1.jpg" },
        "03": { IMG: "/images/models/1615/model/large/1615_03_2_1.jpg" },
      },
      PRODUCTS: { TZ1615S102: { COLOR: "02" } },
      MEDIA: {
        ADULT: { "03": { "1": { "1": { IMG: "/a/1615_03_1_1.jpg" } } } },
        DETAIL: {
          "03": { "3": { "2": { IMG: "/a/1615_03_3_2.jpg" }, "1": { IMG: "/a/1615_03_3_1.jpg" } } },
        },
        PRINT: { "02": { "17": { "0": { IMG: "/p/p_1615_02_17_0.jpg" } } } },
      },
    },
    CA6502: {
      COLORS: { "01": { IMG: "/m/6502_01_2_1.jpg" }, "229": { IMG: "/m/6502_229_2_1.jpg" } },
      PRODUCTS: { CA65020201: { COLOR: "01" } },
      MEDIA: {
        VIEWS: {
          "01": {
            "1": { "1": { IMG: "/v/p_6502_01_1_1.jpg" } },
            "3": { "1": { IMG: "/v/p_6502_01_1_1.jpg", FALLBACK: true } },
            "2": { "1": { IMG: "/v/p_6502_01_2_1.jpg" } },
          },
        },
        ADULT: {
          "229": { "1": { "1": { IMG: "/m/6502_229_1_1.jpg" } } },
          "01": { "1": { "1": { IMG: "/m/6502_01_1_1.jpg" } } },
        },
      },
    },
  },
};

describe("gorFactoryGalleryUrls", () => {
  it("puts the item's colour first, then the model shots, without print diagrams", () => {
    expect(gorFactoryGalleryUrls(catalog, "TZ1615S102")).toEqual([
      `${H}/images/models/1615/model/large/1615_02_2_1.jpg`,
      `${H}/a/1615_03_1_1.jpg`,
      `${H}/a/1615_03_3_1.jpg`,
      `${H}/a/1615_03_3_2.jpg`,
    ]);
  });

  it("adds the colour's views (no fallback copies) and own-colour worn shots first", () => {
    expect(gorFactoryGalleryUrls(catalog, "CA65020201")).toEqual([
      `${H}/m/6502_01_2_1.jpg`,
      `${H}/v/p_6502_01_1_1.jpg`,
      `${H}/v/p_6502_01_2_1.jpg`,
      `${H}/m/6502_01_1_1.jpg`,
      `${H}/m/6502_229_1_1.jpg`,
    ]);
  });

  it("is empty for unknown models", () => {
    expect(gorFactoryGalleryUrls(catalog, "ZZ9999S101")).toEqual([]);
    expect(gorFactoryGalleryUrls(catalog, "S1-KB-320")).toEqual([]);
  });
});

describe("descriptions", () => {
  it("reads the model code", () => {
    expect(gorFactoryModelCode("tz1615s102")).toBe("TZ1615");
    expect(gorFactoryModelCode("CA65020201")).toBe("CA6502");
    expect(gorFactoryModelCode("S1-KB-320")).toBeNull();
  });

  it("decodes the meta description", () => {
    const html = '<meta data-hid="description" name="description" content="Cană &amp; cutie &#8211; 350&nbsp;ml ">';
    expect(metaDescription(html)).toBe("Cană & cutie – 350 ml");
  });

  it("drops the shop placeholders", () => {
    expect(usableDescription("MODELS.ZZ9999.DESCRIPTION")).toBe("");
    expect(usableDescription("undefined")).toBe("");
    expect(usableDescription("Discover all the products for the best promotion")).toBe("");
    expect(usableDescription("Керамическая кружка")).toBe("Керамическая кружка");
  });
});
