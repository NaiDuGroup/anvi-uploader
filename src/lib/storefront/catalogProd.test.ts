import { describe, expect, it } from "vitest";
import {
  mapShopCatalog,
  SHOP_CATEGORIES,
  SHOP_POPULAR_SLUGS,
  SHOP_PRODUCTS,
  type CatalogItemRow,
} from "./catalogConfig";
import type { ShopLang } from "./i18n";

/**
 * Production snapshot (2026-11-04, read-only): every active mug / notebook SKU
 * the storefront sells, with its active variant's sell price. All of them were
 * checked against the live public quote endpoint (1 piece = this price).
 */
const PROD_MUG_NOTEBOOK_PRICES: Record<string, number> = {
  "CAG-320": 220,
  "CAIMI-320": 160,
  "CAMF-320": 230,
  "CAU-320": 220,
  "CAUL-320": 220,
  "CCMMN-320": 160,
  "CHB": 160,
  "CINMI-320": 160,
  "CIRCMI-320": 160,
  "CMARM-320": 160,
  "CMARV-320": 160,
  "CMMA": 160,
  "CMNMI-320": 230,
  "CMT": 240,
  "CNC-320": 230,
  "CTMM-320": 220,
  "CTMS-320": 220,
  "CVL": 220,
  "MD4001S10102": 160,
  "MD4001S101226": 160,
  "NB1604S1901": 139,
  "NB1604S1902": 139,
  "NB1604S1903": 139,
  "NB1604S1904": 139,
  "NB1604S1905": 139,
  "NB1604S1988": 139,
  "NB2011S101": 123,
  "NB2011S102": 123,
  "NB2011S103": 123,
  "NB2011S105": 123,
  "NB2011S1226": 123,
  "NB2011S131": 123,
  "NB2011S160": 123,
  "NB2068S129": 115,
  "NB7994S102": 99,
  "NB7994S103": 99,
  "NB7994S105": 99,
  "NB7994S1226": 99,
  "NB7994S131": 99,
  "NB7994S160": 99,
  "NB8051S102": 100,
  "NB8051S103": 100,
  "NB8051S105": 100,
  "NB8051S131": 100,
  "NB8051S140": 100,
  "NB8051S155": 100,
  "NB8051S160": 100,
  "NB8071S102": 100,
  "NB8071S105": 100,
  "NB8071S1226": 100,
  "NB8071S131": 100,
  "NB8071S160": 100,
  "S1-KB-320": 130,
  "S3-CBL-A5": 189,
  "S3-KB-450": 150,
  "S3-KBL-A5": 189,
  "S3-KCRC-330": 160,
  "S3-KJRJ-320": 160,
  "S3-KKRK-330": 160,
  "S3-KORO-320": 160,
  "S3-KRRR-320": 160,
  "S3-KSRS-320": 160,
  "S3-KZRZ-330": 160,
  "S3-SBL-A5": 189,
  "S3-ZBL-A5": 189,
  "TZ1132S102": 165,
  "TZ1132S105": 165,
  "TZ1132S1226": 165,
  "TZ1132S160": 165,
  "TZ1508S1242": 220,
  "TZ1508S1251": 220,
  "TZ1508S1260": 220,
  "TZ1508S148": 220,
  "TZ1615S102": 160,
  "TZ1615S103": 160,
  "TZ1615S1114": 160,
  "TZ1615S1242": 160,
  "TZ1615S160": 160,
};

/** Production SKUs of the DTF garments and pens (priced by their own engines). */
const PROD_OTHER_SKUS: string[] = [
  "CA6502-01",
  "CA6502-02",
  "GO70199002",
  "GO70199055",
  "GO70199060",
  "ARDENES_BLUE",
  "ARDENES_BLACK",
  "ARDENES_RED",
  "ARDENES_GREEN",
  "ARDENES_WHITE",
];

const LANGS: ShopLang[] = ["ro", "ru", "en"];

function prodRows(): CatalogItemRow[] {
  return Object.entries(PROD_MUG_NOTEBOOK_PRICES).map(([sku, price]) => ({
    id: `item-${sku}`,
    sku,
    isActive: true,
    imageUrl: `catalog/mugs/${sku}.jpg`,
    galleryImages: [],
    variants: [{ id: `var-${sku}`, isActive: true, options: {}, sellPrice: price, priceTiers: null, sortOrder: 0 }],
  }));
}

