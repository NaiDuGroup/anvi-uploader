import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {}, HEAVY_TX_OPTIONS: {} }));
import { buildBusinessCardSheetPngs, BUSINESS_CARD_SHEET_DPI } from "@/lib/businessCard/businessCardSheetPng";
import { computeBusinessCardSheetLayout } from "@/lib/businessCard/businessCardSheetLayout";
import { businessCardFaces } from "@/lib/businessCard/businessCardConstants";
import { FLYER_BLEED_CM, FLYER_PRESETS } from "@/lib/flyer/flyerConstants";
import { cmToPx } from "@/lib/printDimensions";
import { shopLineFiles } from "@/lib/shop/checkout";
import { applyShopDesign, shopLineDesignSchema } from "@/lib/shop/designLine";
import { addMissingBleed } from "@/lib/sheetProduct/addMissingBleed";
import { sheetFootprintFromTrim } from "@/lib/sheetProduct/sheetProductConfig";
import { isShopEditorKind, isStudioQuoteKind, parseLineDesign, studioEditorPath } from "@/lib/storefront/design";
import { describeQuoteLine } from "@/lib/storefront/lineLabels";
import { shopT } from "@/lib/storefront/i18n";
import { PS_SHEET_CM, psFormat, psProduct } from "@/lib/storefront/printShop/config";
import { psLinePrice, psPiecesPerSheet, type PsQuoteLine } from "@/lib/storefront/printShop/pricing";
import type { ShopQuoteLine } from "@/lib/storefront/types";
import { buildCardDoc, matchingBack } from "./cardBuild";
import { createCanvas } from "@napi-rs/canvas";
import { nodeAssets, nodeMeasure, registerCardFonts } from "./cardTestKit";
import { drawPrintArea } from "./render";
import { addLayer, emptyStudioDoc, type StudioDoc, type StudioImageLayer, type StudioTextLayer } from "./document";
import { isStudioCardEnabled, isStudioEditorEnabled, isStudioFlyerEnabled } from "./flag";
import {
  FLYER_IDS,
  flyerDefaultOptions,
  flyerDesignCartLine,
  flyerExportPx,
  flyerFormatOfDoc,
  flyerOptionsOfQuote,
  flyerPrint,
  flyerQuoteLine,
  type FlyerFormatId,
} from "./flyer";
import { flyerShopProduct } from "./flyerProduct";
import { studioFlyerT, studioSheetT } from "./i18n.flyer";
import { studioCardT } from "./i18n.card";
import { studioQuoteLine } from "./productLine";
import { evaluateStudioQuality } from "./quality";
import { CARD_BACK_ID, CARD_FRONT_ID, initialSurfaceBases, studioSurfaces, surfaceBase, type StudioSurfaceSpec } from "./surfaces";
import { studioTemplatesFor } from "./templates";
import { studioVerifyNotes } from "./verifyChecklist";

/**
 * Flyers in ANVI Studio, shop side: the gate, the cart line the verify step
 * builds, the checkout of a flyer design line, the print files per format and
 * the workshop imposition of exported files.
 */

const LAYOUT = { templateId: "studio:flyer-x", text: "", fontFamily: "Montserrat", textColor: "#14213d", backgroundColor: "#ffffff", photoUrls: [], photoSettings: [] };
const STUDIO = { v: 1 as const, docId: "d_flyer1", approvedAt: "2026-11-07T10:00:00.000Z", checks: ["text", "edges", "quality", "product"] };

const flyerDoc = (format: FlyerFormatId, back: boolean): StudioDoc => {
  const specs = studioSurfaces("flyer", flyerPrint(format));
  const d = emptyStudioDoc("flyer", initialSurfaceBases(specs));
  if (!back) return d;
  const b = specs.find((s) => s.id === CARD_BACK_ID)!;
  return { ...d, surfaces: [...d.surfaces, { ...surfaceBase(b), layers: [] }] };
};

