import { describe, expect, it } from "vitest";
import { parseCart, serializeCart, type CartLine } from "../cart";
import { lineMissingFile, kindNeedsFile } from "../fileRules";
import { describeQuoteLine, EMPTY_LINE_LABELS } from "../lineLabels";
import { SHOP_LANGS, shopT } from "../i18n";
import { shopBcPerCardMdl, shopBcTotalMdl } from "../businessCards";
import { PS_CATEGORY_NAME, PS_ON_REQUEST, PS_PRODUCTS, psFormat, psProduct, type PsProductId } from "./config";
import {
  isPsQuoteLine,
  psCheckArtwork,
  psExpectedPx,
  psFileMm,
  psLinePrice,
  psLineProblem,
  psPiecesPerSheet,
  psTemplateSvg,
  type PsQuoteLine,
} from "./pricing";
import { PS_TEXT, psLineOptions, psLineTitle, psStaffShortRu, psStaffSummaryRu } from "./text";
import {
  isShopUvStickersLine,
  uvStickerSizeProblem,
  uvStickerZone,
  uvStickersFilesProblem,
  uvStickersStaffSummaryRu,
} from "./uvStickers";
import { PS_STOCK_AFTER, printShopListing, printShopPageOf, withPrintShopStock } from "./listing";
import { SHOP_CATEGORIES } from "../catalogConfig";
import type { ShopProduct } from "../types";

const line = (product: PsProductId, over: Partial<PsQuoteLine> = {}): PsQuoteLine => {
  const p = psProduct(product)!;
  return {
    kind: "sheetShop",
    product,
    format: p.formats[0]!.id,
    ...(p.defaultPaper != null ? { paper: p.defaultPaper } : {}),
    sides: p.sides[0]!,
    quantity: p.defaultPack,
    ...over,
  };
};

const total = (l: PsQuoteLine): number | null => psLinePrice(l)?.total ?? null;

describe("prices = the price list", () => {
  it("flyers: per sheet side 10 (105–150 g) / 12 (200–350 g), A6 = A4 / 4, two sides × 2", () => {
    // Price list page 12: A5 5–6, A4 10–12 per sheet; A6 = A4 / 4.
    const per = (format: string, paper: number, sides: "one" | "two") =>
      psLinePrice(line("flyers", { format, paper, sides, quantity: 100 }))!.unitPrice;
    expect([per("a6", 105, "one"), per("a6", 150, "one"), per("a6", 200, "one"), per("a6", 350, "one")]).toEqual([2.5, 2.5, 3, 3]);
    expect([per("a5", 150, "one"), per("a5", 300, "one")]).toEqual([5, 6]);
    expect([per("a4", 105, "one"), per("a4", 250, "one")]).toEqual([10, 12]);
    expect([per("dl", 150, "one"), per("dl", 200, "one")]).toEqual([3.33, 4]);
    expect([per("a6", 150, "two"), per("a5", 300, "two"), per("a4", 300, "two")]).toEqual([5, 12, 24]);
  });

  it("flyers: pack totals (whole lei), no run discount", () => {
    expect(total(line("flyers", { format: "a6", paper: 150, quantity: 50 }))).toBe(125);
    expect(total(line("flyers", { format: "a6", paper: 150, quantity: 1000 }))).toBe(2500);
    expect(total(line("flyers", { format: "a5", paper: 200, sides: "two", quantity: 500 }))).toBe(6000);
    expect(total(line("flyers", { format: "dl", paper: 150, quantity: 50 }))).toBe(167);
    expect(total(line("flyers", { format: "dl", paper: 150, quantity: 1000 }))).toBe(3333);
  });

  it("350 g is priced like the price list (12 a side), not the catalog's 14", () => {
    expect(psLinePrice(line("flyers", { format: "a4", paper: 350, quantity: 50 }))!.unitPrice).toBe(12);
  });

  it("invitations and menus: Clasic Mat 10 one side / 25 both sides per piece, every size", () => {
    for (const id of ["invitations", "menus"] as const) {
      for (const f of psProduct(id)!.formats) {
        expect(psLinePrice(line(id, { format: f.id, sides: "one", quantity: 10 }))!.unitPrice).toBe(10);
        expect(psLinePrice(line(id, { format: f.id, sides: "two", quantity: 10 }))!.unitPrice).toBe(25);
      }
    }
  });

  it("calendars: pocket 5 (laminated 8), poster A4 12, tent 25, desk A5 130", () => {
    expect(psLinePrice(line("calendarPocket", { quantity: 100 }))!.unitPrice).toBe(5);
    expect(psLinePrice(line("calendarPocket", { quantity: 100, lamination: "gloss" }))!.unitPrice).toBe(8);
    for (const paper of [200, 250, 300, 350]) expect(psLinePrice(line("calendarPoster", { paper, quantity: 10 }))!.unitPrice).toBe(12);
    expect(total(line("calendarTent", { quantity: 10 }))).toBe(250);
    expect(total(line("calendarDesk", { quantity: 2 }))).toBe(260);
  });

  it("sticker sheets A4: plain 12, die-cut 25 per sheet", () => {
    expect(total(line("stickerSheets", { quantity: 10 }))).toBe(120);
    expect(total(line("stickerSheets", { quantity: 10, cut: true }))).toBe(250);
  });

  it("lamination per piece by pouch: A6 5/10, A5 10/20, A4 15/25 (gloss / matte)", () => {
    const lam = (id: PsProductId, format: string, l: "gloss" | "matte") =>
      psLinePrice(line(id, { format, lamination: l, quantity: psProduct(id)!.packs[0]! }))!.laminationPerPiece;
    expect([lam("flyers", "a6", "gloss"), lam("flyers", "a6", "matte")]).toEqual([5, 10]);
    expect([lam("flyers", "a5", "gloss"), lam("flyers", "a5", "matte")]).toEqual([10, 20]);
    expect([lam("flyers", "a4", "gloss"), lam("flyers", "a4", "matte")]).toEqual([15, 25]);
    expect(lam("calendarPoster", "a4", "matte")).toBe(25);
    expect(total(line("flyers", { format: "a6", paper: 150, quantity: 50, lamination: "gloss" }))).toBe(375);
  });

  it("business cards: rounded corners +0.5 / card, laminated card 4.5", () => {
    expect(shopBcPerCardMdl("one")).toBe(1.5);
    expect(shopBcPerCardMdl("one", { corners: true })).toBe(2);
    expect(shopBcPerCardMdl("one", { lamination: "gloss" })).toBe(4.5);
    expect(shopBcPerCardMdl("two", { lamination: "matte", corners: true })).toBe(5.5);
    expect(shopBcTotalMdl(100, "one", { lamination: "gloss", corners: true })).toBe(500);
    expect(shopBcTotalMdl(100, "one", { lamination: "shiny" as "gloss" })).toBeNull();
  });
});

