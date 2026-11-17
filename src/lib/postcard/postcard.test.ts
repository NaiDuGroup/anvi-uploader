import { describe, expect, it } from "vitest";
import {
  POSTCARD_DEFAULTS,
  POSTCARD_PRESETS,
  buildPostcardLineData,
  computePostcardLayout,
  parsePostcardSettings,
  postcardStepsRu,
  postcardSummaryRu,
  resolvePostcardLayout,
  samePostcardPricing,
  type PostcardOptions,
  type PostcardPresetId,
} from "./postcard";
import { sheetLinePaperSheets, sheetLineTonerClicks } from "@/lib/stickerSheet/stickerSheet";
import { keepStoredSheetLinePricing } from "@/lib/businessCard/keepStoredSheetLinePricing";
import type { SheetPaperSnapshot } from "@/lib/businessCard/types";
import { isA3NativePaper, isRegularSheetPaper } from "@/lib/businessCard/a3NativePaper";
import { pickShopPaperByGsm } from "@/lib/shop/printShopLine";
import { pickShopBusinessCardPaper } from "@/lib/shop/businessCardShop";

const paper = (gsm: number): SheetPaperSnapshot => {
  const retail = gsm <= 150 ? 10 : gsm >= 350 ? 14 : 12;
  const dealer = gsm <= 150 ? 7 : gsm >= 350 ? 9 : 8;
  return { id: `p${gsm}`, name: `A4+ ${gsm}gr`, gsm, sheetWidthCm: 22.5, sheetHeightCm: 32, costPerSheet: 0, retailPricePerSheet: retail, dealerPricePerSheet: dealer };
};

const opts = (o: Partial<PostcardOptions> = {}): PostcardOptions => ({
  purpose: "postcard",
  format: "A4+",
  wholeSheet: false,
  lamination: "none",
  creaseLines: 0,
  roundedCorners: false,
  figuredCut: false,
  ...o,
});

function size(id: PostcardPresetId): { trimWidthCm: number; trimHeightCm: number } {
  const p = POSTCARD_PRESETS.find((x) => x.id === id)!;
  return { trimWidthCm: p.trimWidthCm, trimHeightCm: p.trimHeightCm };
}

function line(input: {
  preset: PostcardPresetId;
  gsm?: number;
  qty: number;
  sides?: "one" | "two";
  o?: Partial<PostcardOptions>;
  dealer?: boolean;
}) {
  const built = buildPostcardLineData({
    paperSnapshot: paper(input.gsm ?? 300),
    avgPaperCostPerSheet: 0.61,
    presetId: input.preset,
    ...size(input.preset),
    sides: input.sides ?? "one",
    quantity: input.qty,
    options: opts(input.o),
    customerType: input.dealer ? "dealer" : "retail",
  });
  if (!built.ok) throw new Error(built.code);
  return built.data;
}

const perSheet = (id: PostcardPresetId, format: "A4+" | "A3+" = "A4+", figuredCut = false) =>
  computePostcardLayout({ format, ...size(id), wholeSheet: false, figuredCut }).cardsPerSheet;

describe("postcard imposition (2 mm bleed, gap 0)", () => {
  it("matches the spec table", () => {
    expect(perSheet("pc_a6")).toBe(4);
    expect(perSheet("pc_a6", "A3+")).toBe(8);
    expect(perSheet("pc_10x15")).toBe(4);
    expect(perSheet("pc_a5")).toBe(2);
    expect(perSheet("pc_dl")).toBe(3);
    expect(perSheet("pc_a4")).toBe(1);
    expect(perSheet("pc_a3")).toBe(0);
    expect(perSheet("pc_a3", "A3+")).toBe(1);
    expect(perSheet("pc_14x14")).toBe(2);
    expect(perSheet("pc_12x12", "A3+")).toBe(6);
    expect(perSheet("pc_75x10")).toBe(8);
    expect(perSheet("pc_bookmark")).toBe(8);
    expect(perSheet("pc_folded_a5")).toBe(1);
  });
  it("figured cut keeps 12 mm marks and a 3 mm gap", () => {
    expect(perSheet("pc_a6", "A4+", true)).toBe(2);
    expect(perSheet("pc_a6", "A3+", true)).toBe(4);
  });
  it("an A3 item moves to A3+ on its own", () => {
    const r = resolvePostcardLayout({ format: "A4+", ...size("pc_a3"), wholeSheet: false, figuredCut: false });
    expect(r.format).toBe("A3+");
    expect(r.layout.cardsPerSheet).toBe(1);
  });
});

