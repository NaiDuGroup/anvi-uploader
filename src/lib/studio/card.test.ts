import { Path2D as NapiPath2D, createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildBusinessCardSheetPngs } from "@/lib/businessCard/businessCardSheetPng";
import { computeBusinessCardSheetLayout } from "@/lib/businessCard/businessCardSheetLayout";
import { cmToPx } from "@/lib/printDimensions";
import { shopLineDesignSchema, shopDesignApprovalProblem } from "@/lib/shop/designLine";
import { SHOP_BC_SLUG, shopBcExpectedPx, shopBcRequiredZones, shopBcTotalMdl } from "@/lib/storefront/businessCards";
import { checkoutLine, parseCart, serializeCart, type CartLine } from "@/lib/storefront/cart";
import { isStudioQuoteKind } from "@/lib/storefront/design";
import { addCardBack, cardDesignCartLine, cardHasBack, cardQuoteLine, cardSides, removeCardBack } from "./cardLine";
import { addLayer, emptyStudioDoc, fitDocToSurfaces, parseStudioDoc, type StudioDoc, type StudioLayer, type StudioShapeLayer, type StudioTextLayer } from "./document";
import { isStudioCardEnabled } from "./flag";
import { toLegacyLayout } from "./legacy";
import { layerQrMatrix, qrPayload } from "./qr";
import { evaluateStudioQuality } from "./quality";
import { drawPrintArea, type StudioRenderAssets } from "./render";
import { CARD_BACK_ID, CARD_FRONT_ID, CARD_PORTRAIT_PRINT, docSurfaceBases, initialSurfaceBases, studioSurfaces } from "./surfaces";
import { instantiateStudioTemplate, studioCardBackTemplates, studioTemplateById, studioTemplatesFor } from "./templates";
import { studioVerifyNotes } from "./verifyChecklist";

// The renderer builds shapes with Path2D (a browser global): the node canvas provides it.
(globalThis as { Path2D?: unknown }).Path2D ??= NapiPath2D;

const specs = studioSurfaces("card");
const assets: StudioRenderAssets = { image: () => null, font: (f) => f };

const text = (o: Partial<StudioTextLayer> = {}): StudioTextLayer => ({
  id: "t", kind: "text", x: 20, y: 20, w: 50, h: 8, rotation: 0, text: "Ana Ciobanu", fontFamily: "Roboto", bold: true,
  sizePt: 14, color: "#14213d", align: "center", lineHeight: 1.2, ...o,
});
const shape = (o: Partial<StudioShapeLayer> = {}): StudioShapeLayer => ({
  id: "s", kind: "shape", shape: "rect", x: 0, y: 0, w: 94, h: 54, rotation: 0, fill: "#d7263d", ...o,
});
function card(...layers: StudioLayer[]): StudioDoc {
  let d = emptyStudioDoc("card", initialSurfaceBases(specs));
  for (const l of layers) d = addLayer(d, CARD_FRONT_ID, l);
  return d;
}
const codes = (d: StudioDoc) => evaluateStudioQuality(d, specs).map((i) => `${i.level}:${i.code}`);

