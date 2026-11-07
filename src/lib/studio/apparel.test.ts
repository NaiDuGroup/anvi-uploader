import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {}, HEAVY_TX_OPTIONS: {} }));
import { dtfZoneFilePaperType } from "@/lib/dtf/dtfConstants";
import { DEFAULT_DTF_SETTINGS } from "@/lib/dtf/dtfSettings";
import { CATALOG, LOGO, A4, A5, WHITE_SHIRT } from "@/lib/dtf/dtfTestFixtures";
import { cmToPx } from "@/lib/printDimensions";
import { shopLineFiles } from "@/lib/shop/checkout";
import { applyShopDesign, shopDesignApprovalProblem, shopLineDesignSchema } from "@/lib/shop/designLine";
import { shopCheckoutRequestSchema } from "@/lib/shop/checkoutSchema";
import { checkoutLine, parseCart, serializeCart } from "@/lib/storefront/cart";
import { isShopEditorKind, isStudioQuoteKind, parseLineDesign, studioEditorPath } from "@/lib/storefront/design";
import { CAP_ZONE_NOTE } from "@/lib/storefront/dtfPrint";
import type { ShopProduct } from "@/lib/storefront/types";
import {
  APPAREL_GARMENTS,
  apparelDesignCartLine,
  apparelEstimate,
  apparelFormatsOfDoc,
  apparelGarment,
  apparelNextStep,
  apparelQuoteLine,
  apparelSelectionOfQuote,
  apparelSurfaceSpecs,
  apparelUsedZones,
  apparelZoneDelta,
  apparelZoneFormats,
  apparelClampSizes,
  apparelStartSizes,
  isApparelProduct,
  isApparelSampleText,
  APPAREL_SAMPLE_TEXTS,
  parseApparelDraftState,
  type ApparelPricing,
} from "./apparel";
import { APPAREL_REFERENCE, CAP_LOGO_BOTTOM_CM, apparelCanvasBackdrop, apparelPrintBox, apparelViews } from "./apparelMockup";
import { capHeightMm, evaluateApparelQuality, hasOpaqueEdges, removeFlatBackground } from "./apparelQuality";
import { addLayer, emptyStudioDoc, type StudioDoc, type StudioImageLayer, type StudioShapeLayer, type StudioTextLayer } from "./document";
import { isStudioApparelEnabled, isStudioEditorEnabled, isStudioFlyerEnabled } from "./flag";
import { surfaceBase } from "./surfaces";

// ─── Fixtures ────────────────────────────────────────────────────────────

const prints = CATALOG.presets.map((p) => ({ presetId: p.id, label: p.label, widthCm: p.widthCm, heightCm: p.heightCm, price: p.retailPrice }));

const color = (key: string, garmentId: string, sizes: string[], sizeStock: Record<string, number> = {}) => ({
  key,
  label: key,
  hex: "#ffffff",
  garmentId,
  images: [],
  sizes,
  itemPrice: 100,
  sizeStock,
});

const SHIRT: ShopProduct = {
  slug: "tricou-dogo",
  category: "tricouri",
  name: "Tricou DOGO",
  subtitle: "",
  description: "",
  badge: null,
  fromPrice: 200,
  unitFrom: null,
  image: null,
  available: true,
  mode: "dtf",
  simpleKind: null,
  variants: [],
  dtf: {
    garment: "tshirt",
    colors: [color("CA6502-01", WHITE_SHIRT.id, ["S", "M", "L"], { S: 0, M: 5, L: 2 })],
    prints,
    itemZones: [],
    fixedZone: null,
    printDiscount: null,
    pressFeeMdl: 0,
  },
  editorHref: null,
  printAreaCm: null,
};

const POLO: ShopProduct = { ...SHIRT, slug: "polo-austral", name: "Polo AUSTRAL" };
const CAP_ID = `${"00000000-0000-4000-8000-000000000077"}:black`;
const CAP: ShopProduct = {
  ...SHIRT,
  slug: "sapca-eris",
  name: "Șapcă ERIS",
  dtf: { ...SHIRT.dtf!, garment: "cap", colors: [color("GO70199002", CAP_ID, ["—"])], prints: [], fixedZone: { widthCm: 9, heightCm: 5 } },
};

