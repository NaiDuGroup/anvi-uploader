import { describe, expect, it } from "vitest";
import { buildMugTemplates } from "@/lib/mug/templates";
import { MUG_DEFAULT_PRINT, NOTEBOOK_DEFAULT_PRINT, PEN_DEFAULT_PRINT, cmToPx } from "@/lib/printDimensions";
import { applyShopDesign, designFilePaperType, shopDesignLayoutSchema } from "@/lib/shop/designLine";
import { mugLayoutDataSchema, notebookLayoutDataSchema, penLayoutDataSchema } from "@/lib/validations";
import type { ShopDesignLayout } from "@/lib/storefront/design";
import {
  addLayer,
  duplicateLayer,
  emptyStudioDoc,
  fitDocToSurfaces,
  imageDrawRect,
  imageEffectiveDpi,
  layerBounds,
  panCrop,
  parseStudioDoc,
  removeLayer,
  reorderLayer,
  updateLayer,
  type StudioDoc,
  type StudioImageLayer,
  type StudioTextLayer,
} from "./document";
import { studioExportPlan } from "./exportPlan";
import { isStudioEditorEnabled } from "./flag";
import { fromLegacyLayout, isStudioLegacyLayout, parseCssColor, toLegacyLayout } from "./legacy";
import { qrMatrix, qrPayload } from "./qr";
import { studioSurfaces, surfaceBase } from "./surfaces";

const text = (over: Partial<StudioTextLayer> = {}): StudioTextLayer => ({
  id: "t1",
  kind: "text",
  x: 10,
  y: 10,
  w: 60,
  h: 15,
  rotation: 0,
  text: "Ana",
  fontFamily: "Playfair Display",
  bold: true,
  sizePt: 24,
  color: "#14213d",
  align: "center",
  lineHeight: 1.2,
  ...over,
});

const photo = (over: Partial<StudioImageLayer> = {}): StudioImageLayer => ({
  id: "p1",
  kind: "image",
  x: 0,
  y: 0,
  w: 40,
  h: 40,
  rotation: 0,
  src: { key: "uploads/1730000000000-a.jpg", naturalW: 2000, naturalH: 1000 },
  mask: "circle",
  crop: { zoom: 1, ox: 0, oy: 0 },
  ...over,
});

function mugDoc(): StudioDoc {
  return emptyStudioDoc("mug", studioSurfaces("mug").map(surfaceBase));
}