describe("business card surfaces (bc-1)", () => {
  it("is the 94×54 mm file at 300 dpi with 2 mm bleed and the safe zone 4 mm inside the cut", () => {
    expect(specs.map((s) => s.id)).toEqual([CARD_FRONT_ID, CARD_BACK_ID]);
    for (const s of specs) {
      expect([s.widthMm, s.heightMm, s.bleedMm, s.safeMm, s.dpi]).toEqual([94, 54, 2, 6, 300]);
      expect({ width: s.pxW, height: s.pxH }).toEqual(shopBcExpectedPx(300));
      expect([s.pxW, s.pxH]).toEqual([1110, 638]);
      expect(s.trimmed).toBe(true);
    }
    expect(specs[1]!.optional).toBe(true);
    // The vertical card is the same model turned (offered later).
    const v = studioSurfaces("card", CARD_PORTRAIT_PRINT);
    expect([v[0]!.widthMm, v[0]!.heightMm, v[0]!.pxW, v[0]!.pxH]).toEqual([54, 94, 638, 1110]);
  });

  it("starts with the front only; the back stays when the document has it", () => {
    const d = card();
    expect(d.surfaces.map((s) => s.id)).toEqual([CARD_FRONT_ID]);
    expect(fitDocToSurfaces(d, docSurfaceBases(d, specs)).surfaces.map((s) => s.id)).toEqual([CARD_FRONT_ID]);
    const two = addCardBack(d, specs, { kind: "blank" }, "ro");
    expect(two.surfaces.map((s) => s.id)).toEqual([CARD_FRONT_ID, CARD_BACK_ID]);
    expect(fitDocToSurfaces(two, docSurfaceBases(two, specs)).surfaces.map((s) => s.id)).toEqual([CARD_FRONT_ID, CARD_BACK_ID]);
    expect(parseStudioDoc(JSON.parse(JSON.stringify(two)))).not.toBeNull();
    expect(cardSides(d)).toBe("one");
    expect(cardSides(two)).toBe("two");
    expect(cardHasBack(removeCardBack(two))).toBe(false);
  });

  it("adds a back as a copy of the front's style, blank or from a back template (vCard from «Datele mele»)", () => {
    const fields = { name: "Ana Ciobanu", company: "Dor de Cafea", phone: "+373 69 123 456", email: "ana@dor.md" };
    const front = instantiateStudioTemplate(studioTemplateById("card-corporate")!, "card", specs, "ro", fields);
    expect(front.surfaces).toHaveLength(1);
    const copy = addCardBack(front, specs, { kind: "copy" }, "ro", fields).surfaces[1]!;
    expect(copy.layers.some((l) => l.kind === "shape")).toBe(true);
    expect(copy.layers.some((l) => l.kind === "text" && l.text === "Dor de Cafea" && !l.placeholder)).toBe(true);
    expect(addCardBack(front, specs, { kind: "blank" }, "ro").surfaces[1]!.layers).toEqual([]);
    const backs = studioCardBackTemplates();
    expect(backs.map((t) => t.id)).toEqual(["card-back-logo", "card-back-qr"]);
    // Backs are not in the front gallery; the 4 front families are.
    expect(studioTemplatesFor("card").map((t) => t.id)).toEqual(["card-minimal", "card-corporate", "card-bold", "card-elegant"]);
    const qrBack = addCardBack(front, specs, { kind: "template", template: studioTemplateById("card-back-qr")! }, "ro", fields).surfaces[1]!;
    const q = qrBack.layers.find((l) => l.kind === "qr");
    expect(q && q.kind === "qr" && q.qr.type).toBe("vcard");
    expect(q && q.kind === "qr" ? qrPayload(q.qr.type, q.qr.data) : "").toContain("TEL;TYPE=CELL:+37369123456");
    expect(q && q.kind === "qr" ? layerQrMatrix(q) : null).not.toBeNull();
    // The front keeps what the customer made.
    expect(addCardBack(front, specs, { kind: "copy" }, "ro", fields).surfaces[0]).toEqual(front.surfaces[0]);
  });
});