const PRICING: ApparelPricing = {
  presets: CATALOG.presets.map((p) => ({ id: p.id, label: p.label, widthCm: p.widthCm, heightCm: p.heightCm, retailPrice: p.retailPrice, dealerPrice: null })),
  settings: DEFAULT_DTF_SETTINGS,
  garments: [
    WHITE_SHIRT,
    {
      ...WHITE_SHIRT,
      id: CAP_ID,
      kind: "cap",
      categoryCode: "caps",
      includedPrint: { widthCm: 9, heightCm: 5 },
      maxPrint: { widthCm: 9, heightCm: 5 },
      variants: [{ id: "cap-v", size: "—", sortOrder: 0, stockQuantity: 9, unitCostMdl: null, priceTiers: [{ minQty: 1, priceMdl: 180 }, { minQty: 2, priceMdl: 150 }, { minQty: 10, priceMdl: 118 }] }],
    },
  ],
};

const tee = apparelGarment("tricou-dogo")!;
const polo = apparelGarment("polo-austral")!;
const cap = apparelGarment("sapca-eris")!;

function text(over: Partial<StudioTextLayer> = {}): StudioTextLayer {
  return { id: "t1", kind: "text", x: 40, y: 40, w: 100, h: 20, rotation: 0, text: "ANVI", fontFamily: "Montserrat", bold: true, sizePt: 40, color: "#000000", align: "center", lineHeight: 1.2, ...over };
}

function docWith(specs: ReturnType<typeof apparelSurfaceSpecs>, layers: Partial<Record<string, StudioDoc["surfaces"][number]["layers"]>>): StudioDoc {
  let d = emptyStudioDoc("apparel", specs.map(surfaceBase));
  for (const [id, ls] of Object.entries(layers)) for (const l of ls ?? []) d = addLayer(d, id, l);
  return d;
}

// ─── Gate ────────────────────────────────────────────────────────────────

describe("apparel gate", () => {
  it("opens only with SHOP_STUDIO_APPAREL=1 or for staff / testers — no other Studio flag opens it", () => {
    expect(isStudioApparelEnabled({})).toBe(false);
    expect(isStudioApparelEnabled({ SHOP_STUDIO_EDITOR: "1", SHOP_STUDIO_FLYER: "1", SHOP_STUDIO_CARD: "1" })).toBe(false);
    expect(isStudioApparelEnabled({ SHOP_STUDIO_APPAREL: "1" })).toBe(true);
    expect(isStudioApparelEnabled({}, { tester: true })).toBe(true);
    expect(isStudioEditorEnabled({ SHOP_STUDIO_APPAREL: "1" })).toBe(false);
    expect(isStudioFlyerEnabled({ SHOP_STUDIO_APPAREL: "1" })).toBe(false);
  });

  it("is configured for the three DTF garments, matched to the shop product family", () => {
    expect(APPAREL_GARMENTS.map((g) => [g.slug, g.shape])).toEqual([
      ["tricou-dogo", "tshirt"],
      ["polo-austral", "polo"],
      ["sapca-eris", "cap"],
    ]);
    expect(isApparelProduct(SHIRT)).toBe(true);
    expect(isApparelProduct(CAP)).toBe(true);
    expect(isApparelProduct({ ...CAP, dtf: { ...CAP.dtf!, garment: "tshirt" } })).toBe(false);
    expect(isApparelProduct({ ...SHIRT, slug: "geanta-nimes" })).toBe(false);
  });
});

// ─── Zones, formats, surfaces ────────────────────────────────────────────

