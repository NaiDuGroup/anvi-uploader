import { describe, expect, it } from "vitest";
import { addLayer, emptyStudioDoc, parseStudioDoc, type StudioDoc, type StudioKind, type StudioTextLayer } from "./document";
import { adaptStudioDoc, contrastingInk } from "./adapt";
import { previewMaxSide } from "./previewSize";
import { evaluateStudioQuality } from "./quality";
import { applyStudioFields } from "./smartFields";
import { STUDIO_TEMPLATES, instantiateStudioTemplate, templateKinds } from "./templates";
import { studioSurfaces, surfaceBase } from "./surfaces";

const KINDS: StudioKind[] = ["mug", "notebook", "pen"];
const specsOf = (k: StudioKind) => studioSurfaces(k);
const reds = (d: StudioDoc) => new Set(evaluateStudioQuality(d, specsOf(d.kind)).filter((i) => i.level === "red").map((i) => i.code));

const FIELDS = { name: "Ana Ciobanu", company: "Dor de Cafea", site: "dordecafea.md", phone: "+373 60 000 000", title: "Administrator" };

describe("adaptStudioDoc", () => {
  it("every template, filled with «Datele mele», adapts to every product: valid, ids unique, no new red items", () => {
    for (const tpl of STUDIO_TEMPLATES) {
      for (const from of templateKinds(tpl)) {
        const src = applyStudioFields(instantiateStudioTemplate(tpl, from, specsOf(from), "ro"), FIELDS);
        const before = reds(src);
        for (const to of KINDS) {
          if (to === from) continue;
          const out = adaptStudioDoc(src, to, specsOf(to));
          expect(parseStudioDoc(JSON.parse(JSON.stringify(out))), `${tpl.id} ${from}→${to}`).not.toBeNull();
          expect(out.kind).toBe(to);
          expect(out.id).not.toBe(src.id);
          expect(out.templateId).toBe(src.templateId);
          const ids = out.surfaces[0]!.layers.map((l) => l.id);
          expect(new Set(ids).size).toBe(ids.length);
          for (const code of reds(out)) expect(before.has(code), `${tpl.id} ${from}→${to}: new red ${code}`).toBe(true);
        }
      }
    }
  });

  it("puts the most important texts on the pen, in at most two lines, no QR or photos", () => {
    const tpl = STUDIO_TEMPLATES.find((t) => templateKinds(t).includes("mug"))!;
    let src = applyStudioFields(instantiateStudioTemplate(tpl, "mug", specsOf("mug"), "ro"), FIELDS);
    src = addLayer(src, src.surfaces[0]!.id, { id: "qr1", kind: "qr", x: 100, y: 30, w: 25, h: 25, rotation: 0, qr: { type: "url", data: { url: "anvi.md" } }, color: "#000000", background: null });
    const pen = adaptStudioDoc(src, "pen", specsOf("pen"));
    const layers = pen.surfaces[0]!.layers;
    expect(layers.some((l) => l.kind === "qr")).toBe(false);
    expect(layers.filter((l) => l.kind === "image" && l.bind !== "logo")).toHaveLength(0);
    const texts = layers.filter((l): l is StudioTextLayer => l.kind === "text");
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.length).toBeLessThanOrEqual(2);
    for (const t of texts) {
      expect(t.sizePt).toBeGreaterThanOrEqual(5);
      expect(t.text).not.toContain("\n");
    }
  });

  it("re-flows a mug wrap onto the portrait notebook cover inside the safe zone", () => {
    let src = emptyStudioDoc("mug", specsOf("mug").map(surfaceBase));
    src = { ...src, surfaces: [{ ...src.surfaces[0]!, background: "#f6eee3" }] };
    src = addLayer(src, "wrap", { id: "band", kind: "shape", shape: "rect", x: 0, y: 80, w: 210, h: 16, rotation: 0, fill: "#b5532f" });
    src = addLayer(src, "wrap", { id: "t", kind: "text", x: 60, y: 30, w: 90, h: 20, rotation: 0, text: "Bună dimineața", fontFamily: "Playfair Display", bold: true, sizePt: 40, color: "#3b2a20", align: "center", lineHeight: 1.2 });
    const nb = adaptStudioDoc(src, "notebook", specsOf("notebook"));
    const s = nb.surfaces[0]!;
    expect(s.background).toBe("#f6eee3");
    const band = s.layers[0]!;
    expect(band.w).toBeCloseTo(140);
    const t = s.layers[1] as StudioTextLayer;
    expect(t.x).toBeGreaterThanOrEqual(5);
    expect(t.x + t.w).toBeLessThanOrEqual(135);
    expect(t.y + t.h / 2).toBeCloseTo(s.heightMm / 2, 0);
    expect(evaluateStudioQuality(nb, specsOf("notebook")).filter((i) => i.code === "safeZone" || i.code === "outside")).toEqual([]);
  });

  it("keeps the same orientation proportional (mug → a bigger mug)", () => {
    const src = addLayer(emptyStudioDoc("mug", specsOf("mug").map(surfaceBase)), "wrap", { id: "t", kind: "text", x: 95, y: 40, w: 20, h: 16, rotation: 0, text: "A", fontFamily: "Roboto", bold: true, sizePt: 20, color: "#000000", align: "center", lineHeight: 1.2 });
    const big = adaptStudioDoc(src, "mug", studioSurfaces("mug", { widthCm: 23, heightCm: 9.6, dpi: 300 }));
    expect(big.surfaces[0]!.widthMm).toBe(230);
    expect(big.surfaces[0]!.layers[0]!.w).toBeCloseTo(20);
  });
});