describe("business card quality and verify", () => {
  it("warns when text is outside the safe zone and blocks it across the cut", () => {
    expect(codes(card(text({ x: 20, y: 20 })))).toEqual([]);
    expect(codes(card(text({ x: 4, y: 20 })))).toEqual(["yellow:safeZone"]);
    expect(codes(card(text({ x: 0.5, y: 20 })))).toEqual(["red:trim"]);
  });

  it("warns when a background does not reach the bleed edge", () => {
    expect(codes(card(shape(), text({ color: "#ffffff" })))).toEqual([]);
    // Stops at the cut line: a white sliver after cutting.
    expect(codes(card(shape({ x: 2, y: 2, w: 90, h: 50 }), text({ color: "#ffffff" })))).toEqual(["yellow:bleedShort"]);
    // A band across the top, into the bleed: fine.
    expect(codes(card(shape({ x: 0, y: 0, w: 94, h: 14 }), text({ y: 30 })))).toEqual([]);
  });

  it("does not print untouched samples: listed as empty fields, an all-sample card is empty", () => {
    const d = card(text({ placeholder: true, text: "Numele Prenumele", bind: "name" }), text({ id: "t2", y: 32, text: "+373 69 123 456", bind: "phone" }));
    expect(codes(d)).toEqual(["yellow:sampleNotPrinted"]);
    const notes = studioVerifyNotes(d);
    expect(notes.samples).toEqual([]);
    expect(notes.notPrinted).toEqual([{ layerId: "t", what: "sampleText", text: "Numele Prenumele", surfaceId: CARD_FRONT_ID }]);
    const onlySamples = card(text({ placeholder: true, text: "Numele Prenumele" }));
    expect(codes(onlySamples)).toContain("red:designEmpty");
    // An empty logo spot is not printed: a warning, not a blocker.
    const logo = card(text({ w: 36 }), { id: "p", kind: "image", x: 64, y: 15, w: 20, h: 20, rotation: 0, src: null, mask: "rect", crop: { zoom: 1, ox: 0, oy: 0 }, bind: "logo" });
    expect(codes(logo)).toEqual(["yellow:photoEmpty"]);
  });

  it("every front template with «Datele mele» filled opens without a print problem", () => {
    const fields = { name: "Ana Ciobanu", title: "Barista", company: "Dor de Cafea", phone: "+373 69 123 456", email: "ana@dor.md", site: "dor.md", address: "Str. Ștefan cel Mare 1" };
    for (const tpl of studioTemplatesFor("card")) {
      const d = instantiateStudioTemplate(tpl, "card", specs, "ro", fields);
      const items = evaluateStudioQuality(d, specs).filter((i) => i.code !== "photoEmpty");
      expect(items, tpl.id).toEqual([]);
    }
  });
});

/** Render a surface the way the print export does (same `drawPrintArea`), into a PNG. */
async function exportSide(doc: StudioDoc, surfaceId: string): Promise<Buffer> {
  const spec = specs.find((s) => s.id === surfaceId)!;
  const c = createCanvas(spec.pxW, spec.pxH);
  const ctx = c.getContext("2d") as unknown as CanvasRenderingContext2D;
  drawPrintArea(ctx, doc.surfaces.find((s) => s.id === surfaceId)!, spec, assets, spec.pxW, spec.pxH, { asPrinted: true });
  return c.encode("png");
}

async function pixel(png: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
}