describe("flyer Studio gate", () => {
  it("opens only with SHOP_STUDIO_FLYER=1 or for staff / testers — not with the Studio or the card flag", () => {
    expect(isStudioFlyerEnabled({})).toBe(false);
    expect(isStudioFlyerEnabled({ SHOP_STUDIO_EDITOR: "1" })).toBe(false);
    expect(isStudioFlyerEnabled({ SHOP_STUDIO_CARD: "1" })).toBe(false);
    expect(isStudioFlyerEnabled({ SHOP_STUDIO_EDITOR: "1", SHOP_STUDIO_CARD: "1" })).toBe(false);
    expect(isStudioFlyerEnabled({ SHOP_STUDIO_FLYER: "1" })).toBe(true);
    expect(isStudioFlyerEnabled({ SHOP_STUDIO_FLYER: " 1 " })).toBe(true);
    expect(isStudioFlyerEnabled({ SHOP_STUDIO_FLYER: "0" })).toBe(false);
    expect(isStudioFlyerEnabled({}, { tester: true })).toBe(true);
    expect(isStudioFlyerEnabled({}, { tester: false })).toBe(false);
    // …and the flyer flag opens nothing else.
    expect(isStudioCardEnabled({ SHOP_STUDIO_FLYER: "1" })).toBe(false);
    expect(isStudioEditorEnabled({ SHOP_STUDIO_FLYER: "1" })).toBe(false);
  });
});

describe("flyer print files per format", () => {
  const want: Record<FlyerFormatId, [number, number, number, number]> = {
    a6: [109, 152, 1287, 1795],
    a5: [152, 214, 1795, 2528],
    dl: [103, 214, 1217, 2528],
    a4: [214, 301, 2528, 3555],
  };
  it.each(FLYER_IDS.map((id) => [id] as const))("%s: trim + 2 mm bleed, safe 6 mm from the file edge, 300 dpi (cmToPx = flyerExportPx)", (id) => {
    const specs = studioSurfaces("flyer", flyerPrint(id));
    expect(specs.map((s) => s.id)).toEqual([CARD_FRONT_ID, CARD_BACK_ID]);
    const [w, h, px, py] = want[id];
    for (const s of specs) {
      expect([s.widthMm, s.heightMm, s.bleedMm, s.safeMm, s.dpi]).toEqual([w, h, 2, 6, 300]);
      expect([s.pxW, s.pxH]).toEqual([px, py]);
      expect([s.pxW, s.pxH]).toEqual([cmToPx(w / 10, 300), cmToPx(h / 10, 300)]);
      expect(s.trimmed).toBe(true);
    }
    expect(flyerExportPx(id)).toEqual({ width: px, height: py });
    expect(specs[1]!.optional).toBe(true);
    expect(flyerFormatOfDoc(flyerDoc(id, false))).toBe(id);
  });
});

describe("flyer quote line and options", () => {
  it("is the print-shop flyer line; a back = two sides; unknown options fall back to the product's", () => {
    const one = flyerQuoteLine(flyerDoc("a5", false), flyerDefaultOptions("a5"));
    expect(one).toEqual({ kind: "sheetShop", product: "flyers", format: "a5", paper: 150, sides: "one", quantity: 100 });
    const two = flyerQuoteLine(flyerDoc("a4", true), { format: "a4", paper: 300, pack: 250, lamination: "matte" });
    expect(two).toEqual({ kind: "sheetShop", product: "flyers", format: "a4", paper: 300, sides: "two", quantity: 250, lamination: "matte" });
    expect(flyerQuoteLine(flyerDoc("a5", false), { format: "a5", paper: 999, pack: 75 })).toMatchObject({ paper: 150, quantity: 100 });
    // Priced by the existing list (no new prices): two sides × 2.
    const p1 = psLinePrice(one)!;
    const p2 = psLinePrice({ ...one, sides: "two" })!;
    expect(p1.total).toBeGreaterThan(0);
    expect(p2.total).toBe(p1.total * 2);
    // Editing the line again restores its options.
    expect(flyerOptionsOfQuote(two as ShopQuoteLine)).toEqual({ format: "a4", paper: 300, pack: 250, lamination: "matte" });
    expect(flyerOptionsOfQuote({ ...two, product: "postcards" } as ShopQuoteLine)).toBeNull();
    expect(flyerOptionsOfQuote({ kind: "businessCard", pricing: "shopPack", sides: "one", quantity: 100 })).toBeNull();
    // The Studio's default line / product.
    expect(studioQuoteLine("flyer", { simpleKind: null }, { id: "x" } as never, 1)).toEqual(one);
    const product = flyerShopProduct("ro");
    expect(product).toMatchObject({ slug: "flyere", image: "/print-shop/flyers.svg", name: "Flyere și pliante", fromPrice: p1.total });
  });

  it("names the line like an uploaded flyer (title and options)", () => {
    const line = flyerQuoteLine(flyerDoc("a5", true), { format: "a5", paper: 150, pack: 100 });
    const text = describeQuoteLine(line as ShopQuoteLine, { variants: {}, garments: {}, prints: {} }, shopT("ro"));
    expect(text?.slug).toBe("flyere");
    expect(text?.title).toBeTruthy();
    expect(text?.optionsText).toContain("A5");
  });
});