describe("postcard prices (owner's examples, 2026-11-07)", () => {
  it("100 A6 2-sided 300 g = 500 retail / 400 dealer", () => {
    const r = line({ preset: "pc_a6", qty: 100, sides: "two" });
    expect(r.sheetsUsed).toBe(25);
    expect(r.postcard!.passes).toBe(50);
    expect(r.postcard!.printRatePerPassMdl).toBe(10);
    expect(r.totalSellPriceMdl).toBe(500);
    expect(r.pricePerCardMdl).toBe(5);
    expect(line({ preset: "pc_a6", qty: 100, sides: "two", dealer: true }).totalSellPriceMdl).toBe(400);
  });
  it("50 A6: 1-sided 156, 2-sided 312; 500 2-sided 2250", () => {
    expect(line({ preset: "pc_a6", qty: 50 }).totalSellPriceMdl).toBe(156);
    expect(line({ preset: "pc_a6", qty: 50, sides: "two" }).totalSellPriceMdl).toBe(312);
    expect(line({ preset: "pc_a6", qty: 500, sides: "two" }).totalSellPriceMdl).toBe(2250);
  });
  it("20 diplomas A4 250 g = 240; 350 diplomas = 3150; dealer 160 / 2800", () => {
    expect(line({ preset: "pc_a4", gsm: 250, qty: 20, o: { purpose: "diploma" } }).totalSellPriceMdl).toBe(240);
    expect(line({ preset: "pc_a4", qty: 350, o: { purpose: "diploma" } }).totalSellPriceMdl).toBe(3150);
    expect(line({ preset: "pc_a4", gsm: 250, qty: 20, dealer: true }).totalSellPriceMdl).toBe(160);
    expect(line({ preset: "pc_a4", qty: 350, dealer: true }).totalSellPriceMdl).toBe(2800);
  });
  it("30 folded A5 invitations 1-sided + crease = 390 (dealer 261)", () => {
    const r = line({ preset: "pc_folded_a5", qty: 30, o: { purpose: "invitation", creaseLines: 1 } });
    expect(r.sheetsUsed).toBe(30);
    expect(r.postcard!.breakdown.creaseMdl).toBe(30);
    expect(r.totalSellPriceMdl).toBe(390);
    expect(line({ preset: "pc_folded_a5", qty: 30, dealer: true, o: { creaseLines: 1 } }).totalSellPriceMdl).toBe(261);
    expect(line({ preset: "pc_folded_a5", qty: 30, sides: "two", o: { creaseLines: 1 } }).totalSellPriceMdl).toBe(630);
  });
  it("crease minimum 20 per line", () => {
    const r = line({ preset: "pc_folded_a5", qty: 5, o: { creaseLines: 1 } });
    expect(r.postcard!.breakdown.creaseMdl).toBe(20);
    expect(r.totalSellPriceMdl).toBe(80);
  });
  it("7 whole A3 sheets = 168 (14 A4+ passes), no minimum; 1 whole A4 = 12", () => {
    const r = line({ preset: "pc_a4", qty: 7, o: { wholeSheet: true, format: "A3+" } });
    expect(r.sheetsUsed).toBe(7);
    expect(r.cardsPerSheet).toBe(1);
    expect(r.postcard!.paperSheetsUsed).toBe(14);
    expect(r.totalSellPriceMdl).toBe(168);
    expect(line({ preset: "pc_a4", qty: 7, dealer: true, o: { wholeSheet: true, format: "A3+" } }).totalSellPriceMdl).toBe(112);
    expect(line({ preset: "pc_a4", qty: 1, o: { wholeSheet: true } }).totalSellPriceMdl).toBe(12);
  });
  it("lamination per A4+ sheet (both sides)", () => {
    expect(line({ preset: "pc_a6", qty: 100, o: { lamination: "gloss" } }).totalSellPriceMdl).toBe(675);
    expect(line({ preset: "pc_a6", qty: 100, dealer: true, o: { lamination: "gloss" } }).totalSellPriceMdl).toBe(450);
    expect(line({ preset: "pc_a4", qty: 20, o: { lamination: "gloss" } }).totalSellPriceMdl).toBe(540);
    expect(line({ preset: "pc_a4", qty: 20, o: { lamination: "matte" } }).totalSellPriceMdl).toBe(740);
  });
  it("bookmarks, cards, line minimum", () => {
    expect(line({ preset: "pc_bookmark", qty: 200, sides: "two" }).totalSellPriceMdl).toBe(500);
    expect(line({ preset: "pc_75x10", qty: 300 }).totalSellPriceMdl).toBe(456);
    expect(line({ preset: "pc_a6", qty: 10 }).totalSellPriceMdl).toBe(36);
    // 1 A6: 12 → minimum 30 retail; dealer 8 → 20.
    expect(line({ preset: "pc_a6", qty: 1 }).totalSellPriceMdl).toBe(30);
    expect(line({ preset: "pc_a6", qty: 1, dealer: true }).totalSellPriceMdl).toBe(20);
  });
  it("rounded corners per piece, figured cut per A4+ sheet", () => {
    expect(line({ preset: "pc_a6", qty: 100, o: { roundedCorners: true } }).totalSellPriceMdl).toBe(350);
    const fc = line({ preset: "pc_a6", qty: 8, o: { figuredCut: true, format: "A3+" } });
    expect(fc.cardsPerSheet).toBe(4);
    expect(fc.sheetsUsed).toBe(2);
    expect(fc.postcard!.paperSheetsUsed).toBe(4);
    expect(fc.totalSellPriceMdl).toBe(4 * 12 + 4 * 10);
  });
  it("paper tiers: 150 g −2, 350 g 14 / 12 / 11", () => {
    expect(line({ preset: "pc_a4", gsm: 150, qty: 10 }).postcard!.printRatePerPassMdl).toBe(10);
    expect(line({ preset: "pc_a4", gsm: 150, qty: 60 }).postcard!.printRatePerPassMdl).toBe(8);
    expect(line({ preset: "pc_a4", gsm: 150, qty: 250 }).postcard!.printRatePerPassMdl).toBe(7);
    expect(line({ preset: "pc_a4", gsm: 350, qty: 10 }).postcard!.printRatePerPassMdl).toBe(14);
    expect(line({ preset: "pc_a4", gsm: 350, qty: 60 }).postcard!.printRatePerPassMdl).toBe(12);
    expect(line({ preset: "pc_a4", gsm: 350, qty: 250 }).postcard!.printRatePerPassMdl).toBe(11);
    expect(line({ preset: "pc_a4", gsm: 350, qty: 10, dealer: true }).postcard!.printRatePerPassMdl).toBe(9);
  });
});

