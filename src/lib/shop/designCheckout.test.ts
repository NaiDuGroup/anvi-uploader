import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  order: { update: vi.fn() },
  stockVariant: { findMany: vi.fn(async () => [] as unknown[]) },
  stockItem: { findMany: vi.fn(async () => [] as unknown[]) },
  printPricePreset: { findMany: vi.fn(async () => [] as unknown[]) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db, HEAVY_TX_OPTIONS: {} }));
const quote = vi.hoisted(() => ({ quotePublicLines: vi.fn() }));
vi.mock("@/lib/publicQuote/publicQuote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/publicQuote/publicQuote")>()),
  quotePublicLines: quote.quotePublicLines,
}));
const create = vi.hoisted(() => ({ resolveOrderLines: vi.fn(), createOrderWithResolvedLines: vi.fn() }));
vi.mock("@/lib/orderCreate/orderLines", () => create);
vi.mock("@/lib/findClientByOrderPhone", () => ({ findClientIdByOrderPhone: vi.fn() }));
const files = vi.hoisted(() => ({ copyUploadToShopOrders: vi.fn() }));
vi.mock("./shopFiles", () => files);
vi.mock("./account/customers", () => ({ findOrCreateShopCustomer: vi.fn(async () => null) }));
vi.mock("./account/data", () => ({ ownsReusableShopFile: vi.fn(async () => false) }));
vi.mock("@/lib/storefront/lineLabelsServer", () => ({ loadShopLineLabels: vi.fn(async () => null) }));

import { mugLayoutDataSchema, notebookLayoutDataSchema, penLayoutDataSchema } from "@/lib/validations";
import { checkoutLine, parseCart, serializeCart, type CartLine } from "@/lib/storefront/cart";
import { designCartLine, type ShopDesignLayout } from "@/lib/storefront/design";
import { runShopCheckout } from "./checkout";
import { shopCheckoutRequestSchema } from "./checkoutSchema";
import { applyShopDesign, designFilePaperType, shopLineDesignSchema } from "./designLine";

const FILE = "uploads/1762250000000-abcdefgh-mug-layout-1.png";
const PHOTO = "uploads/1762250000001-ijklmnop-mug-photo-1.jpg";

const LAYOUT: ShopDesignLayout = {
  templateId: "photo-text",
  text: "La mulți ani!",
  fontFamily: "Lobster",
  textColor: "#000000",
  backgroundColor: "transparent",
  photoUrls: [PHOTO],
  photoSettings: [{ fitMode: "cover", alignment: "center", verticalAlignment: "center", naturalWidth: 1200, naturalHeight: 800 }],
};

function editorLine(kind: "mug" | "notebook" | "pen" = "mug"): CartLine {
  return designCartLine({
    kind,
    slug: "cana-alba",
    variantId: "11111111-2222-4333-8444-555555555555",
    quantity: 2,
    file: { fileKey: FILE, fileName: "mug-layout-1.png", sizeBytes: 123456 },
    layout: LAYOUT,
    preview: "data:image/jpeg;base64,AAAA",
    title: "Cană albă",
    optionsText: "Alb",
    image: "/img/mug.jpg",
    lastTotal: 300,
    id: "line-1",
    addedAt: 1,
  });
}

