import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  stockVariant: { findMany: vi.fn() },
  stockItem: { findMany: vi.fn() },
  printPricePreset: { findMany: vi.fn() },
  order: { update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db, HEAVY_TX_OPTIONS: {} }));

const create = vi.hoisted(() => ({
  resolveOrderLines: vi.fn(),
  createOrderWithResolvedLines: vi.fn(),
}));
vi.mock("@/lib/orderCreate/orderLines", () => create);
vi.mock("@/lib/findClientByOrderPhone", () => ({ findClientIdByOrderPhone: vi.fn(async () => null) }));
const files = vi.hoisted(() => ({ copyUploadToShopOrders: vi.fn(), readShopFileIfSmall: vi.fn() }));
vi.mock("./shopFiles", () => files);
vi.mock("./account/customers", () => ({ findOrCreateShopCustomer: vi.fn(async () => ({ id: "cust-1" })) }));
vi.mock("./account/data", () => ({ ownsReusableShopFile: vi.fn(async () => false) }));
vi.mock("@/lib/mug/mugVariant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mug/mugVariant")>()),
  loadMugVariant: vi.fn(async () => ({ id: "m-1", sellPrice: 100 })),
}));
vi.mock("@/lib/storefront/lineLabelsServer", () => ({ loadShopLineLabels: vi.fn(async () => null) }));

import { quotePublicLines } from "@/lib/publicQuote/publicQuote";
import { parsePublicQuoteLine } from "@/lib/publicQuote/publicQuoteSchema";
import { PDFDocument } from "pdf-lib";
import { shopPrintPrice, type ShopPrintQuote } from "@/lib/storefront/printPrices";
import { priceShopCheckout, runShopCheckout } from "./checkout";

const DEV = { NODE_ENV: "development" };
const key = (i: number, ext = "pdf") => `uploads/1762250000000-abcdef${String(i).padStart(2, "0")}-f${i}.${ext}`;

async function pdfWithPages(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([200, 200]);
  return doc.save();
}

/** Stored PDFs by key (`shop-orders/…`): their real page counts. */
let storedPages: Record<string, number | "big"> = {};

const DOC: ShopPrintQuote = {
  kind: "print",
  mode: "doc",
  items: [
    { format: "A4", color: "bw", sides: "two", pages: 12, copies: 2 },
    { format: "A3", color: "color", sides: "one", pages: 1, copies: 1 },
  ],
};
const PHOTO: ShopPrintQuote = {
  kind: "print",
  mode: "photo",
  items: [
    { size: "10x15", finish: "glossy", copies: 10 },
    { size: "13x18", finish: "matte", copies: 2 },
  ],
};

