import { describe, expect, it } from "vitest";
import { buildCardDoc } from "./cardBuild";
import { emptyStudioDoc, type StudioDoc, type StudioTextLayer } from "./document";
import { flyerPrint } from "./flyer";
import { formatPhoneForPrint, moldovaPhoneE164 } from "./phone";
import { normalizePhone, qrPayload } from "./qr";
import { applyStudioFields, printedFields } from "./smartFields";
import { initialSurfaceBases, studioSurfaces } from "./surfaces";
import { studioTemplateById, studioTemplatesFor } from "./templates";

describe("phone as printed", () => {
  it("formats Moldovan numbers in the international style", () => {
    expect(formatPhoneForPrint("069123456")).toBe("+373 69 123 456");
    expect(formatPhoneForPrint("022123456")).toBe("+373 22 123 456");
    expect(formatPhoneForPrint("069 123 456")).toBe("+373 69 123 456");
    expect(formatPhoneForPrint("069-123-456")).toBe("+373 69 123 456");
    expect(formatPhoneForPrint("+37369123456")).toBe("+373 69 123 456");
    expect(formatPhoneForPrint("373 69 123 456")).toBe("+373 69 123 456");
    expect(formatPhoneForPrint("+373 (69) 12-34-56")).toBe("+373 69 123 456");
    expect(formatPhoneForPrint("00373 69 123 456")).toBe("+373 69 123 456");
    expect(formatPhoneForPrint(" 079123456 ")).toBe("+373 79 123 456");
    // Already formatted: unchanged.
    expect(formatPhoneForPrint("+373 69 123 456")).toBe("+373 69 123 456");
  });

  it("leaves anything else as typed", () => {
    for (const v of ["+40 721 123 456", "+7 912 345 67 89", "1234", "069 12 34", "0691234567", "000123456", "Sună-ne!", "069123456, 022123456", "+3736912345", ""]) {
      expect(formatPhoneForPrint(v), v).toBe(v);
    }
  });

  it("gives the E.164 form for QR codes", () => {
    expect(moldovaPhoneE164("069123456")).toBe("+37369123456");
    expect(moldovaPhoneE164("+40 721 123 456")).toBeNull();
    expect(normalizePhone("069123456")).toBe("+37369123456");
    expect(normalizePhone("+40 721 123 456")).toBe("+40721123456");
    expect(qrPayload("tel", { phone: "069123456" })).toBe("tel:+37369123456");
    expect(qrPayload("vcard", { name: "Ana Ciobanu", phone: "069123456" })).toContain("TEL;TYPE=CELL:+37369123456");
  });

  it("only business cards and flyers print it formatted; the typed fields stay as typed", () => {
    const f = { phone: "069123456" };
    expect(printedFields(f, "card").phone).toBe("+373 69 123 456");
    expect(printedFields(f, "flyer").phone).toBe("+373 69 123 456");
    expect(printedFields(f, "mug")).toBe(f);
    expect(f.phone).toBe("069123456");
    const phoneText = (d: StudioDoc) => d.surfaces.flatMap((s) => s.layers).find((l): l is StudioTextLayer => l.kind === "text" && l.bind === "phone");
    const base = (kind: "card" | "mug") => emptyStudioDoc(kind, initialSurfaceBases(studioSurfaces(kind)));
    const withPhone = (d: StudioDoc): StudioDoc => ({
      ...d,
      surfaces: d.surfaces.map((s, i) => (i ? s : { ...s, layers: [{ id: "t", kind: "text", x: 0, y: 0, w: 40, h: 5, rotation: 0, text: "x", fontFamily: "Roboto", bold: false, sizePt: 9, color: "#000000", align: "left", lineHeight: 1.2, bind: "phone" }] })),
    });
    expect(phoneText(applyStudioFields(withPhone(base("card")), f))?.text).toBe("+373 69 123 456");
    expect(phoneText(applyStudioFields(withPhone(base("mug")), f))?.text).toBe("069123456");
  });

  it("is printed formatted on every business card and flyer template that shows the phone; the vCard has E.164", () => {
    const fields = { name: "Ana Ciobanu", company: "Dor de Cafea", phone: "069123456", email: "ana@dor.md", headline: "Deschidem!" };
    for (const kind of ["card", "flyer"] as const) {
      const specs = studioSurfaces(kind, kind === "flyer" ? flyerPrint("a6") : undefined);
      for (const front of studioTemplatesFor(kind)) {
        const doc = buildCardDoc({ kind, front, back: null, fields, lang: "ro", specs });
        for (const l of doc.surfaces.flatMap((s) => s.layers)) {
          if (l.kind === "text" && l.bind === "phone") expect(l.text, front.id).toBe("+373 69 123 456");
          if (l.kind === "qr" && l.qr.type === "vcard") expect(qrPayload("vcard", l.qr.data), front.id).toContain("TEL;TYPE=CELL:+37369123456");
        }
      }
    }
    expect(studioTemplateById("flyer-back-logo")).not.toBeNull();
  });
});
