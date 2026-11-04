import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── DB layer mocks (both the public quote and order creation read through these) ───

const db = vi.hoisted(() => ({
  stockItem: { findUnique: vi.fn() },
  stockVariant: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const methods = vi.hoisted(() => ({
  loadPrintMethodSettings: vi.fn(),
  loadActivePrintPresetOptions: vi.fn(),
}));
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

const paper = vi.hoisted(() => ({ findSheetPaperPricing: vi.fn() }));
vi.mock("@/lib/businessCard/sheetPaperStock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/businessCard/sheetPaperStock")>()),
  ...paper,
}));
vi.mock("@/lib/accounting/accountingSettings", () => ({
  getOrCreateAccountingSettings: vi.fn(async () => ({ productionCosts: {} })),
}));

const variants = vi.hoisted(() => ({
  loadMugVariant: vi.fn(),
  loadNotebookVariant: vi.fn(),
  loadPenVariant: vi.fn(),
}));
vi.mock("@/lib/mug/mugVariant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mug/mugVariant")>()),
  loadMugVariant: variants.loadMugVariant,
}));
vi.mock("@/lib/notebook/notebookVariant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notebook/notebookVariant")>()),
  loadNotebookVariant: variants.loadNotebookVariant,
}));
vi.mock("@/lib/pen/penVariant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pen/penVariant")>()),
  loadPenVariant: variants.loadPenVariant,
}));

import { resolveAdminOrderLineProducts } from "@/lib/adminOrderCreateHelpers";
import type { BusinessCardLineData } from "@/lib/businessCard/types";
import { DEFAULT_DTF_SETTINGS } from "@/lib/dtf/dtfSettings";
import { CATALOG as DTF_CATALOG, A4, A5, LOGO } from "@/lib/dtf/dtfTestFixtures";
import { dtfColorKey, dtfGarmentId } from "@/lib/dtf/stockGarments";
import { PrintMethodCode } from "@/lib/printMethods/methods";
import type { AdminOrderLineInput } from "@/lib/validations";
import { SETTINGS as UV_SETTINGS } from "@/lib/uv/uvTestFixtures";
import { UV_PRINT_HEIGHT_KEY, UV_PRINT_WIDTH_KEY } from "@/lib/uv/uvConstants";
import { quotePublicLines, type PublicQuoteLineResult } from "./publicQuote";

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SHIRT_ITEM = uuid(100);
const SHIRT = dtfGarmentId(SHIRT_ITEM, dtfColorKey("White"));
const shirtRow = {
  id: SHIRT_ITEM,
  printMethods: [],
  nameRo: "DOGO Premium",
  nameRu: "DOGO Premium",
  nameEn: "DOGO Premium",
  sortOrder: 0,
  isActive: true,
  imageUrl: null,
  attributes: {},
  category: {
    code: "tshirts",
    nameRo: "Tricouri",
    nameRu: "Майки",
    nameEn: "T-shirts",
    sortOrder: 0,
    isActive: true,
    printMethods: ["dtf"],
  },
  variants: ["S", "M", "L"].map((size, i) => ({
    id: uuid(110 + i),
    sku: `DOGO-W-${size}`,
    label: null,
    options: { color: "White", colorHex: "#ffffff", size },
    sortOrder: i,
    isActive: true,
    stockQuantity: 10,
    avgCost: 50,
    purchaseCost: 55,
    sellPrice: 100,
    dealerPrice: 60,
    priceTiers: [
      { minQty: 1, priceMdl: 100 },
      { minQty: 2, priceMdl: 95 },
      { minQty: 10, priceMdl: 85 },
      { minQty: 50, priceMdl: 70 },
    ],
  })),
};

const PEN_ITEM = uuid(200);
const PEN_VARIANT = uuid(201);
const penRow = {
  id: PEN_ITEM,
  sku: "ARDENES",
  printMethods: [],
  nameRo: "Pix alb",
  nameRu: "Ручка белая",
  nameEn: "Pen white",
  sortOrder: 0,
  isActive: true,
  imageUrl: null,
  attributes: { [UV_PRINT_WIDTH_KEY]: 5, [UV_PRINT_HEIGHT_KEY]: 0.6 },
  category: {
    code: "pens",
    nameRo: "Pixuri",
    nameRu: "Ручки",
    nameEn: "Pens",
    sortOrder: 1,
    isActive: true,
    printMethods: ["uv"],
  },
  variants: [
    {
      id: PEN_VARIANT,
      sku: "ARDENES_WHITE",
      label: null,
      options: { colorHex: "#ffffff" },
      sortOrder: 0,
      isActive: true,
      stockQuantity: 20,
      avgCost: 4.04,
      purchaseCost: 4,
      sellPrice: 100,
      dealerPrice: 18,
      priceTiers: [
        { minQty: 1, priceMdl: 100 },
        { minQty: 50, priceMdl: 90 },
      ],
    },
  ],
};