describe("apparel zones and surfaces", () => {
  it("offers every format on a T-shirt, the logo only on a polo front, the fixed 9×5 logo on a cap", () => {
    expect(apparelZoneFormats(SHIRT, tee.zones[0]!).map((f) => f.presetId)).toEqual([LOGO, A5, A4]);
    expect(apparelZoneFormats(POLO, polo.zones[0]!).map((f) => f.presetId)).toEqual([LOGO]);
    expect(apparelZoneFormats(POLO, polo.zones[1]!).map((f) => f.presetId)).toEqual([LOGO, A5, A4]);
    expect(apparelZoneFormats(CAP, cap.zones[0]!)).toEqual([{ presetId: null, label: "Logo 9×5", widthCm: 9, heightCm: 5, price: 0 }]);
  });

  it("draws one transparent surface per zone at the format size, px = cm × 300 / 2.54", () => {
    const specs = apparelSurfaceSpecs(SHIRT, tee, {});
    // Defaults: A4 front and back.
    expect(specs.map((s) => [s.id, s.widthMm, s.heightMm, s.pxW, s.pxH, s.dpi, s.background, s.bleedMm, s.safeMm])).toEqual([
      ["front", 210, 300, 2480, 3543, 300, null, 0, 0],
      ["back", 210, 300, 2480, 3543, 300, null, 0, 0],
    ]);
    const logo = apparelSurfaceSpecs(SHIRT, tee, { front: LOGO, back: A5 });
    expect(logo.map((s) => [s.pxW, s.pxH])).toEqual([
      [cmToPx(10, 300), cmToPx(10, 300)],
      [cmToPx(15, 300), cmToPx(21, 300)],
    ]);
    expect(cmToPx(10, 300)).toBe(Math.round((10 * 300) / 2.54));
    const capSpecs = apparelSurfaceSpecs(CAP, cap, {});
    expect(capSpecs.map((s) => [s.id, s.widthMm, s.heightMm, s.pxW, s.pxH])).toEqual([["front", 90, 50, 1063, 591]]);
    expect(apparelSurfaceSpecs(POLO, polo, {}).map((s) => [s.id, s.widthMm, s.heightMm])).toEqual([
      ["front", 100, 100],
      ["back", 210, 300],
    ]);
    // A preset no longer offered falls back to the default.
    expect(apparelSurfaceSpecs(POLO, polo, { front: A4 })[0]!.widthMm).toBe(100);
  });

  it("reads the formats of a draft back from its surface sizes", () => {
    const specs = apparelSurfaceSpecs(SHIRT, tee, { front: LOGO, back: A5 });
    expect(apparelFormatsOfDoc(SHIRT, tee, docWith(specs, {}))).toEqual({ front: LOGO, back: A5 });
  });

  it("prices / prints only zones with something on them", () => {
    const specs = apparelSurfaceSpecs(SHIRT, tee, {});
    expect(apparelUsedZones(tee, docWith(specs, {}))).toEqual([]);
    expect(apparelUsedZones(tee, docWith(specs, { front: [text({ text: "  " })], back: [text({ hidden: true })] }))).toEqual([]);
    expect(apparelUsedZones(tee, docWith(specs, { back: [text()] }))).toEqual(["back"]);
    expect(apparelUsedZones(tee, docWith(specs, { front: [text()], back: [text({ id: "t2" })] }))).toEqual(["front", "back"]);
  });
});

// ─── Quote line ──────────────────────────────────────────────────────────

describe("apparel quote line", () => {
  it("is the product page's DTF line: colour, sizes in order, printed zones with placement and size", () => {
    const line = apparelQuoteLine(SHIRT, { colorKey: "CA6502-01", formats: { front: LOGO, back: A4 }, sizes: { L: 2, M: 3, XL: 4 } }, ["front", "back"]);
    expect(line).toEqual({
      kind: "dtf",
      garmentId: WHITE_SHIRT.id,
      sizes: [
        { size: "M", quantity: 3 },
        { size: "L", quantity: 2 },
      ],
      zones: [
        { id: "front", placement: "chest_left", presetId: LOGO, widthCm: 10, heightCm: 10 },
        { id: "back", placement: "back", presetId: A4, widthCm: 21, heightCm: 30 },
      ],
    });
    const mid = apparelQuoteLine(SHIRT, { colorKey: "CA6502-01", formats: { front: A5 }, sizes: { M: 1 } }, ["front"]);
    expect(mid?.zones).toEqual([{ id: "front", placement: "chest_center", presetId: A5, widthCm: 15, heightCm: 21 }]);
    expect(apparelQuoteLine(SHIRT, { colorKey: "CA6502-01", formats: {}, sizes: { M: 1 } }, ["front"])?.zones[0]?.placement).toBe("front");
    // Polo front: left chest; cap: the «other» zone with the note, as `capZones`.
    expect(apparelQuoteLine(POLO, { colorKey: "CA6502-01", formats: {}, sizes: { M: 1 } }, ["front"])?.zones[0]?.placement).toBe("chest_left");
    expect(apparelQuoteLine(CAP, { colorKey: "GO70199002", formats: {}, sizes: { "—": 5 } }, ["front"])).toEqual({
      kind: "dtf",
      garmentId: CAP_ID,
      sizes: [{ size: "—", quantity: 5 }],
      zones: [{ id: "front", placement: "other", placementNote: CAP_ZONE_NOTE, presetId: null, widthCm: 9, heightCm: 5 }],
    });
    // Nothing printed / no piece / unknown colour: no line.
    expect(apparelQuoteLine(SHIRT, { colorKey: "CA6502-01", formats: {}, sizes: { M: 1 } }, [])).toBeNull();
    expect(apparelQuoteLine(SHIRT, { colorKey: "CA6502-01", formats: {}, sizes: {} }, ["front"])).toBeNull();
    expect(apparelQuoteLine(SHIRT, { colorKey: "nope", formats: {}, sizes: { M: 1 } }, ["front"])).toBeNull();
  });

  it("gives the picks of a cart line back (re-edit)", () => {
    const sel = { colorKey: "CA6502-01", formats: { front: LOGO, back: A4 }, sizes: { M: 3, L: 2 } };
    const line = apparelQuoteLine(SHIRT, sel, ["front", "back"]);
    expect(apparelSelectionOfQuote(SHIRT, line)).toEqual(sel);
    expect(apparelSelectionOfQuote(SHIRT, { kind: "mug", productId: "x", quantity: 1 })).toBeNull();
  });

  it("keeps sizes within stock and starts on an M in stock", () => {
    const c = SHIRT.dtf!.colors[0]!;
    expect(apparelStartSizes(c)).toEqual({ M: 1 });
    expect(apparelStartSizes({ sizes: ["S", "M"], sizeStock: { M: 0 } })).toEqual({ S: 1 });
    expect(apparelClampSizes(c, { S: 3, M: 9, L: 1, XL: 2 })).toEqual({ M: 5, L: 1 });
  });
});

