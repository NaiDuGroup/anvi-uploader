import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { repeatPrintLine } from "@/lib/shop/account/accountRules";
import { parseShopPrintLine, printOptionsText, printStaffSummaryRu, printQtyText, shopPrintFiles, shopPrintFilesProblem } from "@/lib/shop/printLine";
import { canStepQuantity, lineQuantity, parseCart, serializeCart, withQuantity, type CartLine } from "./cart";
import { lineMissingFile } from "./fileRules";
import { SHOP_LANGS, SHOP_STRING_KEYS, shopT } from "./i18n";
import { describeQuoteLine, EMPTY_LINE_LABELS } from "./lineLabels";
import { countPdfPages, isBigPrintFile, printFileKind } from "./printFiles";
import {
  docSheets,
  isShopPrintQuote,
  photoDpi,
  photoLowRes,
  printItemPaperType,
  SHOP_DOC_PRICES,
  SHOP_PHOTO_DEFAULT_FINISH,
  SHOP_PHOTO_SIZES,
  SHOP_PRINT_MAX_FILES,
  SHOP_PRINT_PRICE_TABLE,
  shopPrintPrice,
  type ShopDocItem,
  type ShopPrintQuote,
} from "./printPrices";

const doc = (items: Partial<ShopDocItem>[]): ShopPrintQuote => ({
  kind: "print",
  mode: "doc",
  items: items.map((i) => ({ format: "A4", color: "bw", sides: "one", pages: 1, copies: 1, ...i })),
});
const photo = (items: { size?: string; finish?: "glossy" | "matte"; copies?: number }[]): ShopPrintQuote => ({
  kind: "print",
  mode: "photo",
  items: items.map((i) => ({ size: "10x15", finish: "glossy", copies: 1, ...i })),
});

describe("print price list (PDF pages 6 and 9)", () => {
  it("documents: b/w A4 2 lei a side, duplex 4 a sheet; A3 4 / 8; colour A4 5, A3 10", () => {
    expect(shopPrintPrice(doc([{ pages: 10 }]))?.total).toBe(20);
    expect(shopPrintPrice(doc([{ pages: 10, sides: "two" }]))?.total).toBe(20);
    expect(shopPrintPrice(doc([{ format: "A3", pages: 3 }]))?.total).toBe(12);
    expect(shopPrintPrice(doc([{ format: "A3", pages: 4, sides: "two" }]))?.total).toBe(16);
    expect(shopPrintPrice(doc([{ color: "color", pages: 3 }]))?.total).toBe(15);
    expect(shopPrintPrice(doc([{ color: "color", format: "A3", pages: 1 }]))?.total).toBe(10);
  });

  it("guessed values: colour duplex = 2 × one side (A4 10, A3 20)", () => {
    expect(SHOP_DOC_PRICES.A4.color.two[0]!.priceMdl).toBe(10);
    expect(SHOP_DOC_PRICES.A3.color.two[0]!.priceMdl).toBe(20);
  });

  it("duplex with an odd page count: the last page is one-sided", () => {
    expect(docSheets({ pages: 5, sides: "two" })).toEqual({ one: 1, two: 2 });
    // 2 duplex sheets × 10 + 1 side × 5, × 2 copies.
    expect(shopPrintPrice(doc([{ color: "color", sides: "two", pages: 5, copies: 2 }]))?.total).toBe(50);
  });

  it("copies multiply; quantity = printed pages; per-file totals add up", () => {
    const p = shopPrintPrice(doc([{ pages: 12, copies: 3 }, { pages: 1, color: "color" }]))!;
    expect(p.itemTotals).toEqual([72, 5]);
    expect(p.total).toBe(77);
    expect(p.quantity).toBe(37);
  });

  it("photos by size, mixed sizes in one line", () => {
    const prices = Object.fromEntries(SHOP_PHOTO_SIZES.map((s) => [s.id, s.tiers[0]!.priceMdl]));
    expect(prices).toEqual({
      polaroid: 8,
      "9x13": 6,
      "10x15": 6,
      "13x18": 10,
      "15x21": 15,
      "18x24": 25,
      "21x30": 30,
      "25x30": 35,
      "25x38": 40,
      "30x40": 70,
      "30x45": 70,
    });
    const p = shopPrintPrice(photo([{ copies: 10 }, { size: "13x18", finish: "matte", copies: 2 }, { size: "21x30" }]))!;
    expect(p.itemTotals).toEqual([60, 20, 30]);
    expect(p.total).toBe(110);
    expect(p.quantity).toBe(13);
    expect(SHOP_PHOTO_DEFAULT_FINISH).toBe("glossy");
  });

  it("totals are whole lei", () => {
    for (const q of [doc([{ pages: 7, copies: 3, sides: "two", color: "color" }]), photo([{ size: "polaroid", copies: 7 }])]) {
      const p = shopPrintPrice(q)!;
      expect(Number.isInteger(p.total)).toBe(true);
      p.itemTotals.forEach((v) => expect(Number.isInteger(v)).toBe(true));
    }
  });

  it("a bigger quantity is never cheaper once tiers exist (pooled per price row)", () => {
    const table = {
      ...SHOP_PRINT_PRICE_TABLE,
      photo: { ...SHOP_PRINT_PRICE_TABLE.photo, "10x15": [{ minQty: 1, priceMdl: 6 }, { minQty: 100, priceMdl: 4 }] },
    };
    const at = (n: number) => shopPrintPrice(photo([{ copies: n }]), table)!.total;
    expect(at(99)).toBe(400); // capped by 100 × 4
    expect(at(100)).toBe(400);
    expect(at(80)).toBe(400); // 480 → 400
    expect(at(60)).toBe(360);
    for (let n = 1; n < 150; n++) expect(at(n)).toBeLessThanOrEqual(at(n + 1));
    // Two files of one size share the tier.
    const two = shopPrintPrice(photo([{ copies: 50 }, { copies: 50 }]), table)!;
    expect(two.total).toBe(400);
    expect(two.itemTotals.reduce((s, v) => s + v, 0)).toBe(400);
  });

  it("rejects invalid lines", () => {
    expect(shopPrintPrice(doc([{ pages: 0 }]))).toBeNull();
    expect(shopPrintPrice(photo([{ size: "11x11" }]))).toBeNull();
    expect(isShopPrintQuote({ kind: "print", mode: "doc", items: [] })).toBe(false);
    expect(isShopPrintQuote(doc(Array.from({ length: SHOP_PRINT_MAX_FILES + 1 }, () => ({}))))).toBe(false);
    expect(isShopPrintQuote({ kind: "print", mode: "doc", items: [{ size: "10x15", finish: "glossy", copies: 1 }] })).toBe(false);
  });
});

