import { describe, expect, it } from "vitest";
import { addLayer, emptyStudioDoc, type StudioDoc, type StudioImageLayer, type StudioLayer, type StudioQrLayer, type StudioShapeLayer, type StudioTextLayer } from "./document";
import {
  accountStudioFields,
  applyStudioFields,
  carryOverTemplate,
  fieldsFromDoc,
  mergeStudioFields,
  parseStudioFields,
  studioFieldsSchema,
} from "./smartFields";
import { studioSurfaces, surfaceBase } from "./surfaces";

const t = (id: string, o: Partial<StudioTextLayer> = {}): StudioTextLayer => ({
  id, kind: "text", x: 40, y: 20, w: 60, h: 12, rotation: 0, text: "Sample", fontFamily: "Roboto", bold: true,
  sizePt: 20, color: "#14213d", align: "center", lineHeight: 1.2, ...o,
});
const img = (id: string, o: Partial<StudioImageLayer> = {}): StudioImageLayer => ({
  id, kind: "image", x: 10, y: 10, w: 30, h: 30, rotation: 0, src: null, mask: "circle", crop: { zoom: 1, ox: 0, oy: 0 }, ...o,
});
const doc = (...layers: StudioLayer[]): StudioDoc => {
  let d = emptyStudioDoc("mug", studioSurfaces("mug").map(surfaceBase));
  for (const l of layers) d = addLayer(d, "wrap", l);
  return d;
};
const texts = (d: StudioDoc) => d.surfaces[0]!.layers.filter((l): l is StudioTextLayer => l.kind === "text");

