import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ sheetPaper: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const paper = vi.hoisted(() => ({ findSheetPaperPricing: vi.fn() }));
vi.mock("@/lib/businessCard/sheetPaperStock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/businessCard/sheetPaperStock")>()),
  ...paper,
}));
vi.mock("@/lib/accounting/accountingSettings", () => ({
  // A studio minimum line total must not lift a shop pack.
  getOrCreateAccountingSettings: vi.fn(async () => ({ productionCosts: { bcMinimumLineTotalMdl: 500 } })),
}));

import type { BusinessCardLineData } from "@/lib/businessCard/types";
import { quotePublicLines, type PublicQuoteLineResult } from "@/lib/publicQuote/publicQuote";
import { parsePublicQuoteLine, type PublicBusinessCardLineInput } from "@/lib/publicQuote/publicQuoteSchema";
import { SHOP_BC_PACKS, shopBcTotalMdl } from "@/lib/storefront/businessCards";
import { pickShopBusinessCardPaper, resolveShopBusinessCardLine } from "./businessCardShop";

const P350 = "de4c0f00-0000-4000-8000-000000000350";

/** Prod's sheet papers (2026-11-04): A4+, no retail price, gsm mostly empty. */
const PAPERS = [
  { id: "198f8754-a596-4166-bbe9-746b8db81a67", name: "A4+ 105gr", gsm: null },
  { id: "704df193-2cd4-41dc-a293-e122250c58fd", name: "A4+ 200gr", gsm: 200 },
  { id: "c33d4c91-949f-48da-8086-4e775dd6fd5d", name: "A4+ 300gr", gsm: null },
  { id: P350, name: "A4+ 350gr", gsm: null },
];

const pricing = {
  id: P350,
  stockVariantId: null,
  name: "A4+ 350gr",
  gsm: null,
  sheetWidthCm: 22.5,
  sheetHeightCm: 32,
  retailPricePerSheet: 0,
  dealerPricePerSheet: 0,
  isActive: true,
  sortOrder: 5,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  sheetsInStock: 0,
  avgCostPerSheet: 2,
  catalogCostPerSheet: 0,
  stockSku: null,
};

const shopLine = (sides: "one" | "two", quantity: number) => ({ kind: "businessCard", pricing: "shopPack", sides, quantity });

async function one(line: unknown): Promise<PublicQuoteLineResult> {
  return (await quotePublicLines([line])).lines[0]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.sheetPaper.findMany.mockResolvedValue(PAPERS);
  paper.findSheetPaperPricing.mockResolvedValue(pricing);
});

describe("default business-card paper", () => {
  it("picks the 350 g paper by gsm or by its name", () => {
    expect(pickShopBusinessCardPaper(PAPERS)?.id).toBe(P350);
    expect(pickShopBusinessCardPaper([{ id: "x", name: "Coated", gsm: 350 }])?.id).toBe("x");
    expect(pickShopBusinessCardPaper(PAPERS.slice(0, 3))).toBeNull();
  });
});

describe("public quote — business-card pack", () => {
  it.each(SHOP_BC_PACKS.flatMap((n) => [["one", n] as const, ["two", n] as const]))(
    "%s side(s) × %i: the pack at the shop price, quote = order line",
    async (sides, n) => {
      const q = await one(shopLine(sides, n));
      expect(q).toMatchObject({ ok: true, kind: "businessCard", quantity: n, total: shopBcTotalMdl(n, sides) });
      const parsed = parsePublicQuoteLine(shopLine(sides, n));
      if (!parsed.ok) throw new Error(parsed.code);
      const res = await resolveShopBusinessCardLine(parsed.line as PublicBusinessCardLineInput);
      expect(res.totalSellPriceMdl).toBe(q.ok ? q.total : NaN);
      expect(res.sheetPaperId).toBe(P350);
    },
  );

  it("100 front-only = 150 lei, 100 double-sided = 200 lei", async () => {
    expect(await one(shopLine("one", 100))).toMatchObject({ ok: true, total: 150, unitPrice: 1.5 });
    expect(await one(shopLine("two", 100))).toMatchObject({ ok: true, total: 200, unitPrice: 2 });
  });

  it("keeps the pack as the run (not whole sheets) and records the shop pricing", async () => {
    const parsed = parsePublicQuoteLine(shopLine("two", 100));
    if (!parsed.ok) throw new Error(parsed.code);
    const res = await resolveShopBusinessCardLine(parsed.line as PublicBusinessCardLineInput);
    const data: BusinessCardLineData = res.businessCardLineData;
    expect(data.quantity).toBe(100);
    expect(data.cardsPerSheet).toBe(12);
    expect(data.sheetsUsed).toBe(9);
    expect(data.sides).toBe("two");
    expect(data.cardTrimWidthCm).toBe(9);
    expect(data.cardTrimHeightCm).toBe(5);
    expect(data.cardWidthCm).toBe(9.4);
    expect(data.cardHeightCm).toBe(5.4);
    expect(data.totalSellPriceMdl).toBe(200);
    expect(data.pricingSource).toBe("shop_pack");
    expect(data.pricePerCardMdl).toBe(2);
    expect(data.minimumLineUpliftMdl).toBeUndefined();
    expect(data.paperCostMdl).toBe(18);
  });

  it("refuses runs that are not a pack and studio-only options", async () => {
    expect(await one(shopLine("one", 150))).toMatchObject({ ok: false, reason: "invalid", code: "bc_shop_pack" });
    expect(await one({ ...shopLine("one", 100), sheetPaperId: P350 })).toMatchObject({ ok: false, code: "bc_shop_options" });
    expect(await one({ ...shopLine("one", 100), cardPresetId: "trim_85x55" })).toMatchObject({ ok: false, code: "bc_shop_options" });
    expect(await one({ ...shopLine("one", 100), productType: "flyer" })).toMatchObject({ ok: false, code: "bc_shop_options" });
    // Without the shop pricing the paper is still required.
    expect(await one({ kind: "businessCard", sides: "one", quantity: 100 })).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("no 350 g paper → price unavailable, never 0", async () => {
    db.sheetPaper.findMany.mockResolvedValue(PAPERS.slice(0, 3));
    expect(await one(shopLine("one", 100))).toMatchObject({ ok: false, reason: "price_unavailable", code: "bc_paper_not_found" });
  });

  it("answers only allowlisted keys", async () => {
    const q = await one(shopLine("two", 500));
    expect(Object.keys(q).sort()).toEqual(["currency", "kind", "ok", "quantity", "total", "unitPrice"]);
  });
});