describe("photo quality at the chosen size", () => {
  it("dpi in either orientation; < 150 dpi warns", () => {
    // 1800×1200 px on 10×15 cm → 304 dpi.
    expect(photoDpi({ width: 1800, height: 1200 }, "10x15")).toBe(305);
    expect(photoLowRes({ width: 1800, height: 1200 }, "10x15")).toBe(false);
    expect(photoLowRes({ width: 1800, height: 1200 }, "30x45")).toBe(true);
    expect(photoLowRes(null, "10x15")).toBe(false);
    // Polaroid: the 7.9×7.9 image window.
    expect(photoDpi({ width: 933, height: 933 }, "polaroid")).toBe(300);
  });
});

describe("page counting and file kinds", () => {
  it("counts PDF pages; a broken PDF answers null (the customer types the count)", async () => {
    const d = await PDFDocument.create();
    for (let i = 0; i < 3; i++) d.addPage();
    expect(await countPdfPages(await d.save())).toBe(3);
    expect(await countPdfPages(new TextEncoder().encode("%PDF-1.7 broken"))).toBeNull();
    expect(await countPdfPages(new Uint8Array())).toBeNull();
  });

  it("an encrypted (password) PDF still gives its page count when the page tree is readable", async () => {
    const d = await PDFDocument.create();
    d.addPage();
    d.addPage();
    d.context.trailerInfo.Encrypt = d.context.obj({ Filter: "Standard", V: 1, R: 2 });
    expect(await countPdfPages(await d.save())).toBe(2);
  });

  it("documents take PDF, Word and images; photos take images only", () => {
    expect(printFileKind({ name: "a.pdf", type: "application/pdf" }, "doc")).toBe("pdf");
    expect(printFileKind({ name: "a.PDF" }, "doc")).toBe("pdf");
    expect(printFileKind({ name: "cv.docx" }, "doc")).toBe("word");
    expect(printFileKind({ name: "scan.jpg", type: "image/jpeg" }, "doc")).toBe("image");
    expect(printFileKind({ name: "a.zip" }, "doc")).toBeNull();
    expect(printFileKind({ name: "IMG_1.HEIC" }, "photo")).toBe("image");
    expect(printFileKind({ name: "a.pdf", type: "application/pdf" }, "photo")).toBeNull();
    expect(isBigPrintFile(201 * 1024 * 1024)).toBe(true);
    expect(isBigPrintFile(10 * 1024 * 1024)).toBe(false);
  });
});

