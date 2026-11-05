import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  sheetPaper: { findMany: vi.fn() },
  order: { update: vi.fn() },
  stockVariant: { findMany: vi.fn(async () => [] as unknown[]) },
  stockItem: { findMany: vi.fn(async () => [] as unknown[]) },
  printPricePreset: { findMany: vi.fn(async () => [] as unknown[]) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db, HEAVY_TX_OPTIONS: {} }));

const paper = vi.hoisted(() => ({ findSheetPaperPricing: vi.fn() }));
vi.mock("@/lib/businessCard/sheetPaperStock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/businessCard/sheetPaperStock")>()),
  ...paper,
}));
vi.mock("@/lib/accounting/accountingSettings", () => ({
  getOrCreateAccountingSettings: vi.fn(async () => ({ productionCosts: { bcMinimumLineTotalMdl: 500 } })),
}));

const create = vi.hoisted(() => ({ resolveOrderLines: vi.fn(), createOrderWithResolvedLines: vi.fn() }));
vi.mock("@/lib/orderCreate/orderLines", () => create);
vi.mock("@/lib/findClientByOrderPhone", () => ({ findClientIdByOrderPhone: vi.fn(async () => null) }));
vi.mock("./shopFiles", () => ({
  copyUploadToShopOrders: vi.fn(async (k: string) => k.replace(/^uploads\//, "shop-orders/")),
  readShopFileIfSmall: vi.fn(async () => null),
}));
vi.mock("./account/customers", () => ({ findOrCreateShopCustomer: vi.fn(async () => ({ id: "cust-1" })) }));
vi.mock("./account/data", () => ({ ownsReusableShopFile: vi.fn(async () => false) }));
vi.mock("@/lib/storefront/lineLabelsServer", () => ({ loadShopLineLabels: vi.fn(async () => null) }));

import type { BusinessCardLineData } from "@/lib/businessCard/types";
import { quotePublicLines } from "@/lib/publicQuote/publicQuote";
import { PS_PRODUCTS, psProduct } from "@/lib/storefront/printShop/config";
import { psLinePrice, type PsQuoteLine } from "@/lib/storefront/printShop/pricing";
import { uvStickerZone } from "@/lib/storefront/printShop/uvStickers";
import { toSheetLinePublicSummary } from "@/lib/businessCard/sheetLinePublicSummary";
import { sheetFinishingRu } from "@/lib/workshopBoard/groupLines";
import { runShopCheckout, shopLineFiles, shopLineToAdminInput, staffNoteLines } from "./checkout";
import { pickShopPaperByGsm, psFilesProblem, psPaperFiles, resolveShopPrintSheetLine } from "./printShopLine";
import { resolveShopBusinessCardLine } from "./businessCardShop";

/** Prod's sheet papers (2026-11-05, read-only): A4+ 22.5×32, 105–350 g, retail 10/10/12/12/12/14 a side. */
const GSMS = [105, 150, 200, 250, 300, 350] as const;
const RETAIL: Record<number, number> = { 105: 10, 150: 10, 200: 12, 250: 12, 300: 12, 350: 14 };
const idOf = (g: number) => `00000000-0000-4000-8000-000000000${g}`;
const PAPERS = GSMS.map((g) => ({ id: idOf(g), name: `A4+ ${g}gr`, gsm: g }));

function pricing(id: string) {
  const g = GSMS.find((x) => idOf(x) === id)!;
  return {
    id,
    stockVariantId: null,
    name: `A4+ ${g}gr`,
    gsm: g,
    sheetWidthCm: 22.5,
    sheetHeightCm: 32,
    retailPricePerSheet: RETAIL[g],
    dealerPricePerSheet: 7,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    sheetsInStock: 1000,
    avgCostPerSheet: 0.5,
    catalogCostPerSheet: 0,
    stockSku: null,
  };
}

const ps = (over: Partial<PsQuoteLine> & Pick<PsQuoteLine, "product">): PsQuoteLine => {
  const p = psProduct(over.product)!;
  return {
    kind: "sheetShop",
    format: p.formats[0]!.id,
    ...(p.defaultPaper != null ? { paper: p.defaultPaper } : {}),
    sides: p.sides[0]!,
    quantity: p.defaultPack,
    ...over,
  };
};

const KEY = (n: string) => `uploads/1762250000000-abcdefgh-${n}`;

beforeEach(() => {
  vi.clearAllMocks();
  db.sheetPaper.findMany.mockResolvedValue(PAPERS);
  paper.findSheetPaperPricing.mockImplementation(async (_: unknown, id: string) => pricing(id));
  create.resolveOrderLines.mockImplementation(async (inputs: unknown[]) => ({ resolved: inputs.map((input) => ({ input })), lfLineTotalsMdl: new Map() }));
  create.createOrderWithResolvedLines.mockImplementation(async () => ({ id: "o-1", orderNumber: 77, publicToken: "tok" }));
});

describe("quote = config price = stored flyer line, every product", () => {
  const cases: PsQuoteLine[] = PS_PRODUCTS.flatMap((p) =>
    p.formats.flatMap((f) =>
      p.sides.map((sides) => ({
        kind: "sheetShop" as const,
        product: p.id,
        format: f.id,
        ...(p.defaultPaper != null ? { paper: p.defaultPaper } : {}),
        sides,
        quantity: p.packs[1] ?? p.packs[0]!,
      })),
    ),
  );

  it.each(cases.map((c) => [`${c.product} ${c.format} ${c.sides}`, c] as const))("%s", async (_, line) => {
    const q = (await quotePublicLines([line])).lines[0]!;
    const want = psLinePrice(line)!;
    expect(q).toMatchObject({ ok: true, kind: "sheetShop", quantity: line.quantity, total: want.total });
    if (psProduct(line.product)!.path === "sheet") {
      const res = await resolveShopPrintSheetLine(line);
      expect(res.totalSellPriceMdl).toBe(want.total);
      expect(res.sheetPaperId).toBe(idOf(line.paper!));
      expect(res.businessCardLineData.cardsPerSheet).toBe(want.piecesPerSheet);
      expect(res.sheetsUsed).toBe(want.sheets);
    }
  });

  it("the 350 g line keeps the price-list 12, though the catalog paper says 14", async () => {
    const line = ps({ product: "flyers", format: "a4", paper: 350, quantity: 50 });
    expect((await quotePublicLines([line])).lines[0]).toMatchObject({ ok: true, total: 600 });
  });

  it("no paper of that weight → price unavailable (never 0)", async () => {
    db.sheetPaper.findMany.mockResolvedValue(PAPERS.filter((p) => p.gsm !== 300));
    expect((await quotePublicLines([ps({ product: "invitations" })])).lines[0]).toMatchObject({
      ok: false,
      reason: "price_unavailable",
      code: "bc_paper_not_found",
    });
  });

  it("refuses options the product does not have", async () => {
    expect((await quotePublicLines([ps({ product: "flyers", quantity: 75 })])).lines[0]).toMatchObject({ ok: false, code: "ps_pack" });
    expect((await quotePublicLines([{ ...ps({ product: "flyers" }), total: 1 }])).lines[0]).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("paper is picked by weight, by gsm or by the name", () => {
    expect(pickShopPaperByGsm([{ id: "a", name: "A4+ 300gr", gsm: null }], 300)?.id).toBe("a");
    expect(pickShopPaperByGsm(PAPERS, 120)).toBeNull();
  });
});

describe("the order line production reads", () => {
  it("A5 flyer: studio preset, sides, run, imposition, shop pricing, product + lamination", async () => {
    const res = await resolveShopPrintSheetLine(ps({ product: "flyers", format: "a5", paper: 150, sides: "two", quantity: 100, lamination: "matte" }));
    const d: BusinessCardLineData = res.businessCardLineData;
    expect(d).toMatchObject({
      presetId: "flyer_a5",
      cardTrimWidthCm: 14.8,
      cardTrimHeightCm: 21,
      cardWidthCm: 15.2,
      cardHeightCm: 21.4,
      bleedCm: 0.2,
      sides: "two",
      quantity: 100,
      cardsPerSheet: 2,
      sheetsUsed: 50,
      pricingSource: "shop_pack",
      totalSellPriceMdl: 3000,
      pricePerCardMdl: 30,
      artworkFit: "cover",
      shopPrint: { product: "flyers", format: "a5", lamination: "matte", finishingRu: "Листовки · ламинация мат" },
    });
    expect(d.paperSnapshot.name).toBe("A4+ 150gr");
    expect(d.minimumLineUpliftMdl).toBeUndefined();
    // Admin digest and workshop board badge.
    expect(toSheetLinePublicSummary(d, { production: true })).toMatchObject({
      widthCm: 14.8,
      heightCm: 21,
      sides: "two",
      quantity: 100,
      sheetsUsed: 50,
      cardsPerSheet: 2,
      shopProduct: "flyers",
      lamination: "matte",
    });
    expect(sheetFinishingRu(d)).toBe("Листовки · ламинация мат");
  });

  it("custom sizes (invitation 130×180, tent calendar 210×210) go as a custom flyer size", async () => {
    const inv = (await resolveShopPrintSheetLine(ps({ product: "invitations", format: "130x180", quantity: 50 }))).businessCardLineData;
    expect(inv).toMatchObject({ presetId: "custom", cardTrimWidthCm: 13, cardTrimHeightCm: 18, cardsPerSheet: 2, sheetsUsed: 25, totalSellPriceMdl: 500 });
    const tent = (await resolveShopPrintSheetLine(ps({ product: "calendarTent", quantity: 5 }))).businessCardLineData;
    expect(tent).toMatchObject({ presetId: "custom", cardTrimWidthCm: 21, cardTrimHeightCm: 21, cardsPerSheet: 1, totalSellPriceMdl: 125 });
  });

  it("paper products: one File row with the format, the run as copies (desk calendar: 13 pages)", () => {
    const f = [{ fileKey: "shop-orders/a.pdf", fileName: "cal.pdf" }];
    expect(psPaperFiles(ps({ product: "stickerSheets", quantity: 25 }), f)).toEqual([
      { fileName: "cal.pdf", fileUrl: "shop-orders/a.pdf", copies: 25, color: "color", paperType: "A4" },
    ]);
    expect(psPaperFiles(ps({ product: "calendarDesk", quantity: 3 }), f)).toEqual([
      { fileName: "cal.pdf", fileUrl: "shop-orders/a.pdf", copies: 3, color: "color", paperType: "other:21x14.8", pageCount: 13 },
    ]);
  });

  it("admin input: sheet products → flyer line, paper products → paper print line", () => {
    const okq = { ok: true as const, kind: "sheetShop" as const, quantity: 100, unitPrice: 2.5, total: 250, currency: "MDL" as const };
    expect(shopLineToAdminInput(ps({ product: "flyers" }), okq, [])).toEqual({ customerType: "retail", files: [], productType: "flyer", cardSides: "one", quantity: 100 });
    expect(shopLineToAdminInput(ps({ product: "stickerSheets" }), okq, [])).toEqual({ customerType: "retail", files: [], productType: "paper_print" });
  });

  it("files: front / back faces as the studio wizard saves them; UV-DTF designs as uv:<zone>", () => {
    const files = [
      { fileKey: "k1", fileName: "b.pdf", zone: "back" },
      { fileKey: "k2", fileName: "f.pdf", zone: "front" },
    ];
    expect(shopLineFiles("sheetShop", files, 100).map((f) => f.paperType)).toEqual(["business_card_back", "business_card_front"]);
    expect(shopLineFiles("uv", [{ fileKey: "a", fileName: "a.png", zone: "s2" }, { fileKey: "b", fileName: "b.png" }], 10, [], ["s1", "s2"]).map((f) => f.paperType)).toEqual([
      "uv:s2",
      "uv:s2",
    ]);
    expect(psFilesProblem(ps({ product: "flyers", sides: "two" }), [{ zone: "front" }])).toBe("required");
    expect(psFilesProblem(ps({ product: "calendarDesk" }), [{}, {}])).toBe("too_many");
  });

  it("staff note rows in Russian", async () => {
    const rows = await staffNoteLines([
      { input: ps({ product: "flyers", format: "a6", paper: 150, quantity: 100 }), priced: { quantity: 100 }, source: { quote: {}, title: "x", files: [{ fileKey: KEY("f.pdf"), fileName: "f.pdf" }] } },
      { input: ps({ product: "stickerSheets", cut: true, quantity: 5 }), priced: { quantity: 5 } },
      {
        input: { kind: "uv", source: "stickers", technique: "transfer", quantity: 20, zones: [uvStickerZone("s1", 5, 5)] } as never,
        priced: { quantity: 20 },
      },
    ]);
    expect(rows[0]).toMatchObject({
      summaryRu: "Листовки A6 105×148 · 150 г · 1 стор. — 100 шт. (25 л. A4+, по 4 на листе) [Печать на листах A4+, резка на гильотине]",
      noteRu: "Файл лицевой стороны: f.pdf",
    });
    expect(rows[1]!.summaryRu).toContain("контурная резка — 5 л.");
    expect(rows[2]!.summaryRu).toBe("Наклейки UV-DTF: 1 дизайн × 20 компл. (5×5 см) — плёнка A+B, 2 белых + лак, без переноса");
  });
});

describe("checkout: re-priced on the server, pre-resolved flyer lines", () => {
  function body(lines: unknown[]) {
    return {
      locale: "ru",
      customer: { name: "Ion", phone: "+37369123456" },
      delivery: { method: "pickup" },
      acceptTerms: true,
      lines,
    };
  }

  it("orders flyers + a desk calendar + laminated business cards; the client total is ignored", async () => {
    const res = await runShopCheckout(
      body([
        {
          quote: ps({ product: "flyers", format: "a5", paper: 300, sides: "two", quantity: 250 }),
          files: [
            { fileKey: KEY("f.pdf"), fileName: "f.pdf", zone: "front" },
            { fileKey: KEY("b.pdf"), fileName: "b.pdf", zone: "back" },
          ],
          title: "Листовки",
          total: 1,
        },
        { quote: ps({ product: "calendarDesk", quantity: 2 }), files: [{ fileKey: KEY("c.pdf"), fileName: "c.pdf" }], title: "Календарь" },
        {
          quote: { kind: "businessCard", pricing: "shopPack", sides: "one", quantity: 100, lamination: "gloss", corners: true },
          files: [{ fileKey: KEY("v.pdf"), fileName: "v.pdf", zone: "front" }],
          title: "Визитки",
        },
      ]),
      { NODE_ENV: "development" },
    );
    expect(res.status).toBe(201);
    // 250 A5 two sides at 300 g = 12 lei / piece; desk 2 × 130; cards 100 × (4.5 + 0.5).
    expect(res.body.subtotal).toBe(3000 + 260 + 500);
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    const [flyer, desk, bc] = args.resolved;
    expect(flyer.input).toMatchObject({ productType: "flyer", cardSides: "two", quantity: 250, sheetPaperId: idOf(300) });
    expect(flyer.input.files.map((f: { paperType: string }) => f.paperType)).toEqual(["business_card_front", "business_card_back"]);
    expect(flyer.businessCardExtras.businessCardLineData).toMatchObject({ sheetsUsed: 125, totalSellPriceMdl: 3000, shopPrint: { product: "flyers" } });
    expect(desk.input).toMatchObject({ productType: "paper_print", files: [{ copies: 2, pageCount: 13, paperType: "other:21x14.8" }] });
    expect(bc.businessCardExtras.businessCardLineData).toMatchObject({
      totalSellPriceMdl: 500,
      pricePerCardMdl: 5,
      shopFinishing: { lamination: "gloss", roundedCorners: true },
    });
    // Only the desk calendar went through the generic pipeline.
    expect(create.resolveOrderLines.mock.calls[0]![0]).toHaveLength(1);
    expect(args.order.notes).toContain("1) Листовки A5 148×210 · 300 г · 2 стор. — 250 шт. (125 л. A4+, по 2 на листе)");
    expect(args.order.notes).toContain("2) Календарь настольный на пружине A5 210×148 · 1 стор. — 2 шт. × 13 стр.");
    expect(args.order.notes).toContain("3) Визитки 90×50 мм — Только лицевая · Ламинация глянцевая · Скруглённые углы — 100 шт.");
    expect(args.shopLineData[0]).toMatchObject({ kind: "sheetShop", total: 3000, quantity: 250 });
  });

  it("a two-sided flyer without the back file is refused before any write", async () => {
    const res = await runShopCheckout(
      body([{ quote: ps({ product: "flyers", sides: "two" }), files: [{ fileKey: KEY("f.pdf"), fileName: "f.pdf", zone: "front" }], title: "x" }]),
      { NODE_ENV: "development" },
    );
    expect(res).toMatchObject({ status: 400, body: { fieldErrors: { "lines.0.files": "required" } } });
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
  });
});

describe("business-card finishing: quote = stored line", () => {
  it("lamination and corners are priced and recorded", async () => {
    const line = { kind: "businessCard", pricing: "shopPack", sides: "two", quantity: 200, lamination: "matte", corners: true } as const;
    const q = (await quotePublicLines([line])).lines[0]!;
    expect(q).toMatchObject({ ok: true, total: 200 * 5.5 });
    const res = await resolveShopBusinessCardLine(line);
    expect(res.totalSellPriceMdl).toBe(1100);
    expect(res.businessCardLineData.shopFinishing).toEqual({ lamination: "matte", roundedCorners: true });
    expect(sheetFinishingRu(res.businessCardLineData)).toBe("ламинация мат · скруглённые углы");
    // Studio-only lines cannot carry the shop finishing.
    expect((await quotePublicLines([{ kind: "businessCard", sheetPaperId: idOf(350), sides: "one", quantity: 12, corners: true }])).lines[0]).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
  });
});