const PAPER = uuid(300);
const paperPricing = (retail: number) => ({
  id: PAPER,
  stockVariantId: uuid(301),
  name: "Coated 300",
  gsm: 300,
  sheetWidthCm: 32,
  sheetHeightCm: 45,
  retailPricePerSheet: retail,
  dealerPricePerSheet: 10,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  sheetsInStock: 500,
  avgCostPerSheet: 3.5,
  catalogCostPerSheet: 3,
  stockSku: "PAPER-300",
});

const MUG = uuid(400);
const NOTEBOOK = uuid(500);
const PLAIN = uuid(600);

const itemRows: Record<string, unknown> = { [SHIRT_ITEM]: shirtRow, [PEN_ITEM]: penRow };

beforeEach(() => {
  vi.clearAllMocks();
  methods.loadPrintMethodSettings.mockImplementation(async (code: PrintMethodCode) =>
    code === PrintMethodCode.Dtf ? DEFAULT_DTF_SETTINGS : UV_SETTINGS,
  );
  methods.loadActivePrintPresetOptions.mockImplementation(async () => DTF_CATALOG.presets);
  db.stockItem.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => itemRows[where.id] ?? null);
  db.stockVariant.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === PEN_VARIANT ? { itemId: PEN_ITEM } : null,
  );
  db.stockVariant.findMany.mockResolvedValue([]);
  db.stockVariant.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === PLAIN
      ? {
          id: PLAIN,
          sellPrice: 40,
          priceTiers: [
            { minQty: 1, priceMdl: 40 },
            { minQty: 20, priceMdl: 32.5 },
          ],
        }
      : null,
  );
  paper.findSheetPaperPricing.mockResolvedValue(paperPricing(12));
  variants.loadMugVariant.mockImplementation(async (_db: unknown, id: string) =>
    id === MUG ? { id: MUG, sellPrice: { toString: () => "150.00" }, dealerPrice: 90 } : null,
  );
  variants.loadNotebookVariant.mockImplementation(async (_db: unknown, id: string) =>
    id === NOTEBOOK ? { id: NOTEBOOK, sellPrice: 75, dealerPrice: 40 } : null,
  );
  variants.loadPenVariant.mockImplementation(async (_db: unknown, id: string) =>
    id === PEN_VARIANT
      ? { id: PEN_VARIANT, sellPrice: 100, dealerPrice: 18, priceTiers: penRow.variants[0]!.priceTiers }
      : null,
  );
});

const dtfLine = {
  kind: "dtf",
  garmentId: SHIRT,
  sizes: [
    { size: "M", quantity: 3 },
    { size: "L", quantity: 2 },
  ],
  zones: [
    { id: "front", placement: "front", presetId: A4 },
    { id: "back", placement: "back", presetId: LOGO },
  ],
};
const uvLine = {
  kind: "uv",
  source: "stock",
  variantId: PEN_VARIANT,
  quantity: 10,
  zones: [
    { id: "main", placement: "front", whiteLayers: 1 },
    { id: "side", placement: "side", widthCm: 4, heightCm: 1, whiteLayers: 1 },
  ],
};
const businessCardLine = { kind: "businessCard", sheetPaperId: PAPER, sides: "two", quantity: 100 };

const FIXTURES: Record<string, unknown> = {
  mug: { kind: "mug", productId: MUG, quantity: 3 },
  notebook: { kind: "notebook", productId: NOTEBOOK, quantity: 4 },
  pen: { kind: "pen", productId: PEN_VARIANT, quantity: 50 },
  stockItem: { kind: "stockItem", variantId: PLAIN, quantity: 20 },
  dtf: dtfLine,
  uv: uvLine,
  businessCard: businessCardLine,
};

async function one(line: unknown): Promise<PublicQuoteLineResult> {
  const res = await quotePublicLines([line]);
  return res.lines[0]!;
}

function okLine(r: PublicQuoteLineResult) {
  if (!r.ok) throw new Error(`expected a price, got ${r.reason}/${r.code}`);
  return r;
}

const FORBIDDEN = /cost|profit|margin|markup|consumption|avg|purchase/i;