// ─── Price estimate ──────────────────────────────────────────────────────

describe("apparel price estimate (the server engine on the page's data)", () => {
  it("prices garment + print with run discounts; the cap logo is in the cap price", () => {
    const one = apparelQuoteLine(SHIRT, { colorKey: "CA6502-01", formats: {}, sizes: { M: 1 } }, ["front"]);
    expect(apparelEstimate(one, PRICING)).toEqual({ total: 280, pieces: 1, unit: 280 });
    const two = apparelQuoteLine(SHIRT, { colorKey: "CA6502-01", formats: { back: A4 }, sizes: { M: 1 } }, ["front", "back"]);
    expect(apparelEstimate(two, PRICING)?.total).toBe(460);
    const capLine = apparelQuoteLine(CAP, { colorKey: "GO70199002", formats: {}, sizes: { "—": 1 } }, ["front"]);
    expect(apparelEstimate(capLine, PRICING)?.total).toBe(180);
    expect(apparelEstimate(null, PRICING)).toBeNull();
    expect(apparelEstimate(one, null)).toBeNull();
  });

  it("names a zone's price per piece and the next run step", () => {
    const sel = { colorKey: "CA6502-01", formats: { front: A4, back: LOGO }, sizes: { M: 1 } };
    expect(apparelZoneDelta(SHIRT, sel, ["front"], "front", PRICING)).toBe(180);
    expect(apparelZoneDelta(SHIRT, sel, ["front"], "back", PRICING)).toBe(100);
    expect(apparelZoneDelta(CAP, { colorKey: "GO70199002", formats: {}, sizes: { "—": 1 } }, [], "front", PRICING)).toBe(0);
    const next = apparelNextStep(apparelQuoteLine(SHIRT, sel, ["front"]), PRICING);
    // 2 pieces: T-shirt 95 + A4 −7 % (rounded to 5) = 95 + 165.
    expect(next).toEqual({ minQty: 2, unit: 260, pct: 7 });
  });
});

// ─── Cart line, checkout ─────────────────────────────────────────────────

const LAYOUT = { templateId: "studio", text: "ANVI", fontFamily: "Montserrat", textColor: "#000000", backgroundColor: "#ffffff", photoUrls: [], photoSettings: [] };
const STUDIO = { v: 1 as const, docId: "d_apparel1", approvedAt: "2026-11-07T10:00:00.000Z", checks: ["text", "edges", "quality", "product"] };

