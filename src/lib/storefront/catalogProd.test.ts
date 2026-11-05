import { describe, expect, it } from "vitest";
import {
  mapShopCatalog,
  SHOP_CATEGORIES,
  SHOP_POPULAR_SLUGS,
  SHOP_PRODUCTS,
  type CatalogItemRow,
} from "./catalogConfig";
import { PROD_STOCK_ITEMS } from "./catalogStockProd.fixture";
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
  // 2026-11-05: pink rim mug added to «cana-margine-colorata» (0 in stock: made to order).
  "CMARR-320": 160,
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

/**
 * Production snapshot (2026-11-04, read-only) of the UV-printed stock items
 * the shop sells as `uvItem`: variant id, print area from the item card
 * (`printWidthCm/HeightCm`), balance, and the price of 1 piece from the LIVE
 * `POST https://anvi.md/api/public/quote` (`uv` stock line, main zone) — the
 * studio wizard's price (2 pieces = 2 × this; the 100-lei line minimum does
 * not bite at these prices).
 */
const PROD_UV_ITEMS: Record<string, { variantId: string; area: [number, number]; stock: number; price1: number }> = {
  TZ1267S102: { variantId: "074c26bf-e8b2-4fec-9a07-b9bffaf678d3", area: [21, 9.6], stock: 5, price1: 120 },
  TZ1267S103: { variantId: "58c655e5-d6ea-44b6-a70f-6bcf30cd2db4", area: [21, 9.6], stock: 24, price1: 120 },
  TZ1267S105: { variantId: "8cbd5634-89d3-4d15-8479-3e1a767874c3", area: [21, 9.6], stock: 5, price1: 120 },
  TZ1267S1226: { variantId: "894fe27b-5e3f-4371-a42b-b1204adadd78", area: [21, 9.6], stock: 24, price1: 120 },
  MD4008S10103: { variantId: "09af3a9b-f79b-4c69-8fa2-52a3ecfd44a3", area: [21, 9.6], stock: 24, price1: 220 },
  MD4008S10105: { variantId: "5e8eb6f6-78b1-49cd-a701-13577f9e1af3", area: [21, 9.6], stock: 24, price1: 220 },
};

/** Postponed by the owner on 2026-11-04, approved for the shop on 2026-11-05. */
const APPROVED_SKU_PREFIXES: string[] = ["BI4213", "BO7149", "FT1548"]; // KISKO, NIMES, KODA

/** The pilot UV items (the rest of the stock is in `catalogStock.test.ts`). */
const PILOT_UV_SLUGS: string[] = ["cana-radek", "cana-akebia"];

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
  // DTF bags and toys (prices, stock and live quotes in dtfItems.test.ts).
  "BO7614S129",
  "NE7565S102",
  "NE7565S105",
  "NE7565S131",
  "NE7565S160",
  "FT2051S1924",
  "FT2051S1925",
  "FT2051S1926",
  "FT2051S1927",
  "FT2051S1928",
  "FT2051S1997",
  "FT1853S101",
  "FT1853S105",
  "FT1853S1226",
  "FT1853S131",
  "FT1853S155",
  "FT1853S160",
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

function prodUvRows(): CatalogItemRow[] {
  return Object.entries(PROD_UV_ITEMS).map(([sku, u]) => ({
    id: `item-${sku}`,
    sku,
    isActive: true,
    imageUrl: `catalog/stock/1793204180000-${sku}.jpg`,
    // Supplier gallery (other colours, sample prints): hidden on the shop.
    galleryImages: [`catalog/stock/1793382760000-${sku}.jpg`],
    attributes: { printWidthCm: u.area[0], printHeightCm: u.area[1] },
    variants: [
      { id: u.variantId, isActive: true, options: {}, sellPrice: u.price1, priceTiers: null, sortOrder: 0, stockQuantity: u.stock },
    ],
  }));
}