describe("postcard stock, toner, labels", () => {
  it("A3+ writes off 2 A4+ and 2 clicks per side", () => {
    const r = line({ preset: "pc_a3", qty: 7, sides: "two", o: { format: "A3+" } });
    expect(sheetLinePaperSheets(r)).toBe(14);
    expect(sheetLineTonerClicks(r)).toBe(28);
    const a6 = line({ preset: "pc_a6", qty: 100, sides: "two" });
    expect(sheetLinePaperSheets(a6)).toBe(25);
    expect(sheetLineTonerClicks(a6)).toBe(50);
  });
  it("summary and steps", () => {
    const r = line({ preset: "pc_folded_a5", qty: 30, o: { purpose: "invitation", creaseLines: 1, lamination: "matte" } });
    expect(postcardSummaryRu(r)).toBe("Приглашение · A5 сложенная (разворот A4) 21×29,7 см · A4+");
    expect(postcardStepsRu(r).map((s) => s.split(":")[0])).toEqual(["Печать Ricoh", "Ламинация мат (2 стор.)", "Гильотина", "Биговка"]);
  });
  it("settings parse with defaults", () => {
    expect(parsePostcardSettings(null)).toEqual(POSTCARD_DEFAULTS);
    expect(parsePostcardSettings({ laminationRetail: { gloss: 18 } }).laminationRetail).toEqual({ gloss: 18, matte: 25 });
  });
  it("edit keeps the sold price only while the finishing is the same", () => {
    const prev = { ...line({ preset: "pc_a6", qty: 100 }), totalSellPriceMdl: 999 };
    expect(keepStoredSheetLinePricing(line({ preset: "pc_a6", qty: 100, o: { purpose: "invitation" } }), prev).totalSellPriceMdl).toBe(999);
    expect(keepStoredSheetLinePricing(line({ preset: "pc_a6", qty: 100, o: { lamination: "gloss" } }), prev).totalSellPriceMdl).toBe(675);
    expect(samePostcardPricing(opts(), opts({ purpose: "voucher" }))).toBe(true);
  });
});