/** Every key (and string value) anywhere in a JSON value that matches {@link FORBIDDEN}. */
function forbiddenPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => forbiddenPaths(v, `${path}[${i}]`));
  if (value != null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(FORBIDDEN.test(k) ? [`${path}.${k}`] : []),
      ...forbiddenPaths(v, `${path}.${k}`),
    ]);
  }
  return typeof value === "string" && FORBIDDEN.test(value) ? [`${path}=${value}`] : [];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("public quote never leaks costs", () => {
  for (const locale of ["ro", "ru", "en"] as const) {
    it.each(Object.keys(FIXTURES))(`%s (${locale})`, async (kind) => {
      const res = await quotePublicLines([FIXTURES[kind]], locale);
      const serialized: unknown = JSON.parse(JSON.stringify(res));
      expect(okLine(res.lines[0]!).kind).toBe(kind);
      expect(forbiddenPaths(serialized)).toEqual([]);
    });
  }

  it("a whole cart, failures included", async () => {
    paper.findSheetPaperPricing.mockResolvedValue(paperPricing(0));
    const res = await quotePublicLines([...Object.values(FIXTURES), { kind: "mug", productId: "nope", quantity: 1 }, 42]);
    expect(forbiddenPaths(JSON.parse(JSON.stringify(res)))).toEqual([]);
  });

  it("only allowlisted keys come back", async () => {
    const res = await quotePublicLines(Object.values(FIXTURES));
    for (const line of res.lines) {
      const l = okLine(line);
      expect(Object.keys(l).sort()).toEqual(
        ["ok", "kind", "quantity", "unitPrice", "total", "currency", ...(l.breakdown ? ["breakdown"] : [])].sort(),
      );
      for (const row of l.breakdown ?? []) expect(Object.keys(row).sort()).toEqual(["amount", "key", "label"]);
    }
    expect(Object.keys(res).sort()).toEqual(["currency", "lines", "subtotal"]);
  });
});