describe("storefront catalog config vs production", () => {
  it("maps every option to a production SKU", () => {
    const prod = new Set([
      ...Object.keys(PROD_MUG_NOTEBOOK_PRICES),
      ...Object.keys(PROD_UV_ITEMS),
      ...PROD_OTHER_SKUS,
      ...PROD_STOCK_ITEMS.map((i) => i.sku),
    ]);
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

  it("checks pen artwork against the pen's print area (its stock card, else the pen default)", () => {
    const penRows = (attributes: unknown): CatalogItemRow[] =>
      ["ARDENES_BLUE", "ARDENES_BLACK"].map((sku) => ({
        id: `item-${sku}`,
        sku,
        isActive: true,
        imageUrl: null,
        galleryImages: [],
        attributes,
        variants: [{ id: `var-${sku}`, isActive: true, options: {}, sellPrice: 60, priceTiers: null, sortOrder: 0 }],
      }));
    const pen = mapShopCatalog(penRows({ printWidthCm: 5, printHeightCm: 0.6 }), [], "ro").products.find((p) => p.slug === "pix-ardenes")!;
    expect(pen.printAreaCm).toEqual({ widthCm: 5, heightCm: 0.6 });
    const bare = mapShopCatalog(penRows({}), [], "ro").products.find((p) => p.slug === "pix-ardenes")!;
    expect(bare.printAreaCm).toEqual({ widthCm: 4, heightCm: 1.5 });
    for (const p of SHOP_PRODUCTS) {
      if (p.mode === "simple" && p.kind === "mug") {
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

  it("sells UV items only from priced, zoned, in-stock production items", () => {
    const uv = SHOP_PRODUCTS.filter((p) => PILOT_UV_SLUGS.includes(p.slug));
    expect(uv.map((p) => p.mode === "simple" && p.kind)).toEqual(["uvItem", "uvItem"]);
    for (const p of uv) {
      for (const o of p.options) {
        const u = PROD_UV_ITEMS[o.sku];
        expect(u, `${p.slug} ${o.sku}`).toBeDefined();
        expect(u!.stock, o.sku).toBeGreaterThan(0);
        expect(u!.price1, o.sku).toBeGreaterThan(0);
        expect(u!.area[0] * u!.area[1], o.sku).toBeGreaterThan(0);
      }
    }
  });

  it("maps UV items with the live-quote price, the item print area and only the main photo", () => {
    const { products } = mapShopCatalog(prodUvRows(), [], "ro", undefined, { stockCheck: true });
    for (const c of SHOP_PRODUCTS) {
      if (c.mode !== "simple" || c.kind !== "uvItem" || !PILOT_UV_SLUGS.includes(c.slug)) continue;
      const p = products.find((x) => x.slug === c.slug)!;
      expect(p.simpleKind).toBe("uvItem");
      expect(p.available).toBe(true);
      expect(p.printAreaCm).toEqual({ widthCm: 21, heightCm: 9.6 });
      expect(p.editorHref).toBeNull();
      expect(p.variants.map((v) => v.id)).toEqual(c.options.map((o) => PROD_UV_ITEMS[o.sku]!.variantId));
      expect(p.variants.map((v) => v.price)).toEqual(c.options.map((o) => PROD_UV_ITEMS[o.sku]!.price1));
      expect(p.variants.map((v) => v.stock)).toEqual(c.options.map((o) => PROD_UV_ITEMS[o.sku]!.stock));
      for (const v of p.variants) {
        expect(v.images).toHaveLength(1);
        expect(v.uvNorms).toEqual({ whiteLayers: 1, varnish: false, primer: false, transfer: false });
      }
    }
  });

  it("does not sell an option of a UV item whose card has no print zone", () => {
    const rows = prodUvRows().map((r) => (r.sku === "TZ1267S102" ? { ...r, attributes: {} } : r));
    const p = mapShopCatalog(rows, [], "ro").products.find((x) => x.slug === "cana-radek")!;
    expect(p.variants.map((v) => v.id)).not.toContain(PROD_UV_ITEMS.TZ1267S102!.variantId);
    expect(p.variants).toHaveLength(3);
  });

  it("sells KISKO, NIMES and KODA now that the owner approved them (2026-11-05)", () => {
    const skus = SHOP_PRODUCTS.flatMap((p) => p.options.map((o) => o.sku));
    for (const prefix of APPROVED_SKU_PREFIXES) expect(skus.some((s) => s.startsWith(prefix)), prefix).toBe(true);
  });

  it("adds the glossy gold mug to the gold/silver product", () => {
    const p = SHOP_PRODUCTS.find((x) => x.slug === "cana-aurie-argintie")!;
    expect(p.options.map((o) => o.sku)).toEqual(["CAU-320", "CAG-320", "CAUL-320"]);
  });
});