describe("apparel cart line", () => {
  const quote = apparelQuoteLine(SHIRT, { colorKey: "CA6502-01", formats: { front: LOGO, back: A4 }, sizes: { M: 2 } }, ["front", "back"])!;
  const line = apparelDesignCartLine({
    id: "l1",
    addedAt: 1,
    slug: "tricou-dogo",
    quote,
    files: {
      front: { fileKey: "uploads/1793000000000-front.png", fileName: "apparel-front.png", sizeBytes: 10 },
      back: { fileKey: "uploads/1793000000001-back.png", fileName: "apparel-back.png", thumb: "data:image/jpeg;base64,BB" },
    },
    layout: LAYOUT,
    preview: "data:image/jpeg;base64,AA",
    studio: STUDIO,
    title: "Tricou DOGO",
    optionsText: "M × 2",
    lastTotal: 560,
    fallbackImage: null,
  });

  it("carries one transparent PNG per printed zone and the Studio design `apparel`", () => {
    expect(line.quote).toBe(quote);
    expect(line.files.map((f) => [f.zone, f.fileName])).toEqual([
      ["front", "apparel-front.png"],
      ["back", "apparel-back.png"],
    ]);
    expect(line.image).toBe("data:image/jpeg;base64,AA");
    expect(line.design).toMatchObject({ editor: "apparel", studio: { docId: "d_apparel1" } });
    // A zone without a file is not sent.
    const frontOnly = apparelDesignCartLine({ ...lineArgs(), quote: { ...quote, zones: [quote.zones[0]!] } });
    expect(frontOnly.files.map((f) => f.zone)).toEqual(["front"]);
  });

  function lineArgs() {
    return {
      id: "l2",
      addedAt: 1,
      slug: "tricou-dogo",
      quote,
      files: { front: { fileKey: "uploads/1793000000000-front.png", fileName: "f.png" }, back: { fileKey: "uploads/1793000000001-back.png", fileName: "b.png" } },
      layout: LAYOUT,
      preview: null,
      studio: STUDIO,
      title: "T",
      optionsText: "",
      lastTotal: null,
      fallbackImage: "img",
    };
  }

  it("is a Studio line the cart keeps, re-edits in the Studio, and the checkout takes unchanged (dtf:<zone> files)", () => {
    expect(isShopEditorKind("apparel")).toBe(true);
    expect(isStudioQuoteKind("apparel", line.quote)).toBe(true);
    expect(isStudioQuoteKind("apparel", { kind: "mug", productId: "x", quantity: 1 })).toBe(false);
    expect(isStudioQuoteKind("mug", line.quote)).toBe(false);
    expect(parseLineDesign(JSON.parse(JSON.stringify(line.design)), line.quote)).toMatchObject({ editor: "apparel", studio: { docId: "d_apparel1" } });
    expect(parseLineDesign({ editor: "apparel", layout: LAYOUT }, line.quote)).toBeNull();
    expect(studioEditorPath("apparel", { slug: "tricou-dogo", edit: "l1" })).toBe("/shop/studio/apparel?slug=tricou-dogo&edit=l1");

    const files = shopLineFiles("dtf", line.files, 2, quote.zones.map((z) => z.id));
    expect(files.map((f) => [f.fileName, f.paperType])).toEqual([
      ["apparel-front.png", dtfZoneFilePaperType("front")],
      ["apparel-back.png", dtfZoneFilePaperType("back")],
    ]);
    const design = shopLineDesignSchema.parse({ editor: "apparel", layout: LAYOUT, studio: STUDIO });
    const input = { customerType: "retail" as const, productType: "dtf_apparel" as const, files, dtf: { garmentSource: "stock" as const, garmentProductId: quote.garmentId, sizes: quote.sizes, zones: quote.zones } };
    expect(applyShopDesign(input as never, design)).toBe(input);
  });

  it("survives the cart storage and is a valid, approved checkout line with its zone files and design", () => {
    const [stored] = parseCart(serializeCart([line]));
    expect(stored?.design?.editor).toBe("apparel");
    expect(stored?.files.map((f) => f.zone)).toEqual(["front", "back"]);
    const req = shopCheckoutRequestSchema.parse({
      locale: "ro",
      customer: { name: "Test", phone: "+373 69 000 000" },
      delivery: { method: "pickup" },
      lines: [checkoutLine(stored!)],
      acceptTerms: true,
    });
    const sent = req.lines[0]!;
    expect(sent.design?.editor).toBe("apparel");
    expect(sent.files?.map((f) => f.zone)).toEqual(["front", "back"]);
    expect(shopDesignApprovalProblem(sent.design)).toBeNull();
    expect(shopDesignApprovalProblem({ editor: "apparel", layout: LAYOUT })).toBe("studio_not_approved");
  });

  it("keeps the draft's picks", () => {
    expect(parseApparelDraftState({ colorKey: "CA6502-01", formats: { front: LOGO, back: null }, sizes: { M: 2, L: -1, XL: "x" } })).toEqual({
      colorKey: "CA6502-01",
      formats: { front: LOGO, back: null },
      sizes: { M: 2 },
    });
    expect(parseApparelDraftState(null)).toBeNull();
    expect(parseApparelDraftState({ colorKey: 5 })).toBeNull();
  });
});

