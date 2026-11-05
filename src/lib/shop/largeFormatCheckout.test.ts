import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", async () => {
  const { lfTestDb } = await import("@/lib/largeFormat/lfTestFixtures");
  return {
    prisma: { ...lfTestDb(), stockVariant: { findMany: vi.fn(async () => []) }, order: { update: vi.fn() } },
    HEAVY_TX_OPTIONS: {},
  };
});
vi.mock("@/lib/accounting/accountingSettings", async () => {
  const { LF_TEST_PRODUCTION_COSTS } = await import("@/lib/largeFormat/lfTestFixtures");
  return { getOrCreateAccountingSettings: vi.fn(async () => ({ productionCosts: LF_TEST_PRODUCTION_COSTS })) };
});
vi.mock("@/lib/stock/unified/printers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stock/unified/printers")>()),
  printerInkCostPerMl: vi.fn(async () => 0.617),
}));
const create = vi.hoisted(() => ({ createOrderWithResolvedLines: vi.fn() }));
vi.mock("@/lib/orderCreate/orderLines", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orderCreate/orderLines")>()),
  createOrderWithResolvedLines: create.createOrderWithResolvedLines,
}));
vi.mock("@/lib/findClientByOrderPhone", () => ({ findClientIdByOrderPhone: vi.fn(async () => null) }));
const files = vi.hoisted(() => ({ copyUploadToShopOrders: vi.fn(), readShopFileIfSmall: vi.fn(async () => null) }));
vi.mock("./shopFiles", () => files);
vi.mock("./account/customers", () => ({ findOrCreateShopCustomer: vi.fn(async () => ({ id: "cust-1" })) }));
vi.mock("./account/data", () => ({ ownsReusableShopFile: vi.fn(async () => false) }));
vi.mock("@/lib/storefront/lineLabelsServer", () => ({ loadShopLineLabels: vi.fn(async () => null) }));

import type { LargeFormatLineData } from "@/lib/largeFormat/types";
import { shopT } from "@/lib/storefront/i18n";
import { describeQuoteLine, EMPTY_LINE_LABELS } from "@/lib/storefront/lineLabels";
import { shopLfStaffSummaryRu, type ShopLfQuote } from "@/lib/storefront/largeFormat";
import { parseCart, serializeCart } from "@/lib/storefront/cart";
import { lineMissingFile } from "@/lib/storefront/fileRules";
import { priceShopCheckout, runShopCheckout } from "./checkout";

const DEV = { NODE_ENV: "development" };
const key = (i: number) => `uploads/1762250000000-abcdef${String(i).padStart(2, "0")}-banner${i}.pdf`;

const BANNER: ShopLfQuote = {
  kind: "largeFormat",
  product: "banner",
  material: "banner",
  widthCm: 200,
  heightCm: 100,
  quantity: 1,
  finishing: { hem: true, eyelets: { mode: "spacing", spacingCm: 50 } },
};
const ROLLUP: ShopLfQuote = { kind: "largeFormat", product: "rollup", kit: "rollup_80x200", quantity: 2 };
const CANVAS: ShopLfQuote = { kind: "largeFormat", product: "canvas", material: "canvas", widthCm: 50, heightCm: 70, quantity: 1, preset: true };