describe("previewMaxSide", () => {
  it("uses a small 3D texture on iPhone / iPad, weak and narrow devices", () => {
    expect(previewMaxSide({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe(1024);
    expect(previewMaxSide({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", maxTouchPoints: 5 })).toBe(1024);
    expect(previewMaxSide({ userAgent: "Android", hardwareConcurrency: 4, viewportWidth: 1200 })).toBe(1024);
    expect(previewMaxSide({ userAgent: "X", hardwareConcurrency: 8, viewportWidth: 390 })).toBe(1024);
    expect(previewMaxSide({ userAgent: "Mozilla/5.0 (Macintosh)", maxTouchPoints: 0, hardwareConcurrency: 10, viewportWidth: 1440 })).toBe(1536);
  });
});

describe("mug focus", async () => {
  const { mugFacingRotation, mugLayerTheta, nearestAngle } = await import("./mugFocus");
  it("faces the centre of the print by default and turns towards the edited side", () => {
    const L = Math.PI * 1.6;
    expect(mugLayerTheta({ x: 95, w: 20 }, { widthMm: 210 }, -L / 2, L)).toBeCloseTo(0);
    const right = mugLayerTheta({ x: 180, w: 20 }, { widthMm: 210 }, -L / 2, L);
    expect(right).toBeGreaterThan(0);
    expect(mugFacingRotation(right)).toBeCloseTo(-right);
    expect(mugFacingRotation(right, 0.5)).toBeCloseTo(0.5 - right);
  });
  it("takes the short way round", () => {
    expect(nearestAngle(0, Math.PI * 2 - 0.1)).toBeCloseTo(-0.1);
    expect(nearestAngle(3, -3)).toBeCloseTo(2 * Math.PI - 3);
  });

  it("switches text that would vanish on the target product colour (navy on a black pen → white)", () => {
    let src = emptyStudioDoc("mug", specsOf("mug").map(surfaceBase));
    const navy: StudioTextLayer = { id: "t1", kind: "text", x: 60, y: 30, w: 90, h: 14, rotation: 0, text: "Ana Ciobanu", fontFamily: "Montserrat", bold: true, sizePt: 30, color: "#14213d", align: "center", lineHeight: 1.2, bind: "name" };
    src = addLayer(src, "wrap", navy);
    src = addLayer(src, "wrap", { id: "q1", kind: "qr", x: 150, y: 30, w: 25, h: 25, rotation: 0, qr: { type: "url", data: { url: "anvi.md" } }, color: "#000000", background: null });
    const pen = adaptStudioDoc(src, "pen", specsOf("pen"), { productColorHex: "#1d1d1f" });
    const t = pen.surfaces[0]!.layers.find((l): l is StudioTextLayer => l.kind === "text")!;
    expect(t.color).toBe("#ffffff");
    // No product colour → unchanged.
    const plain = adaptStudioDoc(src, "pen", specsOf("pen"));
    expect(plain.surfaces[0]!.layers.find((l): l is StudioTextLayer => l.kind === "text")!.color).toBe("#14213d");
    // A QR on a black notebook cover gets a white background; a readable colour is left alone.
    const nb = adaptStudioDoc(src, "notebook", specsOf("notebook"), { productColorHex: "#111111" });
    const qr = nb.surfaces[0]!.layers.find((l) => l.kind === "qr");
    expect(qr && qr.kind === "qr" ? qr.background : null).toBe("#ffffff");
    const light = adaptStudioDoc(src, "notebook", specsOf("notebook"), { productColorHex: "#f2bfcf" });
    expect(light.surfaces[0]!.layers.find((l): l is StudioTextLayer => l.kind === "text")!.color).toBe("#14213d");
    expect(contrastingInk("#ffffff")).toBe("#14213d");
  });

  it("mug → notebook: the content fills the cover's safe width", () => {
    let src = emptyStudioDoc("mug", specsOf("mug").map(surfaceBase));
    src = addLayer(src, "wrap", { id: "t1", kind: "text", x: 30, y: 20, w: 150, h: 20, rotation: 0, text: "Bună dimineața", fontFamily: "Montserrat", bold: true, sizePt: 40, color: "#14213d", align: "center", lineHeight: 1.2 });
    const nb = adaptStudioDoc(src, "notebook", specsOf("notebook"));
    const spec = specsOf("notebook")[0]!;
    const t = nb.surfaces[0]!.layers[0]!;
    expect(t.w).toBeGreaterThan(spec.widthMm - 2 * (spec.safeMm + 1) - 0.5);
  });
});