// ─── Quality ─────────────────────────────────────────────────────────────

function image(over: Partial<StudioImageLayer> = {}): StudioImageLayer {
  return {
    id: "i1",
    kind: "image",
    x: 20,
    y: 20,
    w: 100,
    h: 100,
    rotation: 0,
    src: { localId: "p1", naturalW: 1200, naturalH: 1200, mime: "image/png" },
    mask: "rect",
    crop: { zoom: 1, ox: 0, oy: 0 },
    ...over,
  };
}

describe("apparel quality (DTF)", () => {
  const specs = apparelSurfaceSpecs(SHIRT, tee, {});
  const codes = (d: StudioDoc, used = apparelUsedZones(tee, d), opaque?: (l: StudioImageLayer) => boolean | null) =>
    evaluateApparelQuality(d, specs, { used, ...(opaque ? { opaqueImage: opaque } : {}) }).map((i) => `${i.level}:${i.code}${i.surfaceId ? `@${i.surfaceId}` : ""}`);

  it("is red only when no zone has anything; an empty back is fine", () => {
    expect(codes(docWith(specs, {}))).toEqual(["red:designEmpty@front"]);
    expect(codes(docWith(specs, { front: [text()] }))).toEqual([]);
  });

  it("warns, naming the zone, when the quick button's sample text is left unchanged — and still prints it", () => {
    const sample = text({ text: "Textul tău", placeholder: true, sizePt: 40 });
    const d = docWith(specs, { back: [sample] });
    // It prints (the zone is used, so priced and exported), it is not dropped.
    expect(apparelUsedZones(tee, d)).toEqual(["back"]);
    const items = evaluateApparelQuality(d, specs, { used: apparelUsedZones(tee, d), zoneName: (id) => (id === "back" ? "Spate" : "Față") });
    expect(items.map((i) => `${i.level}:${i.code}@${i.surfaceId}`)).toEqual(["yellow:dtfSampleText@back"]);
    expect(items[0]!.vars).toEqual({ zone: "Spate", text: "Textul tău" });
    // The same words without the flag (another language, an older draft) count too; a typed text does not.
    for (const t of Object.values(APPAREL_SAMPLE_TEXTS)) expect(isApparelSampleText({ kind: "text", text: ` ${t.toUpperCase()} ` })).toBe(true);
    expect(isApparelSampleText({ kind: "text", text: "ANVI Studio" })).toBe(false);
    expect(codes(docWith(specs, { front: [text({ text: "Ваш текст" })] }))).toEqual(["yellow:dtfSampleText@front"]);
    expect(codes(docWith(specs, { front: [text({ text: "ANVI" })] }))).toEqual([]);
  });

  it("warns (never blocks) on a photo under 150 dpi at the printed size", () => {
    // 1200 px over 100 mm = 305 dpi: fine; 400 px = 102 dpi: yellow.
    expect(codes(docWith(specs, { front: [image()] }))).toEqual([]);
    const low = codes(docWith(specs, { front: [image({ src: { localId: "p1", naturalW: 400, naturalH: 400, mime: "image/png" } })] }));
    expect(low).toEqual(["yellow:dtfPhotoDpi@front"]);
  });

  it("warns that an opaque image prints its background box (JPEG, or edges measured opaque)", () => {
    expect(codes(docWith(specs, { front: [image({ src: { localId: "p1", naturalW: 1200, naturalH: 1200, mime: "image/jpeg" } })] }))).toEqual(["yellow:dtfOpaqueBg@front"]);
    expect(codes(docWith(specs, { front: [image()] }), ["front"], () => true)).toEqual(["yellow:dtfOpaqueBg@front"]);
    expect(codes(docWith(specs, { front: [image({ src: { localId: "p1", naturalW: 1200, naturalH: 1200, mime: "image/jpeg" } })] }), ["front"], () => false)).toEqual([]);
  });

  it("warns on hairlines, tiny letters and a design at the zone edge", () => {
    const line: StudioShapeLayer = { id: "s1", kind: "shape", shape: "line", x: 20, y: 100, w: 100, h: 0.6, rotation: 0, fill: "#000000" };
    expect(codes(docWith(specs, { front: [line] }))).toEqual(["yellow:dtfThinLine@front"]);
    // ~2 mm cap height ≈ 8.1 pt.
    expect(capHeightMm(8)).toBeLessThan(2);
    expect(capHeightMm(9)).toBeGreaterThan(2);
    expect(codes(docWith(specs, { front: [text({ sizePt: 7, h: 4 })] }))).toEqual(["yellow:dtfSmallText@front"]);
    expect(codes(docWith(specs, { front: [text({ sizePt: 9, h: 5 })] }))).toEqual([]);
    expect(codes(docWith(specs, { front: [image({ x: -5 })] }))).toEqual(["yellow:dtfEdge@front"]);
    expect(codes(docWith(specs, { front: [image({ x: 0.2 })] }))).toEqual(["yellow:dtfEdge@front"]);
  });
});