describe("order files (as print.anvi.md stores them)", () => {
  const files = [
    { fileKey: "shop-orders/1-a.pdf", fileName: "a.pdf" },
    { fileKey: "shop-orders/1-b.pdf", fileName: "b.pdf" },
  ];

  it("documents: one File per item with copies, colour, A4/A3 and the page count", () => {
    const q = doc([{ pages: 12, copies: 2, sides: "two" }, { format: "A3", color: "color", pages: 1 }]);
    expect(shopPrintFiles(q, files)).toEqual([
      { fileName: "a.pdf", fileUrl: "shop-orders/1-a.pdf", copies: 2, color: "bw", paperType: "A4", pageCount: 12 },
      { fileName: "b.pdf", fileUrl: "shop-orders/1-b.pdf", copies: 1, color: "color", paperType: "A3", pageCount: 1 },
    ]);
  });

  it("photos: colour, paperType other:<w>x<h>", () => {
    const q = photo([{ copies: 4 }, { size: "21x30" }]);
    expect(shopPrintFiles(q, files).map((f) => [f.paperType, f.color, f.copies])).toEqual([
      ["other:10x15", "color", 4],
      ["other:21x30", "color", 1],
    ]);
    expect(printItemPaperType("photo", { size: "polaroid", finish: "matte", copies: 1 })).toBe("other:8.8x10.7");
  });

  it("files are required, one per item", () => {
    const q = doc([{}, {}]);
    expect(shopPrintFilesProblem(q, [])).toBe("required");
    expect(shopPrintFilesProblem(q, files.slice(0, 1))).toBe("count_mismatch");
    expect(shopPrintFilesProblem(q, files)).toBeNull();
  });

  it("the admin view lists every file with its options and price", () => {
    const t = shopT("ru");
    const q = doc([{ pages: 12, copies: 2, sides: "two" }, { format: "A3", color: "color", pages: 1 }]);
    const parsed = parseShopPrintLine(
      { kind: "print", quote: q, printItems: [{ fileName: "a.pdf", fileKey: "k1", total: 48 }, { fileName: "b.pdf", fileKey: "k2", total: 10 }] },
      t,
    );
    expect(parsed?.rows).toEqual([
      { fileName: "a.pdf", text: "A4 · Ч/б · Двусторонняя · 12 стр. × 2", total: 48, pagesByCustomer: false },
      { fileName: "b.pdf", text: "A3 · Цветная · Односторонняя · 1 стр. × 1", total: 10, pagesByCustomer: false },
    ]);
    expect(parseShopPrintLine({ kind: "mug", quote: {} }, t)).toBeNull();
    const ph = parseShopPrintLine({ kind: "print", quote: photo([{ finish: "matte", copies: 3 }]) }, t);
    expect(ph?.rows[0]).toEqual({ fileName: "#1", text: "10×15 · Матовая × 3", total: null, pagesByCustomer: false });
  });

  it("the Russian staff texts: grouped options, printed pages, one summary", () => {
    const t = shopT("ru");
    const q = doc([{ pages: 12, copies: 2 }, { pages: 3 }, { color: "color", sides: "two", pages: 4 }]);
    expect(printOptionsText(q, t)).toBe(
      "A4 · Ч/б · Односторонняя: 2 файла, 27 стр. к печати; A4 · Цветная · Двусторонняя: 1 файл, 4 стр. к печати",
    );
    expect(printQtyText(q, t)).toBe("31 стр. к печати");
    expect(printStaffSummaryRu(q)).toBe("Печать документов: 3 файла, 31 стр. (A4 ч/б ×27, A4 цвет 2-стор. ×4)");
    expect(printStaffSummaryRu(q, { short: true, customerPages: 1 })).toBe(
      "Печать документов: 3 файла, 31 стр. — стр. указаны клиентом (1 из 3)",
    );
    expect(printStaffSummaryRu(photo([{ copies: 3 }, { size: "30x45", finish: "matte", copies: 2 }]))).toBe(
      "Фотопечать: 5 фото (10×15 ×3, 30×45 мат ×2)",
    );
    expect(printQtyText(photo([{ copies: 2 }, { copies: 3 }]), t)).toBe("5 фото");
  });
});