describe("A3+-only paper (textured, 32×45)", () => {
  const gesso: SheetPaperSnapshot = {
    id: "gesso",
    name: "Tintoretto Gesso 300g белая текстурная",
    gsm: 300,
    sheetWidthCm: 32,
    sheetHeightCm: 45,
    costPerSheet: 20,
    retailPricePerSheet: 36,
    dealerPricePerSheet: 30,
    retailPriceTwoSidesPerSheet: 42,
    dealerPriceTwoSidesPerSheet: null,
  };
  const build = (o: { qty: number; sides?: "one" | "two"; options?: Partial<PostcardOptions>; dealer?: boolean; paper?: SheetPaperSnapshot }) => {
    const built = buildPostcardLineData({
      paperSnapshot: o.paper ?? gesso,
      avgPaperCostPerSheet: null,
      presetId: "pc_a5",
      ...size("pc_a5"),
      sides: o.sides ?? "one",
      quantity: o.qty,
      options: opts(o.options),
      customerType: o.dealer ? "dealer" : "retail",
    });
    if (!built.ok) throw new Error(built.code);
    return built.data;
  };

  it("detects A3+-only papers by sheet size, never sticker paper", () => {
    expect(isA3NativePaper(gesso)).toBe(true);
    expect(isA3NativePaper({ ...gesso, sheetWidthCm: 45, sheetHeightCm: 32 })).toBe(true);
    expect(isA3NativePaper(paper(300))).toBe(false);
    expect(isA3NativePaper({ name: "A3+ самоклейка Fedrigoni", sheetWidthCm: 32, sheetHeightCm: 45 })).toBe(false);
    expect(isRegularSheetPaper(gesso)).toBe(false);
    expect(isRegularSheetPaper(paper(300))).toBe(true);
  });

  it("forces A3+ even when A4+ is requested", () => {
    const d = build({ qty: 8, options: { format: "A4+" } });
    expect(d.postcard!.format).toBe("A3+");
    expect(d.postcard!.sheetWidthCm).toBe(32);
    expect(d.cardsPerSheet).toBe(4); // A5 + bleed: 2 × 2 on 32 × 45
    expect(d.sheetsUsed).toBe(2);
    expect(resolvePostcardLayout({ a3NativePaper: true, format: "A4+", ...size("pc_a6"), wholeSheet: false, figuredCut: false }).format).toBe("A3+");
  });

  it("one side: 36 lei per A3+ sheet, flat (no tier step)", () => {
    const d = build({ qty: 8 });
    expect(d.postcard!.printRatePerPassMdl).toBe(36);
    expect(d.postcard!.breakdown.printMdl).toBe(72);
    expect(d.totalSellPriceMdl).toBe(72);
    const big = build({ qty: 400 }); // 100 sheets — no retail tier step
    expect(big.postcard!.printRatePerPassMdl).toBe(36);
    expect(big.totalSellPriceMdl).toBe(3600);
  });

  it("two sides: 42 lei per A3+ sheet, not doubled", () => {
    const d = build({ qty: 8, sides: "two" });
    expect(d.postcard!.printRatePerPassMdl).toBe(42);
    expect(d.totalSellPriceMdl).toBe(84);
    expect(d.postcard!.twoSidesRateFallback).toBeUndefined();
  });

  it("two sides without a two-side price: one side × 2, flagged", () => {
    const d = build({ qty: 8, sides: "two", dealer: true });
    expect(d.postcard!.printRatePerPassMdl).toBe(60);
    expect(d.postcard!.twoSidesRateFallback).toBe(true);
  });

  it("writes off 1 paper sheet per A3+ sheet; finishing still counts 2 A4+; toner 2 clicks per side", () => {
    const d = build({ qty: 8, sides: "two", options: { lamination: "gloss" } });
    expect(d.sheetsUsed).toBe(2);
    expect(d.postcard!.paperSheetsUsed).toBe(2);
    expect(sheetLinePaperSheets(d)).toBe(2);
    expect(d.paperCostMdl).toBe(40); // 2 sheets × 20
    expect(d.postcard!.breakdown.laminationMdl).toBe(60); // 4 A4+ × 15
    expect(sheetLineTonerClicks(d)).toBe(8);
    expect(d.postcard!.a3NativePaper).toBe(true);
  });

  it("whole sheets on A3+-only paper", () => {
    const d = build({ qty: 5, options: { wholeSheet: true, format: "A4+" } });
    expect(d.postcard!.format).toBe("A3+");
    expect(d.sheetsUsed).toBe(5);
    expect(d.postcard!.paperSheetsUsed).toBe(5);
    expect(d.totalSellPriceMdl).toBe(180);
  });

  it("ordinary A4+ paper on A3+ is unchanged (2 A4+ per sheet)", () => {
    const d = build({ qty: 8, paper: paper(300), options: { format: "A3+" } });
    expect(d.postcard!.paperSheetsUsed).toBe(4);
    expect(d.postcard!.a3NativePaper).toBeUndefined();
  });

  it("is excluded from the shop paper pickers (business cards, flyers)", () => {
    const rows = [
      { id: "gesso", name: gesso.name, gsm: 300, sheetWidthCm: 32, sheetHeightCm: 45 },
      { id: "a4", name: "A4+ 300gr", gsm: 300, sheetWidthCm: 22.5, sheetHeightCm: 32 },
      { id: "gesso350", name: "Textured 350", gsm: 350, sheetWidthCm: 45, sheetHeightCm: 32 },
    ];
    expect(pickShopPaperByGsm(rows, 300)?.id).toBe("a4");
    expect(pickShopBusinessCardPaper(rows)).toBeNull();
  });
});