describe("studio document model", () => {
  it("builds a mug document in mm over the catalog print area", () => {
    const d = mugDoc();
    expect(d.surfaces).toHaveLength(1);
    expect(d.surfaces[0]).toMatchObject({ id: "wrap", widthMm: 210, heightMm: 96, layers: [] });
    expect(parseStudioDoc(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("validates layers and rejects malformed or oversized documents", () => {
    let d = mugDoc();
    d = addLayer(d, "wrap", text());
    d = addLayer(d, "wrap", photo());
    expect(parseStudioDoc(d)?.surfaces[0]!.layers).toHaveLength(2);
    expect(parseStudioDoc({ ...d, v: 2 })).toBeNull();
    expect(parseStudioDoc(addLayer(mugDoc(), "wrap", text({ color: "red" })))).toBeNull();
    const big = { ...d, surfaces: [{ ...d.surfaces[0]!, layers: Array.from({ length: 61 }, (_, i) => text({ id: `t${i}` })) }] };
    expect(parseStudioDoc(big)).toBeNull();
  });

  it("edits layers immutably: update, reorder, duplicate, remove", () => {
    let d = addLayer(addLayer(mugDoc(), "wrap", text()), "wrap", photo());
    const before = d;
    d = updateLayer(d, "t1", { text: "Ion" });
    expect((before.surfaces[0]!.layers[0] as StudioTextLayer).text).toBe("Ana");
    expect((d.surfaces[0]!.layers[0] as StudioTextLayer).text).toBe("Ion");
    d = reorderLayer(d, "t1", "top");
    expect(d.surfaces[0]!.layers.map((l) => l.id)).toEqual(["p1", "t1"]);
    d = reorderLayer(d, "t1", -1);
    expect(d.surfaces[0]!.layers.map((l) => l.id)).toEqual(["t1", "p1"]);
    d = duplicateLayer(d, "t1");
    expect(d.surfaces[0]!.layers).toHaveLength(3);
    expect(d.surfaces[0]!.layers[1]!.x).toBe(13);
    d = removeLayer(d, "p1");
    expect(d.surfaces[0]!.layers.map((l) => l.kind)).toEqual(["text", "text"]);
  });

  it("computes rotated bounds", () => {
    const b = layerBounds({ x: 0, y: 0, w: 20, h: 10, rotation: 90 });
    expect(b.w).toBeCloseTo(10);
    expect(b.h).toBeCloseTo(20);
    expect(b.x).toBeCloseTo(5);
  });

  it("covers the mask box with the photo and keeps it covered while panning", () => {
    const p = photo();
    const r = imageDrawRect(p, 2000, 1000);
    expect(r.h).toBeCloseTo(40);
    expect(r.w).toBeCloseTo(80);
    expect(r.x).toBeCloseTo(-20);
    const crop = panCrop(p, 2000, 1000, 100, 100);
    expect(crop).toEqual({ zoom: 1, ox: 1, oy: 0 });
    expect(imageDrawRect({ ...p, crop }, 2000, 1000).x).toBeCloseTo(0);
  });

  it("gives the effective dpi of a photo at its print size", () => {
    // 2000 px over 80 mm drawn width ≈ 635 dpi; zoom ×2 halves it.
    expect(imageEffectiveDpi(photo())).toBeCloseTo(635, 0);
    expect(imageEffectiveDpi(photo({ crop: { zoom: 2, ox: 0, oy: 0 } }))).toBeCloseTo(317.5, 0);
    expect(imageEffectiveDpi(photo({ src: null }))).toBeNull();
  });

  it("refits layers to another print size, keeping shapes", () => {
    const d = addLayer(mugDoc(), "wrap", text({ x: 95, y: 40, w: 20, h: 16 }));
    const wide = studioSurfaces("mug", { widthCm: 23, heightCm: 9.6, dpi: 300 }).map(surfaceBase);
    const f = fitDocToSurfaces(d, wide);
    const t = f.surfaces[0]!.layers[0] as StudioTextLayer;
    expect(f.surfaces[0]!.widthMm).toBe(230);
    expect(t.w).toBeCloseTo(20);
    expect(t.x + t.w / 2).toBeCloseTo(105 * (230 / 210));
    expect(t.sizePt).toBe(24);
  });
});

describe("legacy layout converters", () => {
  const legacy: ShopDesignLayout = {
    templateId: "photo_text",
    text: "La mulți ani!",
    fontFamily: "Lobster",
    textColor: "#b5532f",
    backgroundColor: "#f6eee3",
    photoUrls: ["uploads/1730000000000-photo.jpg"],
    photoSettings: [{ fitMode: "cover", alignment: "left", verticalAlignment: "center", naturalWidth: 3000, naturalHeight: 2000 }],
  };

  it("turns an old mug layout into layers in mm (slots → photos, caption → text)", () => {
    const d = fromLegacyLayout("mug", legacy, MUG_DEFAULT_PRINT);
    const tpl = buildMugTemplates(cmToPx(21, 300), cmToPx(9.6, 300)).find((t) => t.id === "photo_text")!;
    const [img, txt] = d.surfaces[0]!.layers as [StudioImageLayer, StudioTextLayer];
    expect(d.templateId).toBe("legacy:photo_text");
    expect(d.surfaces[0]!.background).toBe("#f6eee3");
    expect(img.kind).toBe("image");
    expect(img.w).toBeCloseTo((tpl.photoSlots[0]!.width / 300) * 25.4, 3);
    expect(img.src).toEqual({ key: "uploads/1730000000000-photo.jpg", naturalW: 3000, naturalH: 2000 });
    expect(img.crop.ox).toBe(-1);
    expect(txt).toMatchObject({ kind: "text", text: "La mulți ani!", fontFamily: "Lobster", color: "#b5532f", align: "center" });
    expect(txt.x + txt.w / 2).toBeCloseTo((tpl.textSlot.x / 300) * 25.4, 3);
    expect(parseStudioDoc(d)).not.toBeNull();
  });

  it("converts notebook and pen layouts too", () => {
    const nb = fromLegacyLayout("notebook", { ...legacy, templateId: "nope" }, NOTEBOOK_DEFAULT_PRINT);
    expect(nb.surfaces[0]!.widthMm).toBe(140);
    expect(parseStudioDoc(nb)).not.toBeNull();
    const pen = fromLegacyLayout("pen", { ...legacy, photoUrls: [], photoSettings: [] }, PEN_DEFAULT_PRINT);
    expect(pen.surfaces[0]!.layers.some((l) => l.kind === "text")).toBe(true);
    expect(parseStudioDoc(pen)).not.toBeNull();
  });

  it("summarises a Studio document as an old layout the order schemas accept", () => {
    let d = mugDoc();
    d = { ...d, templateId: "xmas-snow" };
    d = addLayer(d, "wrap", photo());
    d = addLayer(d, "wrap", text({ id: "t1", text: "Crăciun fericit" }));
    d = addLayer(d, "wrap", text({ id: "t2", text: "Numele tău", placeholder: true }));
    d = addLayer(d, "wrap", photo({ id: "p2", src: { localId: "x", naturalW: 10, naturalH: 10 } }));
    const l = toLegacyLayout(d);
    expect(l).toMatchObject({
      templateId: "studio:xmas-snow",
      text: "Crăciun fericit",
      fontFamily: "Playfair Display",
      textColor: "#14213d",
      backgroundColor: "transparent",
      photoUrls: ["uploads/1730000000000-a.jpg"],
    });
    expect(isStudioLegacyLayout(l)).toBe(true);
    expect(isStudioLegacyLayout(legacy)).toBe(false);
    for (const schema of [mugLayoutDataSchema, notebookLayoutDataSchema, penLayoutDataSchema, shopDesignLayoutSchema]) {
      expect(schema.safeParse(l).success).toBe(true);
    }
  });

  it("round-trips old → Studio → old for caption, font, colours and photos", () => {
    const back = toLegacyLayout(fromLegacyLayout("mug", legacy));
    expect(back).toMatchObject({
      text: legacy.text,
      fontFamily: legacy.fontFamily,
      textColor: legacy.textColor,
      backgroundColor: legacy.backgroundColor,
      photoUrls: legacy.photoUrls,
    });
    expect(back.photoSettings[0]).toMatchObject({ naturalWidth: 3000, naturalHeight: 2000 });
  });

  it("parses css colours", () => {
    expect(parseCssColor("#ABC")).toEqual({ hex: "#aabbcc", alpha: 1 });
    expect(parseCssColor("rgba(0, 0, 0, 0.35)")).toEqual({ hex: "#000000", alpha: 0.35 });
    expect(parseCssColor("transparent")).toBeNull();
  });
});

describe("export parity with the old editors", () => {
  it.each([
    ["mug", MUG_DEFAULT_PRINT],
    ["notebook", NOTEBOOK_DEFAULT_PRINT],
    ["pen", PEN_DEFAULT_PRINT],
    ["mug", { widthCm: 19.5, heightCm: 8.2, dpi: 300 }],
  ] as const)("%s %o: same pixels, dpi and paperType", (kind, print) => {
    const plan = studioExportPlan(kind, print);
    // The old editors size the canvas with cmToPx(printWidthCm, printDpi) and save `${kind}_layout`.
    expect(plan.pxW).toBe(cmToPx(print.widthCm, print.dpi));
    expect(plan.pxH).toBe(cmToPx(print.heightCm, print.dpi));
    expect(plan.dpi).toBe(print.dpi);
    expect(plan.paperType).toBe(designFilePaperType(kind));
    expect(plan.paperType).toBe(`${kind}_layout`);
    expect(Math.abs(plan.pxPerMm * print.heightCm * 10 - plan.pxH)).toBeLessThan(1);
  });

  it("a Studio mug design reaches the order line like an old one (layout + paperType)", () => {
    let d = mugDoc();
    d = addLayer(d, "wrap", text());
    const line = applyShopDesign(
      { productType: "mug", files: [{ fileKey: "shop-orders/x.png", fileName: "mug.png", copies: 1 }] } as never,
      { editor: "mug", layout: shopDesignLayoutSchema.parse(toLegacyLayout(d)) },
    ) as unknown as { mugLayoutData: ShopDesignLayout; files: { paperType: string }[] };
    expect(line.files[0]!.paperType).toBe("mug_layout");
    expect(line.mugLayoutData.templateId).toBe("studio");
    expect(line.mugLayoutData.text).toBe("Ana");
  });

  it("marks the mug handle strips and seam", () => {
    const s = studioSurfaces("mug")[0]!;
    expect(s.zones.map((z) => z.x)).toEqual([0, 195]);
    expect(s.seams).toEqual([0, 210]);
    expect(studioSurfaces("notebook")[0]!.zones).toEqual([]);
  });
});

describe("hidden flag", () => {
  it("is off by default and for normal visitors", () => {
    expect(isStudioEditorEnabled({})).toBe(false);
    expect(isStudioEditorEnabled({ SHOP_STUDIO_EDITOR: "0" })).toBe(false);
    expect(isStudioEditorEnabled({ SHOP_STUDIO_EDITOR: "true" })).toBe(false);
    expect(isStudioEditorEnabled({}, { tester: false })).toBe(false);
  });
  it("opens with SHOP_STUDIO_EDITOR=1 or for testers / staff", () => {
    expect(isStudioEditorEnabled({ SHOP_STUDIO_EDITOR: "1" })).toBe(true);
    expect(isStudioEditorEnabled({}, { tester: true })).toBe(true);
  });
});

describe("qr payloads", () => {
  it("builds url, tel, wifi and vCard payloads", () => {
    expect(qrPayload("url", { url: "anvi.md" })).toBe("https://anvi.md");
    expect(qrPayload("tel", { phone: "+373 60 000 000" })).toBe("tel:+37360000000");
    expect(qrPayload("wifi", { ssid: "Cafe;1", password: "p@ss", security: "WPA" })).toBe(String.raw`WIFI:T:WPA;S:Cafe\;1;P:p@ss;;`);
    const v = qrPayload("vcard", { name: "Ana Ciobanu", company: "Dor de Cafea", phone: "060 000 000" });
    expect(v).toContain("N:Ciobanu;Ana;;;");
    expect(v).toContain("ORG:Dor de Cafea");
    expect(qrPayload("url", { url: " " })).toBe("");
  });
  it("encodes UTF-8 text into a square matrix", () => {
    const m = qrMatrix("https://anvi.md/ș-ț-Привет");
    expect(m).not.toBeNull();
    expect(m!.dark).toHaveLength(m!.size * m!.size);
    expect(qrMatrix("")).toBeNull();
  });
});