describe("business card print files (bc-2)", () => {
  const front = card(shape({ fill: "#d7263d" }), text({ color: "#ffffff" }));
  const two = addCardBack(front, specs, { kind: "blank" }, "ro");
  const both: StudioDoc = { ...two, surfaces: two.surfaces.map((s) => (s.id === CARD_BACK_ID ? { ...s, background: "#14213d" } : s)) };

  it("exports each side at 1110×638 px, bleed filled, no guides, samples left out", async () => {
    const png = await exportSide(both, CARD_FRONT_ID);
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([1110, 638]);
    // The background runs to the very corner (bleed), no red cut line / blue safe line in the file.
    expect(await pixel(png, 0, 0)).toEqual([215, 38, 61]);
    expect(await pixel(png, 24, 300)).toEqual([215, 38, 61]);
    expect(await pixel(png, 71, 300)).toEqual([215, 38, 61]);
    // A card with only an untouched sample prints white.
    const sample = await exportSide(card(text({ placeholder: true, color: "#000000", x: 0, y: 0, w: 94, h: 54, sizePt: 120, text: "MMMM" })), CARD_FRONT_ID);
    expect(await pixel(sample, 555, 319)).toEqual([255, 255, 255]);
  });

  it("the workshop imposition accepts the exported PNGs unchanged (A4+, 12 up, back turned 180°)", async () => {
    const layout = computeBusinessCardSheetLayout({ sheetWidthCm: 22.5, sheetHeightCm: 32, cardWidthCm: 9.4, cardHeightCm: 5.4 });
    expect(layout.cardsPerSheet).toBe(12);
    const sheets = await buildBusinessCardSheetPngs({
      layout,
      sides: [
        { label: "front", fileName: "card-front.png", buffer: await exportSide(both, CARD_FRONT_ID) },
        { label: "back", fileName: "card-back.png", buffer: await exportSide(both, CARD_BACK_ID), rotateDeg: 180 },
      ],
      artworkFit: "cover",
    });
    expect(sheets.map((s) => s.label)).toEqual(["front", "back"]);
    for (const s of sheets) {
      const m = await sharp(s.png).metadata();
      expect([m.width, m.height]).toEqual([cmToPx(22.5, 300), cmToPx(32, 300)]);
    }
    const W = cmToPx(22.5, 300);
    const H = cmToPx(32, 300);
    // The middle of the sheet is inside a card: front red, back navy.
    expect(await pixel(sheets[0]!.png, Math.round(W / 2) - 200, Math.round(H / 2) - 40)).toEqual([215, 38, 61]);
    expect(await pixel(sheets[1]!.png, Math.round(W / 2) - 200, Math.round(H / 2) - 40)).toEqual([20, 33, 61]);
  });

  it("goes into the cart as the business-card pack with front / back files and the Studio approval", () => {
    const quote = cardQuoteLine(both, { pack: 200, lamination: "matte" });
    expect(quote).toEqual({ kind: "businessCard", pricing: "shopPack", sides: "two", quantity: 200, lamination: "matte" });
    expect(cardQuoteLine(front)).toEqual({ kind: "businessCard", pricing: "shopPack", sides: "one", quantity: 100 });
    // Priced by the existing business-card price (not changed here).
    expect(shopBcTotalMdl(100, "one")).toBe(150);
    expect(shopBcTotalMdl(100, "two")).toBe(200);
    const studio = { v: 1 as const, docId: both.id, approvedAt: "2026-11-06T10:00:00.000Z", checks: ["text", "edges", "quality", "product"] };
    const line = cardDesignCartLine({
      id: "l1",
      addedAt: 1,
      quote,
      front: { fileKey: "uploads/1762400000000-card-front.png", fileName: "card-front.png", sizeBytes: 1000, thumb: "data:image/jpeg;base64,AAAA" },
      back: { fileKey: "uploads/1762400000001-card-back.png", fileName: "card-back.png", sizeBytes: 900 },
      layout: toLegacyLayout(both),
      preview: "data:image/jpeg;base64,BBBB",
      studio,
      title: "Cărți de vizită 90×50 mm",
      optionsText: "Față + verso",
      lastTotal: null,
      fallbackImage: "/business-cards.svg",
    }) as CartLine;
    expect(line.slug).toBe(SHOP_BC_SLUG);
    expect(line.image).toBe("data:image/jpeg;base64,BBBB");
    expect(line.files.map((f) => f.zone)).toEqual(shopBcRequiredZones("two"));
    expect(isStudioQuoteKind("card", line.quote)).toBe(true);
    // Survives the cart's storage with its design (so «Editează designul» reopens it).
    const back = parseCart(serializeCart([line]));
    expect(back[0]?.design?.editor).toBe("card");
    expect(back[0]?.design?.studio?.docId).toBe(both.id);
    // The checkout body: zones kept, design + approval sent and accepted by the server schema.
    const body = checkoutLine(back[0]!);
    expect(body.files?.map((f) => ("zone" in f ? f.zone : null))).toEqual(["front", "back"]);
    const parsed = shopLineDesignSchema.safeParse(body.design);
    expect(parsed.success).toBe(true);
    expect(shopDesignApprovalProblem(parsed.success ? parsed.data : undefined)).toBeNull();
    // One side only: no back file even when one is passed.
    const one = cardDesignCartLine({ ...{ id: "l2", addedAt: 1, layout: toLegacyLayout(front), preview: null, studio, title: "", optionsText: "", lastTotal: null, fallbackImage: null }, quote: cardQuoteLine(front), front: { fileKey: "uploads/1762400000000-a.png", fileName: "a.png" }, back: { fileKey: "uploads/1762400000000-b.png", fileName: "b.png" } });
    expect(one.files.map((f) => f.zone)).toEqual(["front"]);
  });
});

describe("business card gate", () => {
  it("is off for customers unless SHOP_STUDIO_CARD=1, even with the Studio on for everyone", () => {
    expect(isStudioCardEnabled({ SHOP_STUDIO_EDITOR: "1" })).toBe(false);
    expect(isStudioCardEnabled({ SHOP_STUDIO_CARD: "1" })).toBe(true);
    expect(isStudioCardEnabled({}, { tester: true })).toBe(true);
    expect(isStudioCardEnabled({}, { tester: false })).toBe(false);
  });
});