describe("background removal", () => {
  /** 20×20 white, a 6×6 red square in the middle with a white «counter» pixel inside. */
  function sample(): Uint8ClampedArray {
    const w = 20;
    const d = new Uint8ClampedArray(w * w * 4).fill(255);
    for (let y = 7; y < 13; y++)
      for (let x = 7; x < 13; x++) {
        const i = (y * w + x) * 4;
        d[i] = 200;
        d[i + 1] = 20;
        d[i + 2] = 20;
      }
    const c = (10 * w + 10) * 4;
    d[c] = d[c + 1] = d[c + 2] = 255;
    return d;
  }

  it("clears the flat edge colour from the outside in, keeps the artwork and its inner holes", () => {
    const d = sample();
    expect(hasOpaqueEdges(d, 20, 20)).toBe(true);
    const share = removeFlatBackground(d, 20, 20, 40);
    expect(share).toBeCloseTo((400 - 36) / 400, 5);
    expect(d[(0 * 20 + 0) * 4 + 3]).toBe(0);
    expect(d[(8 * 20 + 8) * 4 + 3]).toBe(255);
    // The white pixel inside the square is not reached from the edge.
    expect(d[(10 * 20 + 10) * 4 + 3]).toBe(255);
    expect(hasOpaqueEdges(d, 20, 20)).toBe(false);
  });
});

// ─── Mockup geometry ─────────────────────────────────────────────────────

describe("apparel mockup scale", () => {
  it("places the transfer at its real size on the size-L garment", () => {
    const a3 = apparelPrintBox("tshirt", "front", "front", 30, 42);
    expect(a3.w / APPAREL_REFERENCE.tshirt.chestCm).toBeCloseTo(30 / 54, 5);
    expect(a3.x + a3.w / 2).toBe(0);
    const logo = apparelPrintBox("tshirt", "front", "chest_left", 10, 10);
    // Wearer's left chest = the viewer's right: centred 10 cm off the centre line.
    expect(logo.x + logo.w / 2).toBe(10);
    expect(apparelPrintBox("polo", "back", "back", 21, 30).view).toBe("back");
    const capBox = apparelPrintBox("cap", "front", "other", 9, 5);
    expect(capBox.y + capBox.h).toBeCloseTo(CAP_LOGO_BOTTOM_CM, 5);
    expect(apparelViews("cap")).toEqual(["front"]);
    expect(apparelViews("polo")).toEqual(["front", "back"]);
    // Editor canvas: the garment around the zone in zone mm; an A3 fits the whole tee, a chest logo a part of it.
    const big = apparelCanvasBackdrop("tshirt", a3);
    expect([big.x, big.y]).toEqual([(-44 - a3.x) * 10, (-4 - a3.y) * 10]);
    expect(big.fit).toEqual({ x: big.x, y: big.y, w: big.w, h: big.h });
    const small = apparelCanvasBackdrop("tshirt", logo);
    expect(small.fit.w).toBeLessThan(small.w * 0.7);
    expect(small.fit.x).toBeLessThanOrEqual(0);
    expect(small.fit.x + small.fit.w).toBeGreaterThanOrEqual(100);
  });
});