describe("cart and languages", () => {
  const line = (quote: ShopPrintQuote, n = quote.items.length): CartLine => ({
    id: "l1",
    slug: "printare",
    title: "Printare documente",
    optionsText: "",
    image: null,
    quote,
    files: Array.from({ length: n }, (_, i) => ({ fileKey: `uploads/1762250000000-x-${i}.pdf`, fileName: `${i}.pdf`, pages: 3 })),
    addedAt: 1,
  });

  it("a stored print line survives the cart round trip; a malformed one is dropped", () => {
    const l = line(doc([{ pages: 3 }]));
    expect(parseCart(serializeCart([l]))).toEqual([{ ...l, lastTotal: null }]);
    const bad = { ...l, quote: { kind: "print", mode: "doc", items: [{ format: "A5", color: "bw", sides: "one", pages: 1, copies: 1 }] } };
    expect(parseCart(JSON.stringify({ v: 1, lines: [bad] }))).toEqual([]);
  });

  it("no quantity stepper; the quantity is the file count; a missing file is flagged", () => {
    const l = line(doc([{}, {}]));
    expect(canStepQuantity(l.quote)).toBe(false);
    expect(lineQuantity(l.quote)).toBe(2);
    expect(withQuantity(l.quote, 9)).toBe(l.quote);
    expect(lineMissingFile(l)).toBe(false);
    expect(lineMissingFile(line(doc([{}, {}]), 1))).toBe(true);
    expect(lineMissingFile(line(doc([{}]), 0))).toBe(true);
  });

  it("is named in every language without the catalog", () => {
    const names = SHOP_LANGS.map((lang) => describeQuoteLine(photo([{ copies: 2 }]), EMPTY_LINE_LABELS, shopT(lang)));
    expect(names.map((n) => n?.title)).toEqual(["Printare foto", "Фотопечать", "Photo printing"]);
    expect(names.map((n) => n?.optionsText)).toEqual(["10×15 · Lucioasă × 2", "10×15 · Глянцевая × 2", "10×15 · Glossy × 2"]);
    expect(describeQuoteLine(doc([{}]), EMPTY_LINE_LABELS, shopT("en"))?.slug).toBe("printare");
  });

  it("every print string exists in ro, ru and en and is translated", () => {
    const keys = SHOP_STRING_KEYS.filter((k) => k.startsWith("print"));
    expect(keys.length).toBeGreaterThan(30);
    for (const lang of SHOP_LANGS) {
      const t = shopT(lang);
      for (const k of keys) expect(t(k)).not.toBe(k);
    }
    const ro = shopT("ro");
    const ru = shopT("ru");
    for (const k of keys) expect(ru(k)).not.toBe(ro(k));
  });
});

describe("«Repetă comanda» of a print line", () => {
  const q = photo([{ copies: 2 }, { size: "13x18" }, { size: "21x30" }]);
  const items = [
    { fileName: "a.jpg", fileKey: "shop-orders/1-a.jpg", total: 12 },
    { fileName: "b.jpg", fileKey: "shop-orders/1-b.jpg", total: 10 },
    { fileName: "c.jpg", fileKey: "shop-orders/1-c.jpg", total: 30 },
  ];
  const row = (k: string, name: string, metaStatus: string | null = null) => ({ fileUrl: k, fileName: name, paperType: null, sizeBytes: 10, metaStatus });

  it("keeps the files in item order whatever the row order", () => {
    const r = repeatPrintLine(q as Extract<typeof q, { mode: "photo" }>, items, [
      row("shop-orders/1-c.jpg", "c.jpg"),
      row("shop-orders/1-a.jpg", "a.jpg"),
      row("shop-orders/1-b.jpg", "b.jpg"),
    ])!;
    expect(r.files.map((f) => f.fileName)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(r.quote).toEqual(q);
    expect(r.missingFiles).toEqual([]);
  });

  it("drops an item whose file is gone and names it; null when none is left", () => {
    const r = repeatPrintLine(q as Extract<typeof q, { mode: "photo" }>, items, [
      row("shop-orders/1-a.jpg", "a.jpg"),
      row("shop-orders/1-b.jpg", "b.jpg", "missing"),
      row("shop-orders/1-c.jpg", "c.jpg"),
    ])!;
    expect(r.quote.items.map((i) => (i as { size: string }).size)).toEqual(["10x15", "21x30"]);
    expect(r.missingFiles).toEqual(["b.jpg"]);
    expect(repeatPrintLine(q as Extract<typeof q, { mode: "photo" }>, items, [])).toBeNull();
  });
});
