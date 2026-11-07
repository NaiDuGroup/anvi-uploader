import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The apparel Studio's live price (`apparelEstimate`, in the browser, on the
 * data `loadApparelPricing` sends) is the server quote (`POST
 * /api/public/quote`) for the same line — several combinations — and the
 * page data carries no costs.
 */

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ stockItem: { findUnique: vi.fn() }, stockVariant: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const methods = vi.hoisted(() => ({ loadPrintMethodSettings: vi.fn(), loadActivePrintPresetOptions: vi.fn() }));
vi.mock("@/lib/printMethods/printMethodsDb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/printMethods/printMethodsDb")>()),
  ...methods,
}));
vi.mock("@/lib/stock/unified/printers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stock/unified/printers")>()),
  printerSlotUnitCost: vi.fn(async () => 4.83),
  printerInkCostPerMl: vi.fn(async () => 0.3),
  loadPrinterSlots: vi.fn(async () => []),
}));

import { DEFAULT_DTF_SETTINGS } from "@/lib/dtf/dtfSettings";
import { CATALOG, LOGO, A4, A5 } from "@/lib/dtf/dtfTestFixtures";
import { dtfGarmentId } from "@/lib/dtf/stockGarments";
import { quotePublicLines } from "@/lib/publicQuote/publicQuote";
import type { ShopProduct } from "@/lib/storefront/types";
import { apparelEstimate, apparelQuoteLine, type ApparelZoneId } from "./apparel";
import { loadApparelPricing } from "./apparelServer";

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tiers = (a: number, b: number, c: number, d: number) => [
  { minQty: 1, priceMdl: a },
  { minQty: 2, priceMdl: b },
  { minQty: 10, priceMdl: c },
  { minQty: 50, priceMdl: d },
];

function row(id: string, category: { code: string; nameRo: string }, nameRo: string, color: string, sizes: string[], priceTiers: unknown) {
  return {
    id,
    printMethods: [],
    nameRo,
    nameRu: nameRo,
    nameEn: nameRo,
    sortOrder: 0,
    isActive: true,
    imageUrl: null,
    attributes: {},
    category: { ...category, nameRu: category.nameRo, nameEn: category.nameRo, sortOrder: 0, isActive: true, printMethods: ["dtf"] },
    variants: sizes.map((size, i) => ({
      id: uuid(Number(id.slice(-3)) * 10 + i),
      sku: `${id}-${size}`,
      label: null,
      options: { color, size },
      sortOrder: i,
      isActive: true,
      stockQuantity: 100,
      avgCost: 50,
      purchaseCost: 55,
      sellPrice: 100,
      dealerPrice: 60,
      priceTiers,
    })),
  };
}

const SHIRT_ITEM = uuid(101);
const POLO_ITEM = uuid(102);
const CAP_ITEM = uuid(103);
const rows: Record<string, unknown> = {
  [SHIRT_ITEM]: row(SHIRT_ITEM, { code: "tshirts", nameRo: "Tricouri" }, "DOGO Premium", "white", ["S", "M", "L", "XL"], tiers(100, 95, 85, 70)),
  [POLO_ITEM]: row(POLO_ITEM, { code: "apparel", nameRo: "Îmbrăcăminte" }, "Tricou polo AUSTRAL", "navy", ["M", "L", "XL"], tiers(180, 170, 155, 135)),
  // A cap without a size: the variant's size is the one-size mark.
  [CAP_ITEM]: { ...row(CAP_ITEM, { code: "caps", nameRo: "Șepci" }, "Șapcă ERIS", "black", ["x"], tiers(180, 150, 118, 100)), variants: [{ ...(row(CAP_ITEM, { code: "caps", nameRo: "Șepci" }, "x", "black", ["x"], tiers(180, 150, 118, 100)).variants[0]!), options: { color: "black" } }] },
};