function checkoutBody(lines: unknown[]) {
  return {
    locale: "ro",
    customer: { name: "Ion", phone: "069123456" },
    delivery: { method: "pickup" },
    lines,
    acceptTerms: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  quote.quotePublicLines.mockResolvedValue({
    currency: "MDL",
    lines: [{ ok: true, kind: "mug", quantity: 2, unitPrice: 150, total: 300, currency: "MDL" }],
    subtotal: 300,
  });
  files.copyUploadToShopOrders.mockImplementation(async (k: string) => k.replace(/^uploads\//, "shop-orders/"));
  create.resolveOrderLines.mockImplementation(async (inputs: unknown[]) => ({
    resolved: inputs.map((input) => ({ input })),
    lfLineTotalsMdl: new Map(),
  }));
  create.createOrderWithResolvedLines.mockResolvedValue({ id: "o-1", orderNumber: 7, publicToken: "tok" });
});

describe("editor design → cart line", () => {
  it("is a normal mug line with the print file, layout and thumbnail", () => {
    const l = editorLine();
    expect(l.quote).toEqual({ kind: "mug", productId: "11111111-2222-4333-8444-555555555555", quantity: 2 });
    expect(l.files).toEqual([{ fileKey: FILE, fileName: "mug-layout-1.png", sizeBytes: 123456 }]);
    expect(l.image).toBe("data:image/jpeg;base64,AAAA");
    expect(l.design).toEqual({ editor: "mug", layout: LAYOUT, preview: "data:image/jpeg;base64,AAAA" });
  });

  it("falls back to the product photo without a (too big) preview", () => {
    const l = designCartLine({ ...editorLineArgs(), preview: `data:image/jpeg;base64,${"A".repeat(90_000)}` });
    expect(l.image).toBe("/img/mug.jpg");
    expect(l.design.preview).toBeUndefined();
  });

  it("survives localStorage (serialize → parse) and drops a malformed design but keeps the line", () => {
    const l = editorLine();
    expect(parseCart(serializeCart([l]))).toEqual([{ ...l }]);
    const broken = { ...l, design: { editor: "mug", layout: { templateId: "x" } } };
    const [back] = parseCart(JSON.stringify({ v: 1, lines: [broken] }));
    expect(back!.design).toBeUndefined();
    expect(back!.files).toHaveLength(1);
    // A design of another kind than the line is ignored.
    const wrongKind = { ...l, design: { ...l.design, editor: "pen" } };
    expect(parseCart(JSON.stringify([wrongKind]))[0]!.design).toBeUndefined();
  });

  it("sends the layout (not the thumbnail) to the checkout", () => {
    const body = checkoutLine(editorLine());
    expect(body.design).toEqual({ editor: "mug", layout: LAYOUT });
    expect(JSON.stringify(body)).not.toContain("data:image");
    expect(shopCheckoutRequestSchema.safeParse(checkoutBody([body])).success).toBe(true);
  });
});

function editorLineArgs() {
  return {
    kind: "mug" as const,
    slug: "cana-alba",
    variantId: "v-1",
    quantity: 1,
    file: { fileKey: FILE, fileName: "a.png" },
    layout: LAYOUT,
    preview: null as string | null,
    title: "Cană",
    optionsText: "",
    image: "/img/mug.jpg",
    lastTotal: null,
    id: "l",
    addedAt: 0,
  };
}

describe("checkout design schema", () => {
  it("accepts the studio layout and gives what the studio validator accepts", () => {
    const parsed = shopLineDesignSchema.parse({ editor: "mug", layout: LAYOUT });
    expect(mugLayoutDataSchema.safeParse(parsed.layout).success).toBe(true);
    expect(notebookLayoutDataSchema.safeParse(parsed.layout).success).toBe(true);
    expect(penLayoutDataSchema.safeParse(parsed.layout).success).toBe(true);
  });

  it("refuses photo keys that are not order uploads", () => {
    for (const key of ["shop-orders/1762250000000-x.jpg", "catalog/mug.png", "uploads/../secret", "https://x.example/a.jpg"]) {
      expect(shopLineDesignSchema.safeParse({ editor: "mug", layout: { ...LAYOUT, photoUrls: [key] } }).success).toBe(false);
    }
    expect(shopLineDesignSchema.safeParse({ editor: "tshirt", layout: LAYOUT }).success).toBe(false);
  });
});

describe("applyShopDesign", () => {
  const base = {
    customerType: "retail" as const,
    files: [{ fileName: "a.png", fileUrl: "shop-orders/1-a.png", copies: 2, color: "color" as const }],
  };
  it("puts the layout on the line and the editor paper type on its file, per kind", () => {
    const design = shopLineDesignSchema.parse({ editor: "notebook", layout: LAYOUT });
    const out = applyShopDesign({ ...base, productType: "notebook", notebookProductId: "n" }, design);
    expect(out.notebookLayoutData).toEqual(design.layout);
    expect(out.files[0]!.paperType).toBe("notebook_layout");
    expect(designFilePaperType("pen")).toBe("pen_layout");
  });
  it("leaves lines without a design (or of another kind) unchanged", () => {
    const input = { ...base, productType: "mug" as const, mugProductId: "m" };
    expect(applyShopDesign(input, undefined)).toBe(input);
    expect(applyShopDesign(input, shopLineDesignSchema.parse({ editor: "pen", layout: LAYOUT }))).toBe(input);
  });
});

describe("runShopCheckout with an editor line", () => {
  it("creates the order line like the studio editor: mug_layout file + mugLayoutData", async () => {
    const res = await runShopCheckout(checkoutBody([checkoutLine(editorLine())]), { NODE_ENV: "development" });
    expect(res.status).toBe(201);
    const [input] = create.resolveOrderLines.mock.calls[0]![0];
    expect(input).toMatchObject({
      productType: "mug",
      mugProductId: "11111111-2222-4333-8444-555555555555",
      mugLayoutData: { ...LAYOUT },
      files: [{ fileName: "mug-layout-1.png", fileUrl: "shop-orders/1762250000000-abcdefgh-mug-layout-1.png", copies: 2, color: "color", paperType: "mug_layout" }],
    });
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.shopLineData[0]).toMatchObject({ kind: "mug", editor: "mug" });
  });

  it("an uploaded-file line stays as before (no layout, no paper type)", async () => {
    const { design: _d, ...plain } = editorLine();
    void _d;
    await runShopCheckout(checkoutBody([checkoutLine(plain)]), { NODE_ENV: "development" });
    const [input] = create.resolveOrderLines.mock.calls[0]![0];
    expect(input.mugLayoutData).toBeUndefined();
    expect(input.files[0].paperType).toBeUndefined();
  });
});