describe("public quote equals what order creation charges a retail customer", () => {
  it("DTF line", async () => {
    const order = await resolveAdminOrderLineProducts({
      productType: "dtf_apparel",
      customerType: "retail",
      files: [],
      dtf: { garmentSource: "stock", garmentProductId: SHIRT, sizes: dtfLine.sizes, zones: dtfLine.zones },
    } as unknown as AdminOrderLineInput);
    const expected = order.dtfExtras!.dtfLineData.pricing.totalSellPriceMdl;
    const q = okLine(await one(dtfLine));
    expect(expected).toBeGreaterThan(0);
    expect(q.total).toBe(expected);
    expect(q.quantity).toBe(5);
    expect(q.breakdown?.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(q.total, 2);
  });

  it("DTF lines sharing a layout pool their run like order lines", async () => {
    const a = { ...dtfLine, sizes: [{ size: "M", quantity: 6 }], zones: [{ id: "f", placement: "front", presetId: A5 }], layoutKey: "L1" };
    const b = { ...a, sizes: [{ size: "L", quantity: 6 }] };
    const res = await quotePublicLines([a, b]);
    const order = await resolveAdminOrderLineProducts(
      {
        productType: "dtf_apparel",
        customerType: "retail",
        files: [],
        dtf: { garmentSource: "stock", garmentProductId: SHIRT, sizes: a.sizes, zones: a.zones, layoutKey: "L1" },
      } as unknown as AdminOrderLineInput,
      12,
    );
    expect(okLine(res.lines[0]!).total).toBe(order.dtfExtras!.dtfLineData.pricing.totalSellPriceMdl);
    // 12 pieces reach the 10+ garment tier; 6 on their own would not.
    const alone = okLine(await one({ ...a, layoutKey: undefined }));
    expect(okLine(res.lines[0]!).total).toBeLessThan(alone.total);
    expect(res.subtotal).toBe(okLine(res.lines[0]!).total + okLine(res.lines[1]!).total);
  });

  it("UV line", async () => {
    const order = await resolveAdminOrderLineProducts({
      productType: "uv_print",
      customerType: "retail",
      files: [],
      uv: {
        source: "stock",
        variantId: PEN_VARIANT,
        quantity: 10,
        zones: uvLine.zones.map((z) => ({ varnish: false, primer: false, ...z })),
      },
    } as unknown as AdminOrderLineInput);
    const q = okLine(await one(uvLine));
    expect(q.total).toBe(order.uvExtras!.uvLineData.pricing.totalSellPriceMdl);
    expect(q.total).toBeGreaterThan(1000);
  });

  it("business cards (run raised to whole sheets, then priced like the order)", async () => {
    const q = okLine(await one(businessCardLine));
    expect(q.quantity).toBeGreaterThanOrEqual(100);
    const order = await resolveAdminOrderLineProducts({
      productType: "business_card",
      customerType: "retail",
      files: [],
      sheetPaperId: PAPER,
      quantity: q.quantity,
      cardSides: "two",
    } as unknown as AdminOrderLineInput);
    const data = order.businessCardExtras!.businessCardLineData as unknown as BusinessCardLineData;
    expect(q.total).toBe(data.totalSellPriceMdl);
    expect(q.total).toBe(data.sheetsUsed * 2 * 12);
  });

  it("mug: retail sell price × pieces (dealer price ignored)", async () => {
    expect(okLine(await one(FIXTURES.mug)).total).toBe(450);
  });

  it("pen: UV run-size price with the main print included", async () => {
    const q = okLine(await one(FIXTURES.pen));
    expect(q.unitPrice).toBe(90);
    expect(q.total).toBe(4500);
    expect(okLine(await one({ kind: "pen", productId: PEN_VARIANT, quantity: 2 })).total).toBe(200);
  });

  it("pen: approved run-size prices, a bigger package never cheaper than a smaller one", async () => {
    const pen = penRow.variants[0]!;
    const saved = pen.priceTiers;
    pen.priceTiers = [
      { minQty: 1, priceMdl: 100 },
      { minQty: 2, priceMdl: 80 },
      { minQty: 5, priceMdl: 60 },
      { minQty: 10, priceMdl: 45 },
      { minQty: 25, priceMdl: 35 },
      { minQty: 50, priceMdl: 28 },
      { minQty: 100, priceMdl: 22 },
      { minQty: 300, priceMdl: 20 },
    ];
    try {
      const expected: [number, number, number][] = [
        [1, 100, 100],
        [2, 160, 80],
        [4, 300, 75],
        [5, 300, 60],
        [9, 450, 50],
        [10, 450, 45],
        [24, 875, 36.46],
        [25, 875, 35],
        [49, 1400, 28.57],
        [50, 1400, 28],
        [99, 2200, 22.22],
        [100, 2200, 22],
        [300, 6000, 20],
      ];
      for (const [quantity, total, unitPrice] of expected) {
        const q = okLine(await one({ kind: "pen", productId: PEN_VARIANT, quantity }));
        expect([quantity, q.total, q.unitPrice]).toEqual([quantity, total, unitPrice]);
      }
    } finally {
      pen.priceTiers = saved;
    }
  });

  it("notebook outside the UV catalog falls back to its sell price", async () => {
    expect(okLine(await one(FIXTURES.notebook)).total).toBe(300);
  });

  it("plain stock item by run-size tier", async () => {
    const q = okLine(await one(FIXTURES.stockItem));
    expect(q.total).toBe(650);
    expect(q.unitPrice).toBe(32.5);
  });
});

describe("unpriced and invalid lines", () => {
  it("paper without a retail price → price_unavailable, not 0", async () => {
    paper.findSheetPaperPricing.mockResolvedValue(paperPricing(0));
    expect(await one(businessCardLine)).toMatchObject({ ok: false, reason: "price_unavailable" });
  });

  it("mug without a sell price → price_unavailable", async () => {
    variants.loadMugVariant.mockResolvedValue({ id: MUG, sellPrice: null, dealerPrice: null });
    expect(await one(FIXTURES.mug)).toMatchObject({ ok: false, reason: "price_unavailable" });
  });

  it("mug sold at 0 → price_unavailable", async () => {
    variants.loadMugVariant.mockResolvedValue({ id: MUG, sellPrice: 0, dealerPrice: null });
    expect(await one(FIXTURES.mug)).toMatchObject({ ok: false, reason: "price_unavailable" });
  });

  it("empty DTF price list → price_unavailable", async () => {
    methods.loadActivePrintPresetOptions.mockResolvedValue([]);
    expect(await one({ ...dtfLine, zones: [{ id: "f", placement: "front", presetId: null, widthCm: 10, heightCm: 10 }] })).toMatchObject({
      ok: false,
      reason: "price_unavailable",
      code: "dtf_price_list_empty",
    });
  });

  it("unknown size / unknown product / bad payload → invalid; subtotal null", async () => {
    const res = await quotePublicLines([
      { ...dtfLine, sizes: [{ size: "XXXL", quantity: 1 }] },
      { kind: "mug", productId: "nope", quantity: 1 },
      { kind: "dtf", garmentId: SHIRT },
      { kind: "laser" },
      FIXTURES.mug,
    ]);
    expect(res.lines.map((l) => (l.ok ? "ok" : l.reason))).toEqual(["invalid", "invalid", "invalid", "invalid", "ok"]);
    expect(res.lines[0]).toMatchObject({ code: "dtf_size_unknown" });
    expect(res.lines[3]).toMatchObject({ kind: null });
    expect(res.subtotal).toBeNull();
  });

  it("refuses dealer / staff-only knobs from the client", async () => {
    expect(await one({ ...FIXTURES.mug as object, customerType: "dealer" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await one({ ...dtfLine, zones: [{ id: "f", placement: "front", presetId: A4, noPress: true }] })).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(await one({ ...uvLine, source: "client" })).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("subtotal sums priced lines", async () => {
    const res = await quotePublicLines([FIXTURES.mug, FIXTURES.notebook]);
    expect(res.subtotal).toBe(750);
  });
});