const prints = CATALOG.presets.map((p) => ({ presetId: p.id, label: p.label, widthCm: p.widthCm, heightCm: p.heightCm, price: p.retailPrice }));
function product(slug: string, garment: "tshirt" | "cap", garmentId: string, sizes: string[]): ShopProduct {
  return {
    slug,
    category: "tricouri",
    name: slug,
    subtitle: "",
    description: "",
    badge: null,
    fromPrice: null,
    unitFrom: null,
    image: null,
    available: true,
    mode: "dtf",
    simpleKind: null,
    variants: [],
    dtf: {
      garment,
      colors: [{ key: slug, label: slug, hex: "#fff", garmentId, images: [], sizes, itemPrice: 100, sizeStock: {} }],
      prints: garment === "cap" ? [] : prints,
      itemZones: [],
      fixedZone: garment === "cap" ? { widthCm: 9, heightCm: 5 } : null,
      printDiscount: null,
      pressFeeMdl: 0,
    },
    editorHref: null,
    printAreaCm: null,
  };
}

const TEE = product("tricou-dogo", "tshirt", dtfGarmentId(SHIRT_ITEM, "white"), ["S", "M", "L", "XL"]);
const POLO = product("polo-austral", "tshirt", dtfGarmentId(POLO_ITEM, "navy"), ["M", "L", "XL"]);
const CAP = product("sapca-eris", "cap", dtfGarmentId(CAP_ITEM, "black"), ["—"]);

beforeEach(() => {
  vi.clearAllMocks();
  // A press fee and run-discount steps, so every part of the engine is in play.
  methods.loadPrintMethodSettings.mockImplementation(async () => ({ ...DEFAULT_DTF_SETTINGS, pressFeePerZoneMdl: 5 }));
  methods.loadActivePrintPresetOptions.mockImplementation(async () => CATALOG.presets);
  db.stockItem.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => rows[where.id] ?? null);
});

const CASES: { name: string; p: ShopProduct; formats: Partial<Record<ApparelZoneId, string | null>>; sizes: Record<string, number>; used: ApparelZoneId[] }[] = [
  { name: "T-shirt A4 front, 1 × M", p: TEE, formats: {}, sizes: { M: 1 }, used: ["front"] },
  { name: "T-shirt logo front + A4 back, 3 sizes, 12 pcs", p: TEE, formats: { front: LOGO, back: A4 }, sizes: { S: 2, M: 6, L: 4 }, used: ["front", "back"] },
  { name: "T-shirt A5 back only, 9 pcs (just under a run step)", p: TEE, formats: { back: A5 }, sizes: { M: 5, XL: 4 }, used: ["back"] },
  { name: "T-shirt A4 + A4, 50 pcs", p: TEE, formats: {}, sizes: { M: 30, L: 20 }, used: ["front", "back"] },
  { name: "polo logo front + A4 back, 2 pcs", p: POLO, formats: {}, sizes: { M: 1, L: 1 }, used: ["front", "back"] },
  { name: "cap logo, 1 pc", p: CAP, formats: {}, sizes: { "—": 1 }, used: ["front"] },
  { name: "cap logo, 11 pcs", p: CAP, formats: {}, sizes: { "—": 11 }, used: ["front"] },
];

describe("apparel live price = server quote", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const pricing = await loadApparelPricing(c.p);
      expect(pricing).not.toBeNull();
      const line = apparelQuoteLine(c.p, { colorKey: c.p.slug, formats: c.formats, sizes: c.sizes }, c.used);
      expect(line).not.toBeNull();
      const est = apparelEstimate(line, pricing);
      const res = await quotePublicLines([line]);
      const server = res.lines[0]!;
      if (!server.ok) throw new Error(`server: ${server.reason}/${server.code}`);
      expect(est?.total).toBe(server.total);
    });
  }

  it("sends no costs, dealer prices or balances to the page", async () => {
    const pricing = await loadApparelPricing(TEE);
    const json = JSON.stringify(pricing);
    for (const g of pricing!.garments) for (const v of g.variants) {
      expect(v.unitCostMdl).toBeNull();
      expect(v.stockQuantity).toBe(0);
      expect(v.dealerPriceMdl).toBeUndefined();
    }
    for (const p of pricing!.presets) expect(p.dealerPrice).toBeNull();
    expect(json).not.toMatch(/avgCost|purchaseCost|filmPerLinear/);
  });
});