describe("imposition on A4+ 22.5×32 (trim + 2 mm bleed)", () => {
  it.each([
    ["flyers", "a6", 4],
    ["flyers", "a5", 2],
    ["flyers", "dl", 3],
    ["flyers", "a4", 1],
    ["postcards", "sq150", 2],
    ["invitations", "105x148", 4],
    ["invitations", "120x170", 2],
    ["invitations", "130x180", 2],
    ["menus", "105x210", 2],
    ["calendarPocket", "100x70", 9],
    ["calendarTent", "dl-tent", 1],
  ] as const)("%s %s: %i per sheet", (id, format, n) => {
    const p = psProduct(id)!;
    expect(psPiecesPerSheet(p, psFormat(p, format)!)).toBe(n);
  });

  it("sheets used for a pack, sheet products only", () => {
    expect(psLinePrice(line("flyers", { format: "dl", paper: 150, quantity: 100 }))).toMatchObject({ piecesPerSheet: 3, sheets: 34 });
    expect(psLinePrice(line("stickerSheets", { quantity: 25 }))).toMatchObject({ piecesPerSheet: null, sheets: 25 });
    expect(psLinePrice(line("calendarDesk", { quantity: 3 }))).toMatchObject({ piecesPerSheet: null, sheets: null });
  });

  it("every sheet format fits the sheet and the studio custom-size limits (3–32 cm)", () => {
    for (const p of PS_PRODUCTS.filter((x) => x.path === "sheet")) {
      for (const f of p.formats) {
        expect(psPiecesPerSheet(p, f)).toBeGreaterThan(0);
        expect(Math.min(f.trimMm.width, f.trimMm.height)).toBeGreaterThanOrEqual(30);
        expect(Math.max(f.trimMm.width, f.trimMm.height)).toBeLessThanOrEqual(320);
      }
    }
  });
});