describe("storefront catalog config vs production", () => {
  it("maps every option to a production SKU", () => {
    const prod = new Set([...Object.keys(PROD_MUG_NOTEBOOK_PRICES), ...PROD_OTHER_SKUS]);
    const missing = SHOP_PRODUCTS.flatMap((p) => p.options.map((o) => o.sku)).filter((s) => !prod.has(s));
    expect(missing).toEqual([]);
  });

  it("sells mugs and notebooks only from priced production items", () => {
    for (const p of SHOP_PRODUCTS) {
      if (p.mode !== "simple" || (p.kind !== "mug" && p.kind !== "notebook")) continue;
      for (const o of p.options) expect(PROD_MUG_NOTEBOOK_PRICES[o.sku], `${p.slug} ${o.sku}`).toBeGreaterThan(0);
    }
  });

  it("has no duplicate slugs or SKUs", () => {
    const skus = SHOP_PRODUCTS.flatMap((p) => p.options.map((o) => o.sku));
    expect(skus.filter((s, i) => skus.indexOf(s) !== i)).toEqual([]);
    const slugs = SHOP_PRODUCTS.map((p) => p.slug);
    expect(slugs.filter((s, i) => slugs.indexOf(s) !== i)).toEqual([]);
  });

  it("has every text in ro, ru and en", () => {
    for (const p of SHOP_PRODUCTS) {
      const texts = [p.name, p.subtitle, p.description, ...(p.badge ? [p.badge] : []), ...p.options.map((o) => o.label)];
      for (const t of texts) for (const l of LANGS) expect(t[l]?.trim(), `${p.slug} ${l}`).toBeTruthy();
    }
  });

  it("uses known categories, valid colours and print areas", () => {
    const cats = new Set(SHOP_CATEGORIES.map((c) => c.slug));
    for (const p of SHOP_PRODUCTS) {
      expect(cats.has(p.category), p.slug).toBe(true);
      for (const o of p.options) expect(o.hex, `${p.slug} ${o.sku}`).toMatch(/^#[0-9a-f]{6}$/i);
      if (p.mode === "simple" && p.kind === "mug") expect(p.category).toBe("cani");
      if (p.mode === "simple" && p.kind === "notebook") expect(p.category).toBe("caiete");
      if (p.mode === "simple" && (p.kind === "mug" || p.kind === "notebook")) {
        expect(p.printAreaCm?.widthCm, p.slug).toBeGreaterThan(0);
        expect(p.printAreaCm?.heightCm, p.slug).toBeGreaterThan(0);
      }
    }
  });

  it("lists only existing products as popular", () => {
    const slugs = new Set(SHOP_PRODUCTS.map((p) => p.slug));
    expect(SHOP_POPULAR_SLUGS.filter((s) => !slugs.has(s))).toEqual([]);
    expect(new Set(SHOP_POPULAR_SLUGS).size).toBe(SHOP_POPULAR_SLUGS.length);
  });

  it("shows every mug and notebook option with its production price", () => {
    const { products } = mapShopCatalog(prodRows(), [], "ro");
    for (const c of SHOP_PRODUCTS) {
      if (c.mode !== "simple" || (c.kind !== "mug" && c.kind !== "notebook")) continue;
      const p = products.find((x) => x.slug === c.slug);
      expect(p, c.slug).toBeDefined();
      expect(p!.variants.map((v) => v.id)).toEqual(c.options.map((o) => `var-${o.sku}`));
      expect(p!.variants.map((v) => v.price)).toEqual(c.options.map((o) => PROD_MUG_NOTEBOOK_PRICES[o.sku]));
      expect(p!.image).toBeTruthy();
    }
  });

  it("adds the glossy gold mug to the gold/silver product", () => {
    const p = SHOP_PRODUCTS.find((x) => x.slug === "cana-aurie-argintie")!;
    expect(p.options.map((o) => o.sku)).toEqual(["CAU-320", "CAG-320", "CAUL-320"]);
  });
});