describe("flyer design cart line", () => {
  const front = { fileKey: "uploads/1762250000000-abcdefgh-flyer-front.png", fileName: "flyer-front.png", sizeBytes: 10, thumb: "data:image/jpeg;base64,AA" };
  const back = { fileKey: "uploads/1762250000000-abcdefgh-flyer-back.png", fileName: "flyer-back.png" };
  const args = (quote: PsQuoteLine) => ({
    id: "l1",
    addedAt: 1,
    quote,
    front,
    back,
    layout: LAYOUT,
    preview: "data:image/jpeg;base64,BB",
    studio: STUDIO,
    title: "Flyere",
    optionsText: "A5",
    lastTotal: 100,
    fallbackImage: "/print-shop/flyers.svg",
  });
  it("carries one PNG per printed side (front / back zones) and the Studio design `flyer`", () => {
    const two = flyerDesignCartLine(args(flyerQuoteLine(flyerDoc("a5", true), flyerDefaultOptions("a5"))));
    expect(two.slug).toBe("flyere");
    expect(two.files.map((f) => [f.zone, f.fileName])).toEqual([
      ["front", "flyer-front.png"],
      ["back", "flyer-back.png"],
    ]);
    expect(two.design).toMatchObject({ editor: "flyer", studio: STUDIO, preview: "data:image/jpeg;base64,BB" });
    expect(two.image).toBe("data:image/jpeg;base64,BB");
    // One-sided: the back file is not sent (it would be refused as «too many»).
    const one = flyerDesignCartLine(args(flyerQuoteLine(flyerDoc("a5", false), flyerDefaultOptions("a5"))));
    expect(one.files.map((f) => f.zone)).toEqual(["front"]);
  });

  it("is a Studio line the cart keeps and the checkout accepts; its files keep the face paper types", () => {
    const line = flyerDesignCartLine(args(flyerQuoteLine(flyerDoc("a5", true), flyerDefaultOptions("a5"))));
    expect(isShopEditorKind("flyer")).toBe(true);
    expect(isStudioQuoteKind("flyer", line.quote)).toBe(true);
    expect(isStudioQuoteKind("flyer", { ...(line.quote as PsQuoteLine), product: "postcards" } as ShopQuoteLine)).toBe(false);
    expect(isStudioQuoteKind("flyer", { kind: "businessCard", pricing: "shopPack", sides: "one", quantity: 100 })).toBe(false);
    expect(isStudioQuoteKind("card", line.quote)).toBe(false);
    // Stored in the cart and read back.
    expect(parseLineDesign(JSON.parse(JSON.stringify(line.design)), line.quote)).toMatchObject({ editor: "flyer", studio: { docId: "d_flyer1" } });
    // Without the Studio approval a flyer «design» is not one (only Studio makes flyers).
    expect(parseLineDesign({ editor: "flyer", layout: LAYOUT }, line.quote)).toBeNull();
    expect(studioEditorPath("flyer", { slug: "flyere", edit: "l1" })).toBe("/shop/studio/flyer?slug=flyere&edit=l1");

    const files = shopLineFiles("sheetShop", line.files, 100);
    expect(files.map((f) => [f.fileName, f.paperType, f.copies])).toEqual([
      ["flyer-front.png", "business_card_front", 1],
      ["flyer-back.png", "business_card_back", 1],
    ]);
    const design = shopLineDesignSchema.parse({ editor: "flyer", layout: LAYOUT, studio: STUDIO });
    // The sheet line's productType is "flyer" too: still returned as it is (no `flyer_layout` paper type, no layout JSON).
    const input = { customerType: "retail" as const, productType: "flyer" as const, cardSides: "two" as const, quantity: 100, files };
    expect(applyShopDesign(input, design)).toBe(input);
  });
});

describe("flyer strings", () => {
  it("are the card's with the flyer wording where it differs, in every language", () => {
    for (const lang of ["ro", "ru", "en"] as const) {
      const t = studioSheetT("flyer", lang);
      expect(t("front")).toBe(studioCardT(lang)("front"));
      expect(t("startTitle")).not.toBe(studioCardT(lang)("startTitle"));
      expect(t("cutNote", { size: "148×210 mm" })).toContain("148×210 mm");
      expect(studioSheetT("card", lang)("cutNote")).toBe(studioCardT(lang)("cutNote"));
      expect(studioFlyerT(lang)("paperOption", { n: 150 })).toMatch(/150 [gг]\/[mм]²/);
    }
  });
});