describe("line validation", () => {
  it("accepts every product's default line and every pack", () => {
    for (const p of PS_PRODUCTS) {
      for (const n of p.packs) expect(psLineProblem(line(p.id, { quantity: n }))).toBeNull();
    }
  });

  it.each([
    [{ product: "brochures" }, "ps_product"],
    [{ format: "a3" }, "ps_format"],
    [{ paper: 80 }, "ps_paper"],
    [{ quantity: 77 }, "ps_pack"],
    [{ sides: "three" }, "ps_sides"],
    [{ lamination: "silk" }, "ps_lamination"],
    [{ cut: true }, "ps_cut"],
    [{ fit: "stretch" }, "ps_fit"],
    [{ price: 1 }, "invalid_input"],
  ] as const)("flyers %o → %s", (over, code) => {
    expect(psLineProblem({ ...line("flyers"), ...over })).toBe(code);
  });

  it("product-specific rules", () => {
    // Pocket calendars are two-sided only; lamination gloss only.
    expect(psLineProblem(line("calendarPocket", { sides: "one" }))).toBe("ps_sides");
    expect(psLineProblem(line("calendarPocket", { lamination: "matte" }))).toBe("ps_lamination");
    // Paper products take no paper; the tent calendar has no lamination; stickers cannot be laminated.
    expect(psLineProblem({ ...line("stickerSheets"), paper: 300 })).toBe("ps_paper");
    expect(psLineProblem(line("calendarTent", { lamination: "gloss" }))).toBe("ps_lamination");
    expect(psLineProblem(line("stickerSheets", { lamination: "gloss" }))).toBe("ps_lamination");
    expect(isPsQuoteLine(line("stickerSheets", { cut: true }))).toBe(true);
  });
});

describe("file rules", () => {
  const p = psProduct("flyers")!;
  const a5 = psFormat(p, "a5")!;

  it("file = trim + 2 mm bleed; 300 dpi pixels", () => {
    expect(psFileMm(p, a5)).toEqual({ width: 152, height: 214 });
    expect(psExpectedPx(p, a5)).toEqual({ width: 1795, height: 2528 });
    // Sticker sheets: no bleed, the A4 page itself.
    const s = psProduct("stickerSheets")!;
    expect(psFileMm(s, s.formats[0]!)).toEqual({ width: 210, height: 297 });
  });

  it("PDF: bleed size ok, finished size = no bleed, other shape = wrong proportions", () => {
    expect(psCheckArtwork(p, a5, { pageMm: { width: 152, height: 214 } })).toMatchObject({ ok: true });
    expect(psCheckArtwork(p, a5, { pageMm: { width: 214, height: 152 } })).toMatchObject({ ok: true });
    expect(psCheckArtwork(p, a5, { pageMm: { width: 148, height: 210 } })?.issues).toEqual(["no_bleed"]);
    expect(psCheckArtwork(p, a5, { pageMm: { width: 210, height: 210 } })?.issues).toEqual(["wrong_proportions"]);
  });

  it("image: proportions and resolution", () => {
    expect(psCheckArtwork(p, a5, { px: { width: 1795, height: 2528 } })).toMatchObject({ ok: true, dpi: 300 });
    expect(psCheckArtwork(p, a5, { px: { width: 898, height: 1264 } })?.issues).toEqual(["low_dpi"]);
    expect(psCheckArtwork(p, a5, { px: { width: 2000, height: 2000 } })?.issues).toContain("wrong_proportions");
    expect(psCheckArtwork(p, a5, { px: null })).toBeNull();
  });

  it("desk calendar: a 13-page PDF", () => {
    const d = psProduct("calendarDesk")!;
    const f = d.formats[0]!;
    expect(psCheckArtwork(d, f, { pageMm: { width: 214, height: 152 }, pages: 13 })).toMatchObject({ ok: true });
    expect(psCheckArtwork(d, f, { pageMm: { width: 214, height: 152 }, pages: 12 })?.issues).toEqual(["pages"]);
  });

  it("template SVG at the file size, fold line for the tent calendar", () => {
    const labels = { bleed: "B", trim: "T", safe: "S", fold: "F<>" };
    const svg = psTemplateSvg(p, a5, labels);
    expect(svg).toContain('width="152mm" height="214mm"');
    expect(svg).not.toContain("F&lt;&gt;");
    const tent = psProduct("calendarTent")!;
    expect(psTemplateSvg(tent, tent.formats[0]!, labels)).toContain("F&lt;&gt;");
  });

  it("cart: sheet products need a file per printed side, paper products one file", () => {
    expect(kindNeedsFile("sheetShop")).toBe(true);
    const two = line("flyers", { sides: "two" });
    expect(lineMissingFile({ quote: two, files: [{ zone: "front" }] })).toBe(true);
    expect(lineMissingFile({ quote: two, files: [{ zone: "front" }, { zone: "back" }] })).toBe(false);
    expect(lineMissingFile({ quote: line("calendarDesk"), files: [{}] })).toBe(false);
    expect(lineMissingFile({ quote: line("calendarDesk"), files: [] })).toBe(true);
  });
});

