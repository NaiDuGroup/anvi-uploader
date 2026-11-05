import { describe, expect, it } from "vitest";
import { FONT_OPTIONS } from "@/lib/editor/editorPalette";
import { parseStudioDoc, type StudioImageLayer, type StudioQrLayer, type StudioShapeLayer, type StudioTextLayer } from "./document";
import { evaluateStudioQuality } from "./quality";
import { carryOverTemplate, fieldsFromDoc } from "./smartFields";
import { studioSurfaces } from "./surfaces";
import {
  STUDIO_INDUSTRIES,
  STUDIO_OCCASIONS,
  STUDIO_TEMPLATES,
  STUDIO_TEMPLATE_FONTS,
  instantiateStudioTemplate,
  studioTemplateById,
  studioTemplatesFor,
  templateKinds,
} from "./templates";

const PLACEHOLDER_CODES = new Set(["photoEmpty", "textPlaceholder", "qrEmpty"]);
const texts = (d: { surfaces: { layers: unknown[] }[] }) =>
  d.surfaces[0]!.layers.filter((l): l is StudioTextLayer => (l as StudioTextLayer).kind === "text");

describe("studio templates", () => {
  it("has about 20 templates with unique ids, Christmas first, every product covered", () => {
    expect(STUDIO_TEMPLATES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(STUDIO_TEMPLATES.map((t) => t.id)).size).toBe(STUDIO_TEMPLATES.length);
    expect(STUDIO_TEMPLATES[0]!.occasion).toBe("xmas");
    expect(studioTemplatesFor("mug").length).toBeGreaterThanOrEqual(20);
    expect(studioTemplatesFor("notebook").length).toBeGreaterThanOrEqual(20);
    expect(studioTemplatesFor("pen").length).toBeGreaterThanOrEqual(8);
    expect(studioTemplatesFor("mug", { occasion: "xmas" }).length).toBeGreaterThanOrEqual(4);
    expect(studioTemplatesFor("mug", { industry: "cafe" }).map((t) => t.id)).toContain("cafe-morning");
    for (const o of STUDIO_OCCASIONS) expect(studioTemplatesFor("mug", { occasion: o }).length, o).toBeGreaterThan(0);
    for (const i of STUDIO_INDUSTRIES) expect(studioTemplatesFor("mug", { industry: i }).length, i).toBeGreaterThan(0);
    expect(studioTemplateById("nope")).toBeNull();
  });

  it("uses only fonts with Cyrillic and ș/ț", () => {
    for (const f of STUDIO_TEMPLATE_FONTS) {
      const opt = FONT_OPTIONS.find((o) => o.family === f);
      expect(opt, f).toBeDefined();
      expect(opt!.latinOnly, f).toBeFalsy();
    }
  });

  for (const tpl of STUDIO_TEMPLATES) {
    for (const kind of templateKinds(tpl)) {
      it(`${tpl.id} on ${kind}: valid document, nothing but placeholders to fix`, () => {
        const specs = studioSurfaces(kind);
        for (const lang of ["ro", "ru", "en"] as const) {
          const d = instantiateStudioTemplate(tpl, kind, specs, lang);
          expect(parseStudioDoc(d), `${lang} parse`).not.toBeNull();
          expect(d.templateId).toBe(tpl.id);
          const items = evaluateStudioQuality(d, specs).filter((i) => !PLACEHOLDER_CODES.has(i.code));
          expect(items, `${lang} quality`).toEqual([]);
          // Pens stay simple.
          if (kind === "pen") expect(texts(d).length).toBeLessThanOrEqual(2);
        }
      });
    }
  }

  it("fills «Datele mele» into every product and carries the text across templates", () => {
    const fields = { name: "Ana Ciobanu", company: "Dor de Cafea", phone: "+373 69 123 456", site: "dordecafea.md", brandColor1: "#b5532f" };
    for (const kind of ["mug", "notebook", "pen"] as const) {
      const d = instantiateStudioTemplate(studioTemplateById("business-card")!, kind, studioSurfaces(kind), "ro", fields);
      const shown = texts(d).map((t) => t.text);
      expect(shown, kind).toContain("Ana Ciobanu");
      expect(texts(d).every((t) => !t.bind || t.text !== "" ), kind).toBe(true);
    }
    // Customer types on the canvas, then switches template: values follow by key, the free text too.
    const specs = studioSurfaces("mug");
    let a = instantiateStudioTemplate(studioTemplateById("corp-contact-qr")!, "mug", specs, "ro", { name: "Ana" });
    a = {
      ...a,
      surfaces: [{ ...a.surfaces[0]!, layers: a.surfaces[0]!.layers.map((l) => (l.kind === "text" && l.bind === "phone" ? { ...l, text: "+373 69 000 111", placeholder: false } : l.kind === "text" && l.bind === "company" ? { ...l, text: "Dor de Cafea", placeholder: false } : l)) }],
    };
    expect(fieldsFromDoc(a)).toMatchObject({ name: "Ana", phone: "+373 69 000 111", company: "Dor de Cafea" });
    const b = carryOverTemplate(a, instantiateStudioTemplate(studioTemplateById("business-card")!, "mug", specs, "ro"));
    const bt = texts(b);
    expect(bt.find((t) => t.bind === "name")?.text).toBe("Ana");
    expect(bt.find((t) => t.bind === "phone")).toMatchObject({ text: "+373 69 000 111", placeholder: false });
    expect(b.id).toBe(a.id);
    const c = carryOverTemplate(b, instantiateStudioTemplate(studioTemplateById("cafe-beans-qr")!, "mug", specs, "ro"));
    expect(texts(c).find((t) => t.bind === "company")?.text).toBe("Dor de Cafea");
    // Free text typed by the customer survives a switch.
    const withFree = { ...c, surfaces: [{ ...c.surfaces[0]!, layers: c.surfaces[0]!.layers.map((l) => (l.kind === "text" && !l.bind ? { ...l, text: "Cu drag!", placeholder: false } : l)) }] };
    const d = carryOverTemplate(withFree, instantiateStudioTemplate(studioTemplateById("xmas-snow")!, "mug", specs, "ro"));
    expect(texts(d).map((t) => t.text)).toContain("Cu drag!");
  });

  it("binds brand colours, the logo spot and the QR to the customer's site", () => {
    const logo = { localId: "logo1", naturalW: 800, naturalH: 800 };
    const d = instantiateStudioTemplate(studioTemplateById("cafe-beans-qr")!, "mug", studioSurfaces("mug"), "ru", { site: "dordecafea.md" });
    const q = d.surfaces[0]!.layers.find((l): l is StudioQrLayer => l.kind === "qr")!;
    expect(q.qr.data.url).toBe("dordecafea.md");
    const e = instantiateStudioTemplate(studioTemplateById("corp-logo-band")!, "notebook", studioSurfaces("notebook"), "en", { logo, brandColor1: "#00aa55" });
    expect(e.surfaces[0]!.layers.find((l): l is StudioImageLayer => l.kind === "image")!.src).toEqual(logo);
    expect(e.surfaces[0]!.layers.find((l): l is StudioShapeLayer => l.kind === "shape")!.fill).toBe("#00aa55");
    expect(evaluateStudioQuality(e, studioSurfaces("notebook")).filter((i) => i.level === "red")).toEqual([]);
  });

  it("on a pen a white template background is dropped and the texts read on the pen colour", () => {
    const specs = studioSurfaces("pen");
    const minimal = STUDIO_TEMPLATES.find((tpl) => templateKinds(tpl).includes("pen") && tpl.background != null && /^#f/i.test(tpl.background))!;
    expect(minimal).toBeDefined();
    const onBlack = instantiateStudioTemplate(minimal, "pen", specs, "ro", {}, "#1b1b1f");
    expect(onBlack.surfaces[0]!.background).toBeNull();
    expect(evaluateStudioQuality(onBlack, specs, { productColorHex: "#1b1b1f" }).filter((i) => i.code === "lowContrast")).toEqual([]);
    // A coloured background (a navy band) stays: it is the design.
    const navy = STUDIO_TEMPLATES.find((tpl) => templateKinds(tpl).includes("pen") && tpl.id === "ny-gold")!;
    expect(instantiateStudioTemplate(navy, "pen", specs, "ro", {}, "#1b1b1f").surfaces[0]!.background).toBe("#0f1a30");
  });
});