describe("Datele mele smart fields", () => {
  it("fills bound texts, the logo and brand colours; empty fields keep the sample", () => {
    const shape: StudioShapeLayer = { id: "s", kind: "shape", shape: "rect", x: 0, y: 0, w: 10, h: 10, rotation: 0, fill: "#000000", bindColor: "brandColor1" };
    const d = doc(t("a", { bind: "name", text: "Numele tău", placeholder: true }), t("b", { bind: "phone", text: "+373 …", placeholder: true }), img("logo", { bind: "logo" }), shape);
    const out = applyStudioFields(d, { name: "Ana Ciobanu", phone: "  ", brandColor1: "#b5532f", logo: { localId: "x", naturalW: 500, naturalH: 500 } });
    const [a, b] = texts(out);
    expect(a).toMatchObject({ text: "Ana Ciobanu", placeholder: false });
    expect(b).toMatchObject({ text: "+373 …", placeholder: true });
    expect((out.surfaces[0]!.layers[2] as StudioImageLayer).src).toEqual({ localId: "x", naturalW: 500, naturalH: 500 });
    expect((out.surfaces[0]!.layers[3] as StudioShapeLayer).fill).toBe("#b5532f");
    expect(fieldsFromDoc(out)).toEqual({ name: "Ana Ciobanu", logo: { localId: "x", naturalW: 500, naturalH: 500 }, brandColor1: "#b5532f" });
  });

  it("switching template keeps bound values, free texts and photos", () => {
    const photo = { key: "uploads/1730000000000-a.jpg", naturalW: 1000, naturalH: 1000 };
    const old = doc(
      t("n", { bind: "name", text: "Ion" }),
      t("c", { bind: "company", text: "Dor de Cafea" }),
      t("f1", { text: "Cu drag" }),
      t("f2", { text: "2027" }),
      img("p", { src: photo }),
    );
    const next = { ...doc(t("x", { bind: "company", text: "Compania", placeholder: true }), t("y", { bind: "name", text: "Nume", placeholder: true }), t("z", { text: "Titlu", placeholder: true }), img("q")), templateId: "new" };
    const out = carryOverTemplate(old, next);
    expect(out.id).toBe(old.id);
    expect(out.templateId).toBe("new");
    expect(texts(out).map((l) => [l.text, !!l.placeholder])).toEqual([
      ["Dor de Cafea", false],
      ["Ion", false],
      ["Cu drag", false],
      ["2027", false],
    ]);
    const photos = out.surfaces[0]!.layers.filter((l): l is StudioImageLayer => l.kind === "image");
    expect(photos).toHaveLength(1);
    expect(photos[0]!.src).toEqual(photo);
  });

  it("switching template keeps the customer's QR codes (data into the new QR spots, the rest on top)", () => {
    const qr = (id: string, o: Partial<StudioQrLayer> = {}): StudioQrLayer => ({
      id, kind: "qr", x: 150, y: 30, w: 25, h: 25, rotation: 0, qr: { type: "url", data: { url: "" } }, color: "#000000", background: null, ...o,
    });
    const wifi = { type: "wifi" as const, data: { ssid: "Cafe", password: "secret123", security: "WPA" } };
    const old = doc(qr("a", { qr: wifi }), qr("b", { x: 10, qr: { type: "tel", data: { phone: "+373 60 000 000" } } }), qr("empty"));
    const next = { ...doc(qr("spot", { x: 80, color: "#14213d", background: "#ffffff", qr: { type: "url", data: { url: "anvi.md" } } })), templateId: "new" };
    const out = carryOverTemplate(old, next);
    const qrs = out.surfaces[0]!.layers.filter((l): l is StudioQrLayer => l.kind === "qr");
    expect(qrs).toHaveLength(2);
    // The template spot keeps its place and colours, takes the customer's data.
    expect(qrs[0]).toMatchObject({ x: 80, color: "#14213d", background: "#ffffff", qr: wifi });
    // The second one has no spot: added as it was (new id); the empty one is dropped.
    expect(qrs[1]).toMatchObject({ x: 10, qr: { type: "tel", data: { phone: "+373 60 000 000" } } });
    expect(qrs[1]!.id).not.toBe("b");
    // No QR in the old design: the template spot keeps its own data.
    const plain = carryOverTemplate(doc(t("n", { text: "Ion" })), next);
    expect(plain.surfaces[0]!.layers.find((l): l is StudioQrLayer => l.kind === "qr")!.qr).toEqual({ type: "url", data: { url: "anvi.md" } });
  });

  it("moves a kept QR / photo off the new template's text when there is room", () => {
    const keptQr: StudioQrLayer = { id: "q", kind: "qr", x: 80, y: 35, w: 25, h: 25, rotation: 0, qr: { type: "url", data: { url: "a.md" } }, color: "#000000", background: "#ffffff" };
    const old = doc(keptQr);
    // The new template has a centred text where the QR was, on a full-area band, and no QR spot.
    const band: StudioShapeLayer = { id: "bg", kind: "shape", shape: "rect", x: 0, y: 0, w: 210, h: 96, rotation: 0, fill: "#14213d" };
    const next = { ...doc(band, t("title", { x: 60, y: 40, w: 90, h: 14, text: "Minimalist" })), templateId: "min" };
    const out = carryOverTemplate(old, next);
    const q = out.surfaces[0]!.layers.find((l): l is StudioQrLayer => l.kind === "qr")!;
    const title = out.surfaces[0]!.layers.find((l) => l.kind === "text")!;
    const hit = q.x < title.x + title.w && title.x < q.x + q.w && q.y < title.y + title.h && title.y < q.y + q.h;
    expect(hit).toBe(false);
    expect(q.x >= 0 && q.y >= 0 && q.x + q.w <= 210 && q.y + q.h <= 96).toBe(true);
  });

  it("validates fields and keeps only a durable logo in the account", () => {
    expect(studioFieldsSchema.safeParse({ name: "x".repeat(201) }).success).toBe(false);
    expect(studioFieldsSchema.safeParse({ brandColor1: "red" }).success).toBe(false);
    expect(studioFieldsSchema.safeParse({ logo: { key: "../etc", naturalW: 1, naturalH: 1 } }).success).toBe(false);
    expect(studioFieldsSchema.safeParse({ other: 1 }).success).toBe(false);
    expect(parseStudioFields({ name: " Ana ", phone: "" })).toEqual({ name: "Ana" });
    expect(parseStudioFields("nope")).toEqual({});
    const logo = { key: "uploads/1730000000000-l.png", naturalW: 10, naturalH: 10 };
    expect(accountStudioFields({ name: "Ana", logo })).toEqual({ name: "Ana" });
    const durable = { ...logo, key: "shop-orders/abc/l.png" };
    expect(accountStudioFields({ logo: durable })).toEqual({ logo: durable });
    expect(mergeStudioFields({ name: "A", site: "a.md" }, { name: "B" })).toEqual({ name: "B", site: "a.md" });
  });
});