describe("stock calendar in Tipografie", () => {
  const medus = (available = true): ShopProduct => ({ ...printShopListing("ro")[0]!, slug: "calendar-medus", available });

  it("puts the MEDUS desk calendar right after the print-shop desk calendars, only while available", () => {
    expect(PS_STOCK_AFTER).toEqual({ "calendar-medus": "calendare-de-birou" });
    const base = printShopListing("ro");
    const slugs = withPrintShopStock(base, [medus()]).map((p) => p.slug);
    expect(slugs).toHaveLength(base.length + 1);
    expect(slugs[slugs.indexOf("calendare-de-birou") + 1]).toBe("calendar-medus");
    expect(withPrintShopStock(base, [medus(false)]).map((p) => p.slug)).toEqual(base.map((p) => p.slug));
    expect(withPrintShopStock(base, []).map((p) => p.slug)).toEqual(base.map((p) => p.slug));
  });

  it("has no separate stock «Calendare» category any more", () => {
    expect(SHOP_CATEGORIES.map((c) => c.slug)).not.toContain("calendare");
  });
});

describe("cart, labels, languages", () => {
  const cartLine = (quote: unknown): CartLine =>
    ({ id: "l1", slug: "x", title: "X", optionsText: "", image: null, quote, files: [], addedAt: 1 }) as CartLine;

  it("the cart keeps valid print-shop and UV-DTF lines and drops broken ones", () => {
    const good = line("invitations", { sides: "two", lamination: "matte" });
    const uv = { kind: "uv", source: "stickers", technique: "transfer", quantity: 20, zones: [uvStickerZone("s1", 5, 5)] };
    const back = parseCart(serializeCart([cartLine(good), cartLine(uv), cartLine({ ...good, quantity: 13 }), cartLine({ ...uv, technique: "direct" })]));
    expect(back.map((l) => l.quote)).toEqual([good, uv]);
  });

  it("names and options in every language (cart rebuilds them from the quote)", () => {
    const l = line("flyers", { format: "a5", paper: 150, sides: "two", lamination: "matte" });
    expect(psLineTitle(l, "ro")).toBe("Flyere și pliante");
    expect(psLineTitle(l, "ru")).toBe("Листовки и флаеры");
    expect(psLineOptions(l, "ru")).toBe("A5 148×210 · 150 г/м² · Две стороны · Ламинация: Матовая");
    expect(psLineOptions(l, "en")).toBe("A5 148×210 · 150 g/m² · Both sides · Lamination: Matte");
    for (const lang of SHOP_LANGS) {
      const text = describeQuoteLine(l, EMPTY_LINE_LABELS, shopT(lang));
      expect(text).toEqual({ slug: "flyere", title: psLineTitle(l, lang), optionsText: psLineOptions(l, lang) });
    }
    const uv = { kind: "uv" as const, source: "stickers" as const, technique: "transfer" as const, quantity: 5, zones: [uvStickerZone("s1", 5, 7.5)] };
    expect(describeQuoteLine(uv, EMPTY_LINE_LABELS, shopT("ru"))).toEqual({ slug: "stickere-uv-dtf", title: "Наклейки UV-DTF", optionsText: "5×7,5 см" });
  });

  it("business-card finishing in the cart text", () => {
    const bc = { kind: "businessCard" as const, pricing: "shopPack" as const, sides: "one" as const, quantity: 100, lamination: "gloss" as const, corners: true };
    expect(describeQuoteLine(bc, EMPTY_LINE_LABELS, shopT("ru"))?.optionsText).toBe("Только лицевая · Ламинация глянцевая · Скруглённые углы");
    expect(parseCart(serializeCart([cartLine(bc)]))).toHaveLength(1);
  });

  it("every print-shop string exists in ro, ru and en", () => {
    for (const [key, v] of Object.entries(PS_TEXT)) {
      for (const lang of SHOP_LANGS) expect(v[lang], `${key}.${lang}`).toBeTruthy();
      expect(v.ru, key).not.toBe(v.en);
    }
    for (const p of PS_PRODUCTS) {
      for (const field of [p.name, p.subtitle, p.description, ...(p.leadTime ? [p.leadTime] : []), ...(p.fileNote ? [p.fileNote] : [])]) {
        for (const lang of SHOP_LANGS) expect(field[lang], `${p.id}.${lang}`).toBeTruthy();
        expect(field.ru).not.toBe(field.ro);
      }
    }
    for (const r of PS_ON_REQUEST) for (const lang of SHOP_LANGS) expect(r.name[lang]).toBeTruthy();
    expect(PS_CATEGORY_NAME).toEqual({ ro: "Tipografie", ru: "Полиграфия", en: "Print shop" });
  });

  it("listing: business cards first, every product, UV-DTF stickers; /p/<slug> routing", () => {
    const list = printShopListing("ro");
    expect(list[0]!.slug).toBe("carti-de-vizita");
    expect(list.map((p) => p.slug)).toEqual(["carti-de-vizita", ...PS_PRODUCTS.map((p) => p.slug), "stickere-uv-dtf"]);
    expect(list.find((p) => p.slug === "flyere")?.unitFrom).toBe(2.5);
    expect(printShopPageOf("invitatii")).toMatchObject({ kind: "product" });
    expect(printShopPageOf("stickere-uv-dtf")).toEqual({ kind: "uv" });
    expect(printShopPageOf("cani")).toBeNull();
  });
});