function body(quote: unknown, n: number, over: Record<string, unknown> = {}, ext?: string) {
  const e: string = ext ?? ((quote as { mode?: string }).mode === "photo" ? "jpg" : "pdf");
  return {
    locale: "ro",
    customer: { name: "Ion Popescu", phone: "+373 69 123 456" },
    delivery: { method: "courier_moldova", city: "Bălți", address: "str. Independenței 5" },
    lines: [
      {
        quote,
        files: Array.from({ length: n }, (_, i) => ({ fileKey: key(i, e), fileName: `f${i}.${e}`, sizeBytes: 1000 })),
        title: "Printare documente",
        total: 1,
      },
    ],
    acceptTerms: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  files.copyUploadToShopOrders.mockImplementation(async (k: string) => k.replace(/^uploads\//, "shop-orders/"));
  create.resolveOrderLines.mockImplementation(async (inputs: unknown[]) => ({ resolved: inputs.map((input) => ({ input })), lfLineTotalsMdl: new Map() }));
  create.createOrderWithResolvedLines.mockImplementation(async () => ({ id: "o-1", orderNumber: 77, publicToken: "tok" }));
  db.stockVariant.findMany.mockResolvedValue([]);
  // By default every stored PDF has the pages the customer declared (DOC: 12 and 1).
  storedPages = { [key(0).replace("uploads/", "shop-orders/")]: 12, [key(1).replace("uploads/", "shop-orders/")]: 1 };
  files.readShopFileIfSmall.mockImplementation(async (k: string) => {
    const n = storedPages[k];
    if (n == null) return null;
    if (n === "big") return { tooBig: true };
    return { bytes: await pdfWithPages(n) };
  });
});

describe("print lines — server parity", () => {
  it("the public quote prices print lines from the same module as the page", async () => {
    const r = await quotePublicLines([DOC, PHOTO], "ro");
    expect(r.lines).toEqual([
      { ok: true, kind: "print", quantity: 25, unitPrice: 2.32, total: shopPrintPrice(DOC)!.total, currency: "MDL" },
      { ok: true, kind: "print", quantity: 12, unitPrice: 6.67, total: shopPrintPrice(PHOTO)!.total, currency: "MDL" },
    ]);
    expect(shopPrintPrice(DOC)!.total).toBe(58); // 6 duplex sheets × 4 lei × 2 copies + A3 colour 10
    expect(shopPrintPrice(PHOTO)!.total).toBe(80);
    expect(r.subtotal).toBe(138);
  });

  it("rejects items of the other mode, unknown sizes and too many files", () => {
    expect(parsePublicQuoteLine({ kind: "print", mode: "doc", items: [PHOTO.items[0]] })).toEqual({ ok: false, code: "print_item_mode" });
    expect(parsePublicQuoteLine({ kind: "print", mode: "photo", items: [{ size: "11x11", finish: "glossy", copies: 1 }] }).ok).toBe(false);
    expect(parsePublicQuoteLine({ kind: "print", mode: "doc", items: Array.from({ length: 51 }, () => DOC.items[0]) }).ok).toBe(false);
    expect(parsePublicQuoteLine({ ...DOC, extra: 1 }).ok).toBe(false);
  });

  it("the checkout re-prices and ignores the client total", async () => {
    const p = await priceShopCheckout(body(DOC, 2), DEV);
    expect(p.ok && p.subtotal).toBe(58);
  });
});

describe("print lines — checkout", () => {
  it("creates one paper_print line with one File per item (copies, colour, format, pages)", async () => {
    const res = await runShopCheckout(body(DOC, 2), DEV);
    expect(res.status).toBe(201);
    const inputs = create.resolveOrderLines.mock.calls[0]![0];
    expect(inputs).toEqual([
      {
        customerType: "retail",
        productType: "paper_print",
        files: [
          { fileName: "f0.pdf", fileUrl: key(0).replace("uploads/", "shop-orders/"), copies: 2, color: "bw", paperType: "A4", pageCount: 12 },
          { fileName: "f1.pdf", fileUrl: key(1).replace("uploads/", "shop-orders/"), copies: 1, color: "color", paperType: "A3", pageCount: 1 },
        ],
      },
    ]);
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.order.price.toString()).toBe("118"); // 58 + courier Moldova 60
    expect(args.order.deliveryMethod).toBe("courier_moldova");
  });

  it("stores each file's name and price for the admin, and one Russian summary in the staff note", async () => {
    await runShopCheckout(body(PHOTO, 2, { locale: "en" }), DEV);
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    const data = args.shopLineData[0];
    expect(data.kind).toBe("print");
    expect(data.printItems).toEqual([
      { fileName: "f0.jpg", fileKey: key(0, "jpg").replace("uploads/", "shop-orders/"), total: 60 },
      { fileName: "f1.jpg", fileKey: key(1, "jpg").replace("uploads/", "shop-orders/"), total: 20 },
    ]);
    // One summary, no per-file list (the File rows and the admin summary have it).
    expect(args.order.notes).toContain("1) Фотопечать: 12 фото (10×15 ×10, 13×18 мат ×2)");
    expect(args.order.notes).not.toContain("f0.jpg");
    expect(args.order.notes.length).toBeLessThanOrEqual(500);
    const inputs = create.resolveOrderLines.mock.calls[0]![0];
    expect(inputs[0].files.map((f: { paperType: string; color: string }) => [f.paperType, f.color])).toEqual([
      ["other:10x15", "color"],
      ["other:13x18", "color"],
    ]);
  });

  it("requires one file per item", async () => {
    let res = await runShopCheckout(body(DOC, 0), DEV);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toEqual({ "lines.0.files": "required" });
    res = await runShopCheckout(body(DOC, 1), DEV);
    expect(res.body.fieldErrors).toEqual({ "lines.0.files": "count_mismatch" });
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
  });

  it("takes 50 files on a print line; other kinds keep 20", async () => {
    const many: ShopPrintQuote = { kind: "print", mode: "photo", items: Array.from({ length: 50 }, () => PHOTO.items[0]!) };
    const res = await runShopCheckout(body(many, 50), DEV);
    expect(res.status).toBe(201);
    expect(files.copyUploadToShopOrders).toHaveBeenCalledTimes(50);
    expect(create.resolveOrderLines.mock.calls[0]![0][0].files).toHaveLength(50);
    // Order kept although copies run in parallel.
    expect(create.resolveOrderLines.mock.calls[0]![0][0].files[49].fileName).toBe("f49.jpg");
    const mug = await runShopCheckout(body({ kind: "mug", productId: "m-1", quantity: 1 }, 21), DEV);
    expect(mug.status).toBe(400);
    expect(mug.body.fieldErrors).toEqual({ "lines.0.files": "too_big" });
    const tooMany = await runShopCheckout(body(many, 51), DEV);
    expect(tooMany.status).toBe(400);
  });

  it("a missing upload stops the order", async () => {
    files.copyUploadToShopOrders.mockImplementation(async (k: string) => (k === key(1) ? null : k.replace(/^uploads\//, "shop-orders/")));
    const res = await runShopCheckout(body(DOC, 2), DEV);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "file_not_found", index: 0, fileKey: key(1) });
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
  });
});

describe("print lines — the server counts the pages", () => {
  const out = (i: number, ext = "pdf") => key(i, ext).replace("uploads/", "shop-orders/");
  const THREE: ShopPrintQuote = {
    kind: "print",
    mode: "doc",
    items: [1, 1, 1].map((pages) => ({ format: "A4" as const, color: "color" as const, sides: "one" as const, pages, copies: 1 })),
  };

  it("a crafted «1 page» for 3/5/7-page PDFs: 409 price_changed with the real pages and total, no order", async () => {
    storedPages = { [out(0)]: 3, [out(1)]: 5, [out(2)]: 7 };
    const res = await runShopCheckout(body(THREE, 3, { delivery: { method: "pickup" } }), DEV);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: "price_changed",
      reason: "print_pages",
      lines: [{ index: 0, pages: [3, 5, 7], counted: [true, true, true], total: 75 }],
      subtotal: 75,
      deliveryPrice: 0,
      total: 75,
    });
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
  });

  it("the confirmed retry (declared = real) creates the order with the real File.pageCount", async () => {
    storedPages = { [out(0)]: 3, [out(1)]: 5, [out(2)]: 7 };
    const real = { ...THREE, items: THREE.items.map((it, i) => ({ ...it, pages: [3, 5, 7][i]! })) } as ShopPrintQuote;
    const res = await runShopCheckout(body(real, 3, { delivery: { method: "pickup" } }), DEV);
    expect(res.status).toBe(201);
    const inputs = create.resolveOrderLines.mock.calls[0]![0];
    expect(inputs[0].files.map((f: { pageCount: number }) => f.pageCount)).toEqual([3, 5, 7]);
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.order.price.toString()).toBe("75");
    expect(args.order.notes).toContain("1) Печать документов: 3 файла, 15 стр. (A4 цвет ×15)");
    expect(args.order.notes).not.toContain("указаны клиентом");
    expect(args.shopLineData[0].printItems.every((r: { pagesBy?: string }) => r.pagesBy == null)).toBe(true);
  });

  it("an image in a document line is one page", async () => {
    const q: ShopPrintQuote = { kind: "print", mode: "doc", items: [{ format: "A4", color: "bw", sides: "one", pages: 4, copies: 1 }] };
    const res = await runShopCheckout(body(q, 1, { delivery: { method: "pickup" } }, "png"), DEV);
    expect(res.status).toBe(409);
    expect(res.body.lines).toEqual([{ index: 0, pages: [1], counted: [true], total: 2 }]);
  });

  it("Word files and PDFs too big to read keep the declared pages, flagged for staff", async () => {
    storedPages = { [out(1)]: "big" };
    const q: ShopPrintQuote = {
      kind: "print",
      mode: "doc",
      items: [
        { format: "A4", color: "bw", sides: "one", pages: 9, copies: 1 },
        { format: "A4", color: "bw", sides: "one", pages: 40, copies: 1 },
      ],
    };
    const b = body(q, 2, { delivery: { method: "pickup" } });
    b.lines[0]!.files[0] = { fileKey: key(0, "docx"), fileName: "f0.docx", sizeBytes: 1000 };
    const res = await runShopCheckout(b, DEV);
    expect(res.status).toBe(201);
    expect(files.readShopFileIfSmall).toHaveBeenCalledTimes(1); // the .docx is never read
    const inputs = create.resolveOrderLines.mock.calls[0]![0];
    expect(inputs[0].files.map((f: { pageCount: number }) => f.pageCount)).toEqual([9, 40]);
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.shopLineData[0].printItems.map((r: { pagesBy?: string }) => r.pagesBy)).toEqual(["customer", "customer"]);
    expect(args.order.notes).toContain("1) Печать документов: 2 файла, 49 стр. (A4 ч/б ×49) — стр. указаны клиентом");
  });

  it("checks the file types per mode: photos are images, documents PDF / Word / images", async () => {
    let res = await runShopCheckout(body(PHOTO, 2, {}, "pdf"), DEV);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toEqual({ "lines.0.files": "file_type" });
    res = await runShopCheckout(body(DOC, 2, {}, "zip"), DEV);
    expect(res.body.fieldErrors).toEqual({ "lines.0.files": "file_type" });
    // A «photo.jpg» name on a stored PDF key is refused too.
    const b = body(PHOTO, 2);
    b.lines[0]!.files[0] = { fileKey: key(0, "pdf"), fileName: "f0.jpg", sizeBytes: 1000 };
    res = await runShopCheckout(b, DEV);
    expect(res.body.fieldErrors).toEqual({ "lines.0.files": "file_type" });
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
  });
});