describe("flyer quality on the flyer specs", () => {
  const specs = studioSurfaces("flyer", flyerPrint("a5"));
  const text = (o: Partial<StudioTextLayer> = {}): StudioTextLayer => ({
    id: "t", kind: "text", x: 20, y: 40, w: 100, h: 12, rotation: 0, text: "Reduceri de iarnă", fontFamily: "Roboto", bold: true,
    sizePt: 24, color: "#14213d", align: "center", lineHeight: 1.2, ...o,
  });
  const doc = (...layers: (StudioTextLayer | StudioImageLayer)[]) => {
    let d = emptyStudioDoc("flyer", initialSurfaceBases(specs));
    for (const l of layers) d = addLayer(d, CARD_FRONT_ID, l);
    return d;
  };
  const codes = (d: StudioDoc) => evaluateStudioQuality(d, specs).map((i) => `${i.level}:${i.code}`);
  it("flags a low-dpi photo at the flyer size, text near / across the edge, tiny text and neon RGB", () => {
    expect(codes(doc(text()))).toEqual([]);
    const photo = (naturalW: number): StudioImageLayer => ({
      id: "p", kind: "image", x: 0, y: 0, w: 152, h: 107, rotation: 0, src: { localId: "ph", naturalW, naturalH: Math.round((naturalW * 107) / 152) }, mask: "rect", crop: { zoom: 1, ox: 0, oy: 0 },
    });
    // 600 px across 152 mm ≈ 100 dpi: red; 1500 px ≈ 250 dpi: fine.
    expect(codes(doc(photo(600), text({ y: 150 })))).toContain("red:photoDpi");
    expect(codes(doc(photo(1795), text({ y: 150 }))).filter((c) => c.includes("photoDpi"))).toEqual([]);
    expect(codes(doc(text({ x: 3 })))).toContain("yellow:safeZone");
    expect(codes(doc(text({ x: 0.5 })))).toContain("red:trim");
    expect(codes(doc(text({ sizePt: 4 })))).toContain("red:textTiny");
    expect(codes(doc(text({ color: "#00ff00" })))).toContain("yellow:neonRgb");
    // Untouched samples are not printed: listed with the empty fields.
    const sample = doc(text({ placeholder: true, text: "Titlul tău", bind: "headline" }), text({ id: "t2", y: 80 }));
    expect(codes(sample)).toEqual(["yellow:sampleNotPrinted"]);
    expect(studioVerifyNotes(sample).notPrinted).toEqual([{ layerId: "t", what: "sampleText", text: "Titlul tău", surfaceId: CARD_FRONT_ID }]);
  });
});

