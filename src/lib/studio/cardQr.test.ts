import { createCanvas, loadImage } from "@napi-rs/canvas";
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { buildCardDoc, qrModuleMm } from "./cardBuild";
import { nodeMeasure, renderCardSide } from "./cardTestKit";
import type { StudioDoc, StudioQrLayer } from "./document";
import { QR_MIN_MODULE_MM } from "./qr";
import type { StudioFields } from "./smartFields";
import { CARD_BACK_ID, studioSurfaces } from "./surfaces";
import { studioTemplateById } from "./templates";

const specs = studioSurfaces("card");
const backSpec = specs.find((s) => s.id === CARD_BACK_ID)!;

const TYPICAL: StudioFields = { name: "Ana Ciobanu", title: "Director de vânzări", company: "Dor de Cafea", phone: "+373 69 123 456", email: "ana@dordecafea.md", site: "www.dordecafea.md", address: "Str. Ștefan cel Mare 1, Chișinău" };
const DENSE_RU: StudioFields = {
  name: "Александр Константинович Мунтяну",
  title: "Главный бухгалтер-ревизор",
  company: "ООО «Бухгалтерия и Аудит Эксперт»",
  phone: "+373 22 12 34 56",
  email: "alexandru.munteanu@contabilitate-audit.md",
  site: "www.contabilitate-audit-expert.md",
  address: "бул. Дачия 47/2, оф. 305, Кишинёв MD-2062",
};

const qrBack = (fields: StudioFields): StudioDoc =>
  buildCardDoc({ front: studioTemplateById("card-minimal")!, back: studioTemplateById("card-back-qr"), fields, lang: "ro", specs, measure: nodeMeasure });
const qrOf = (doc: StudioDoc): StudioQrLayer => doc.surfaces.find((s) => s.id === CARD_BACK_ID)!.layers.find((l): l is StudioQrLayer => l.kind === "qr")!;

/** The back drawn at print resolution (300 dpi), read back by a QR decoder. */
async function decodePrinted(doc: StudioDoc): Promise<string | null> {
  const png: Buffer = renderCardSide(doc, backSpec, { asPrinted: true });
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);
  return jsQR(new Uint8ClampedArray(data.data), img.width, img.height)?.data ?? null;
}

describe("business-card contact QR at its printed size", () => {
  it("a typical card keeps every detail with modules well over the scan minimum, and the 300 dpi print decodes", async () => {
    const doc = qrBack(TYPICAL);
    const qr = qrOf(doc);
    expect(Object.keys(qr.qr.data)).toEqual(expect.arrayContaining(["name", "phone", "email", "site", "address", "title", "company"]));
    expect(qrModuleMm(qr)!).toBeGreaterThanOrEqual(QR_MIN_MODULE_MM);
    const text = await decodePrinted(doc);
    expect(text).toContain("BEGIN:VCARD");
    expect(text).toContain("Ana Ciobanu");
    expect(text).toContain("Ștefan cel Mare");
  });

  it("a dense Cyrillic vCard drops the address (then the title) until a module is ≥ 0.4 mm, keeps name / phone / e-mail, and still decodes", async () => {
    const doc = qrBack(DENSE_RU);
    const qr = qrOf(doc);
    expect(qrModuleMm(qr)!).toBeGreaterThanOrEqual(QR_MIN_MODULE_MM);
    expect(qr.qr.data.address).toBeUndefined();
    expect(qr.qr.data.name).toBe(DENSE_RU.name);
    expect(qr.qr.data.phone).toBe(DENSE_RU.phone);
    expect(qr.qr.data.email).toBe(DENSE_RU.email);
    const text = await decodePrinted(doc);
    expect(text).toContain("Мунтяну");
    expect(text).toContain("+37322123456");
  });
});