function body(lines: { quote: unknown; n: number }[], over: Record<string, unknown> = {}) {
  return {
    locale: "ro",
    customer: { name: "Ion Popescu", phone: "+373 69 123 456" },
    delivery: { method: "pickup" },
    lines: lines.map((l, j) => ({
      quote: l.quote,
      files: Array.from({ length: l.n }, (_, i) => ({ fileKey: key(j * 10 + i), fileName: `banner${i}.pdf`, sizeBytes: 1000 })),
      title: "Banner",
    })),
    acceptTerms: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  files.copyUploadToShopOrders.mockImplementation(async (k: string) => k.replace(/^uploads\//, "shop-orders/"));
  create.createOrderWithResolvedLines.mockImplementation(async () => ({ id: "o-1", orderNumber: 77, publicToken: "tok" }));
});

describe("wide-format checkout", () => {
  it("re-prices on the server: banner 200×100 + hem + eyelets = 570 + 90 + 42", async () => {
    const p = await priceShopCheckout(body([{ quote: BANNER, n: 1 }]), DEV);
    expect(p.ok && p.subtotal).toBe(702);
  });

  it("one artwork per line: none → required, two → too_many", async () => {
    expect(await priceShopCheckout(body([{ quote: BANNER, n: 0 }]), DEV)).toMatchObject({
      ok: false,
      response: { status: 400, body: { fieldErrors: { "lines.0.files": "required" } } },
    });
    expect(await priceShopCheckout(body([{ quote: BANNER, n: 2 }]), DEV)).toMatchObject({
      ok: false,
      response: { status: 400, body: { fieldErrors: { "lines.0.files": "too_many" } } },
    });
  });

  it("creates the wizard's large_format_print lines (each priced alone) with finishing / the set and a Russian note", async () => {
    const res = await runShopCheckout(
      body([
        { quote: BANNER, n: 1 },
        { quote: ROLLUP, n: 1 },
        { quote: CANVAS, n: 1 },
      ]),
      DEV,
    );
    expect(res.status).toBe(201);
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    const [banner, rollup, canvas] = args.resolved;
    expect(banner.input).toMatchObject({
      productType: "large_format_print",
      largeFormatMaterialId: "66b19d4e-cc8e-44b2-a292-07f80df27fff",
      printWidthCm: 200,
      printHeightCm: 100,
      quantity: 1,
      customerType: "retail",
      lfFinishing: BANNER.finishing,
      files: [{ fileName: "banner0.pdf", fileUrl: key(0).replace("uploads/", "shop-orders/"), copies: 1, color: "color", paperType: "large_format" }],
    });
    const bannerData = banner.largeFormatExtras.largeFormatLineData as LargeFormatLineData;
    expect(bannerData.totalSellPrice).toBe(702);
    expect(bannerData.finishing?.eyelets?.countPerPiece).toBe(12);
    const rollupData = rollup.largeFormatExtras.largeFormatLineData as LargeFormatLineData;
    expect(rollupData.totalSellPrice).toBe(2200);
    expect(rollup.input.files[0]).toMatchObject({ copies: 2, paperType: "large_format" });
    expect((canvas.largeFormatExtras.largeFormatLineData as LargeFormatLineData).totalSellPrice).toBe(610);
    expect((canvas.largeFormatExtras.largeFormatLineData as LargeFormatLineData).galleryWrapCm).toBe(4);
    expect(args.order.price.toString()).toBe(String(702 + 2200 + 610));
    expect(args.order.notes).toContain(
      "1) Баннер 200×100 см, баннер Frontlit 440 г, люверсы шаг ≤50 см по периметру (12 шт.), проклейка по периметру (6 м) — 1 шт.",
    );
    expect(args.order.notes).toContain("2) Roll-up 80×200 со стойкой, печать 80×210 см (10 см снизу в кассету) — 2 шт.");
    expect(args.order.notes).toContain("3) Холст на подрамнике 50×70 см, холст, загиб 4 см зеркально, размер из прайса — 1 шт.");
    expect(args.shopLineData[0]).toMatchObject({ kind: "largeFormat", total: 702, quote: BANNER });
  });

  it("staff summary in short form", () => {
    expect(shopLfStaffSummaryRu(BANNER, { short: true })).toBe("Баннер 200×100 см — 1 шт.");
    expect(shopLfStaffSummaryRu({ kind: "largeFormat", product: "xbanner", kit: "xbanner_80x180", quantity: 1 })).toBe(
      "X-banner 80×180 со стойкой, люверсы по углам (4 шт.) — 1 шт.",
    );
  });
});

describe("cart and line names", () => {
  it("names a line in ro / ru / en", () => {
    const d = (lang: "ro" | "ru" | "en", q: ShopLfQuote) => describeQuoteLine(q, EMPTY_LINE_LABELS, shopT(lang));
    expect(d("ro", BANNER)).toEqual({ slug: "banner", title: "Banner", optionsText: "200×100 cm · Capse la max. 50 cm (12 buc.) · Margini sudate" });
    expect(d("ru", BANNER)).toEqual({ slug: "banner", title: "Баннер", optionsText: "200×100 см · Люверсы через 50 см (12 шт.) · Проклейка края" });
    expect(d("en", BANNER)).toEqual({ slug: "banner", title: "Banner", optionsText: "200×100 cm · Eyelets every 50 cm (12 pcs) · Welded hem" });
    expect(d("ru", ROLLUP)).toEqual({ slug: "roll-up", title: "Roll-up со стойкой", optionsText: "80×200 см" });
    expect(d("en", CANVAS)?.optionsText).toBe("50×70 cm · 4 cm wrapped sides");
    expect(d("ro", { kind: "largeFormat", product: "autocolant", material: "oracal_gloss", widthCm: 50, heightCm: 50, quantity: 1 })?.optionsText).toBe(
      "50×50 cm · Oracal lucios",
    );
  });

  it("keeps wide-format lines in the stored cart, drops broken ones; needs a file", () => {
    const line = { id: "l1", slug: "banner", title: "Banner", optionsText: "", image: null, quote: BANNER, files: [], addedAt: 1 };
    const broken = { ...line, id: "l2", quote: { ...BANNER, widthCm: 999 } };
    const parsed = parseCart(serializeCart([line, broken] as never));
    expect(parsed.map((l) => l.id)).toEqual(["l1"]);
    expect(lineMissingFile(parsed[0]!)).toBe(true);
  });
});