describe("workshop imposition of exported Studio flyer files", () => {
  registerCardFonts();
  const p = psProduct("flyers")!;

  it("the price and the imposition put the same number of pieces on an A4+ sheet, every format", () => {
    const want: Record<FlyerFormatId, number> = { a6: 4, a5: 2, dl: 3, a4: 1 };
    for (const id of FLYER_IDS) {
      const f = psFormat(p, id)!;
      const preset = FLYER_PRESETS.find((x) => x.id === f.presetId)!;
      // `resolveSheetProductLine`: the preset's trim + the flyer bleed on the paper's sheet (prod A4+ 22.5 × 32).
      const layout = computeBusinessCardSheetLayout({ sheetWidthCm: 22.5, sheetHeightCm: 32, ...sheetFootprintFromTrim(preset.trimWidthCm, preset.trimHeightCm, FLYER_BLEED_CM) });
      expect([layout.cardsPerSheet, psPiecesPerSheet(p, f)], id).toEqual([want[id], want[id]]);
      expect(PS_SHEET_CM).toEqual({ widthCm: 22.5, heightCm: 32 });
      // The quote's sheets follow from it.
      expect(psLinePrice({ kind: "sheetShop", product: "flyers", format: id, paper: 150, sides: "one", quantity: 100 })!.sheets).toBe(Math.ceil(100 / want[id]));
    }
  });

  it(
    "an A5 two-sided Studio flyer (1795×2528 PNGs) is imposed 2 per sheet as it is, one sheet per side",
    async () => {
      const specs = studioSurfaces("flyer", flyerPrint("a5"));
      const tpl = studioTemplatesFor("flyer")[0]!;
      const doc = buildCardDoc({
        front: tpl,
        back: matchingBack(tpl),
        fields: { company: "Dor de Cafea", headline: "Reduceri de iarnă", offer: "−20%", phone: "+373 69 123 456", brandColor1: "#b5532f", brandColor2: "#f2c14e", brandColor3: "#14213d" },
        lang: "ro",
        specs,
        measure: nodeMeasure,
        kind: "flyer",
      });
      expect(doc.surfaces.map((s) => s.id)).toEqual([CARD_FRONT_ID, CARD_BACK_ID]);
      const [frontSpec, backSpec] = specs;
      // As the browser export draws it (`renderSurfaceCanvas`): the spec's pixel size, samples left out.
      const exportPng = (spec: StudioSurfaceSpec): Buffer => {
        const c = createCanvas(spec.pxW, spec.pxH);
        const ctx = c.getContext("2d") as unknown as CanvasRenderingContext2D;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, spec.pxW, spec.pxH);
        drawPrintArea(ctx, doc.surfaces.find((x) => x.id === spec.id)!, spec, nodeAssets, spec.pxW, spec.pxH, { asPrinted: true });
        return c.toBuffer("image/png");
      };
      const frontPng: Buffer = exportPng(frontSpec!);
      const backPng: Buffer = exportPng(backSpec!);
      for (const png of [frontPng, backPng]) {
        const m = await sharp(png).metadata();
        expect([m.width, m.height]).toEqual([1795, 2528]);
      }
      // The checkout's files → the faces the workshop reads.
      const files = shopLineFiles("sheetShop", [
        { fileKey: "shop-orders/b.png", fileName: "flyer-back.png", zone: "back" },
        { fileKey: "shop-orders/f.png", fileName: "flyer-front.png", zone: "front" },
      ], 100).map((f, i) => ({ id: `f${i}`, paperType: f.paperType ?? null, fileName: f.fileName }));
      const faces = businessCardFaces(files);
      expect(faces.front?.fileName).toBe("flyer-front.png");
      expect(faces.back?.fileName).toBe("flyer-back.png");

      // As `resolveShopPrintSheetLine` freezes it: preset trim + 2 mm bleed on A4+, storefront fit `cover`.
      const preset = FLYER_PRESETS.find((x) => x.id === "flyer_a5")!;
      const trim = { widthCm: preset.trimWidthCm, heightCm: preset.trimHeightCm };
      const layout = computeBusinessCardSheetLayout({ sheetWidthCm: 22.5, sheetHeightCm: 32, ...sheetFootprintFromTrim(trim.widthCm, trim.heightCm, FLYER_BLEED_CM) });
      expect(layout.cardsPerSheet).toBe(2);
      // The exported file already has its bleed: no bleed is generated (the artwork is not shrunk).
      expect((await addMissingBleed(frontPng, trim, FLYER_BLEED_CM)).generated).toBe(false);

      const sheets = await buildBusinessCardSheetPngs({
        layout,
        sides: [
          { label: "front", fileName: "flyer-front.png", buffer: frontPng, rotateDeg: 0 },
          { label: "back", fileName: "flyer-back.png", buffer: backPng, rotateDeg: 180 },
        ],
        artworkFit: "cover",
        generateMissingBleed: { trim, bleedCm: FLYER_BLEED_CM },
      });
      expect(sheets.map((s) => s.label)).toEqual(["front", "back"]);
      for (const s of sheets) {
        const m = await sharp(s.png).metadata();
        expect([m.width, m.height]).toEqual([cmToPx(22.5, BUSINESS_CARD_SHEET_DPI), cmToPx(32, BUSINESS_CARD_SHEET_DPI)]);
      }
      // Each slot carries the flyer: the middle of every placement is not blank paper.
      const { data, info } = await sharp(sheets[0]!.png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(layout.placements).toHaveLength(2);
      for (const pl of layout.placements) {
        let ink = 0;
        const x0 = cmToPx(pl.xCm, BUSINESS_CARD_SHEET_DPI);
        const y0 = cmToPx(pl.yCm, BUSINESS_CARD_SHEET_DPI);
        const w = cmToPx(pl.widthCm, BUSINESS_CARD_SHEET_DPI);
        const h = cmToPx(pl.heightCm, BUSINESS_CARD_SHEET_DPI);
        for (let y = y0 + 20; y < y0 + h - 20; y += 37) {
          for (let x = x0 + 20; x < x0 + w - 20; x += 37) {
            const i = (y * info.width + x) * info.channels;
            if (data[i]! < 235 || data[i + 1]! < 235 || data[i + 2]! < 235) ink++;
          }
        }
        expect(ink).toBeGreaterThan(20);
      }
    },
    60_000,
  );
});