describe("staff note (Russian)", () => {
  it("product, format, paper, sides, finishing, run and sheets", () => {
    expect(psStaffSummaryRu(line("flyers", { format: "a5", paper: 150, sides: "two", lamination: "matte", quantity: 100 }))).toBe(
      "Листовки A5 148×210 · 150 г · 2 стор. · ламинация мат — 100 шт. (50 л. A4+, по 2 на листе) [Печать на листах A4+, резка на гильотине]",
    );
    expect(psStaffSummaryRu(line("stickerSheets", { cut: true, quantity: 10 }))).toBe(
      "Наклейки на листе A4 210×297 · 1 стор. · контурная резка — 10 л. [Самоклейка A4]",
    );
    expect(psStaffSummaryRu(line("calendarDesk", { quantity: 2 }))).toContain("— 2 шт. × 13 стр. [13 листов A5");
    expect(psStaffShortRu(line("calendarPocket", { quantity: 250 }))).toBe("Календарь карманный 100×70 — 250 шт.");
  });
});

describe("UV-DTF stickers", () => {
  const z = [uvStickerZone("s1", 5, 5), uvStickerZone("s2", 10, 4)];
  const l = { kind: "uv", source: "stickers", technique: "transfer", quantity: 20, zones: z };

  it("line shape: film technique, «as is», 2 white + varnish", () => {
    expect(isShopUvStickersLine(l)).toBe(true);
    expect(z[0]).toEqual({ id: "s1", placement: "as_is", widthCm: 5, heightCm: 5, whiteLayers: 2, varnish: true, primer: false });
    expect(isShopUvStickersLine({ ...l, zones: [z[0], z[0]] })).toBe(false);
    expect(isShopUvStickersLine({ ...l, zones: [uvStickerZone("s1", 35, 40)] })).toBe(false);
    expect(uvStickerSizeProblem(29, 90)).toBeNull();
    expect(uvStickerSizeProblem(31, 31)).toBe("too_wide");
    expect(uvStickerSizeProblem(0.5, 3)).toBe("range");
  });

  it("one file per design", () => {
    expect(uvStickersFilesProblem(z, [{ zone: "s1" }, { zone: "s2" }])).toBeNull();
    expect(uvStickersFilesProblem(z, [{ zone: "s1" }])).toBe("required");
    expect(uvStickersFilesProblem(z, [{ zone: "s1" }, { zone: "s2" }, { zone: "s2" }])).toBe("too_many");
  });

  it("staff row", () => {
    expect(uvStickersStaffSummaryRu(l, [{ fileName: "a.png" }, { fileName: "b.png" }])).toBe(
      "Наклейки UV-DTF: 2 дизайна × 20 компл. (5×5, 10×4 см) — плёнка A+B, 2 белых + лак, без переноса; файлы: a.png, b.png",
    );
  });
});
