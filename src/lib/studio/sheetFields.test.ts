import { describe, expect, it } from "vitest";
import { cardSideSlots, matchingBack } from "./cardBuild";
import { SHEET_AUTO_BACK_FALLBACK, cardShortDoc, cardShortStart, cardShortWithAutoBack, sheetAutoBack, sheetFieldsNotShown } from "./cardFlow";
import { docFitsSpec, flyerDefaultOptions, flyerListTotal, flyerPrint, flyerQuoteLine, sheetSpecsKey, FLYER_IDS } from "./flyer";
import { psLinePrice } from "@/lib/storefront/printShop/pricing";
import { CARD_BACK_ID, studioSurfaces } from "./surfaces";
import { studioTemplateById, studioTemplatesFor, type StudioTemplate } from "./templates";
import type { StudioSurface } from "./document";

const FLYER = {
  headline: "Pizzeria Dor",
  bullets: "Livrare gratuită\nPizza 40 cm\nDesert cadou",
  offer: "-30%",
  company: "Dor de Cafea",
  phone: "069123456",
  address: "Str. Ștefan cel Mare 1, Chișinău",
};
const a5 = studioSurfaces("flyer", flyerPrint("a5"));

describe("fields a design does not show", () => {
  it("lists the filled fields «Ofertă mare» leaves out, in the form's order", () => {
    const tpl = studioTemplateById("flyer-promo-sale")!;
    const doc = cardShortDoc(cardShortStart(tpl), { fields: FLYER, lang: "ro", specs: a5 })!;
    const missing = sheetFieldsNotShown(doc, FLYER, "flyer");
    expect(missing).toContain("bullets");
    // Only what the customer filled.
    expect(missing).not.toContain("body");
    expect(missing).not.toContain("email");
    // Shown on this design.
    expect(missing).not.toContain("headline");
    expect(missing).not.toContain("offer");
  });

  it("is empty when the design shows everything filled, and ignores empty / other products' fields", () => {
    const tpl = studioTemplateById("flyer-promo-sale")!;
    const doc = cardShortDoc(cardShortStart(tpl), { fields: { headline: "Reduceri", offer: "-30%" }, lang: "ro", specs: a5 })!;
    expect(sheetFieldsNotShown(doc, { headline: "Reduceri", offer: "-30%", body: "  ", name: "Ana", title: "Director" }, "flyer")).toEqual([]);
  });

  it("counts a field on the back, and a contact carried by a vCard QR, as shown", () => {
    const fields = { name: "Ana Ciobanu", phone: "069123456", email: "ana@dor.md", address: "Str. X 1" };
    const specs = studioSurfaces("card");
    for (const front of studioTemplatesFor("card")) {
      const one = cardShortDoc(cardShortStart(front), { fields, lang: "ro", specs })!;
      const two = cardShortDoc({ ...cardShortStart(front), backId: matchingBack(front)!.id }, { fields, lang: "ro", specs })!;
      // A back only adds what is printed.
      expect(sheetFieldsNotShown(two, fields, "card").every((k) => sheetFieldsNotShown(one, fields, "card").includes(k)), front.id).toBe(true);
    }
    const qrDoc = { surfaces: [{ id: "front", layers: [{ id: "q", kind: "qr", x: 0, y: 0, w: 10, h: 10, rotation: 0, bind: "vcard", qr: { type: "vcard", data: { name: "Ana Ciobanu", email: "ana@dor.md" } } }] }] } as unknown as { surfaces: StudioSurface[] };
    expect(sheetFieldsNotShown(qrDoc, { name: "Ana Ciobanu", email: "ana@dor.md", phone: "1" }, "card")).toEqual(["phone"]);
  });

  it("counts the company as shown by the customer's logo or its monogram, not otherwise", () => {
    const tpl = studioTemplateById("flyer-promo-sale")!;
    const logo = { localId: "l1", naturalW: 400, naturalH: 200 };
    const plain = cardShortDoc(cardShortStart(tpl), { fields: FLYER, lang: "ro", specs: a5 })!;
    expect(sheetFieldsNotShown(plain, FLYER, "flyer")).toContain("company");
    const withLogo = cardShortDoc(cardShortStart(tpl), { fields: { ...FLYER, logo }, lang: "ro", specs: a5 })!;
    expect(sheetFieldsNotShown(withLogo, { ...FLYER, logo }, "flyer")).not.toContain("company");
    const card = { name: "Ana Ciobanu", company: "Dor de Cafea", phone: "069123456" };
    const mono = cardShortDoc(cardShortStart(studioTemplateById("card-minimal")!), { fields: card, lang: "ro", specs: studioSurfaces("card") })!;
    expect(sheetFieldsNotShown(mono, card, "card")).toEqual([]);
  });
});

describe("back added on the verify step", () => {
  const freeSlots = (t: StudioTemplate) => cardSideSlots(t, "back", "ro", a5, "flyer").filter((s) => s.kind === "text");

  it("the fallback backs print only the customer's details (no sample texts)", () => {
    expect(freeSlots(studioTemplateById(SHEET_AUTO_BACK_FALLBACK.flyer)!)).toEqual([]);
    expect(cardSideSlots(studioTemplateById(SHEET_AUTO_BACK_FALLBACK.card)!, "back", "ro", studioSurfaces("card"), "card").filter((s) => s.kind === "text")).toEqual([]);
  });

  it("never auto-adds a back with sample texts left (the coupon of «Ofertă mare»)", () => {
    for (const front of studioTemplatesFor("flyer")) {
      const back = sheetAutoBack(front, {}, "ro", a5, "flyer")!;
      expect(freeSlots(back), `${front.id} → ${back.id}`).toEqual([]);
    }
    const sale = studioTemplateById("flyer-promo-sale")!;
    expect(matchingBack(sale)!.id).toBe("flyer-back-coupon");
    expect(cardShortWithAutoBack(cardShortStart(sale), "ro", a5).backId).toBe("flyer-back-logo");
  });

  it("keeps the front's own back when the customer wrote all its texts", () => {
    const sale = studioTemplateById("flyer-promo-sale")!;
    const coupon = matchingBack(sale)!;
    const texts = Object.fromEntries(freeSlots(coupon).map((s) => [s.id, "Text"]));
    expect(sheetAutoBack(sale, texts, "ro", a5, "flyer")!.id).toBe(coupon.id);
    // A back already on stays.
    expect(cardShortWithAutoBack({ ...cardShortStart(sale), backId: "flyer-back-steps" }, "ro", a5).backId).toBe("flyer-back-steps");
  });
});

describe("flyer price on a format switch", () => {
  it("is the list price of the picked format, computed at once (the same psLinePrice the server answers with)", () => {
    const seen = new Set<number>();
    for (const f of FLYER_IDS) {
      for (const back of [false, true]) {
        const line = flyerQuoteLine({ surfaces: back ? ([{ id: CARD_BACK_ID }] as StudioSurface[]) : [] }, flyerDefaultOptions(f));
        const total = flyerListTotal(line);
        expect(total, f).toBe(psLinePrice(line)!.total);
        expect(total, f).toBeGreaterThan(0);
        if (!back) seen.add(total!);
      }
    }
    // Formats have their own prices (a switch must change the number).
    expect(seen.size).toBeGreaterThan(1);
    expect(flyerListTotal(null)).toBeNull();
  });

  it("knows when the document is still at the previous format's size", () => {
    const a6 = studioSurfaces("flyer", flyerPrint("a6"));
    expect(sheetSpecsKey(a5)).not.toBe(sheetSpecsKey(a6));
    const doc = cardShortDoc(cardShortStart(studioTemplateById("flyer-promo-sale")!), { fields: FLYER, lang: "ro", specs: a5 })!;
    expect(docFitsSpec(doc, a5[0]!)).toBe(true);
    expect(docFitsSpec(doc, a6[0]!)).toBe(false);
    // A side the document does not have yet (the back) is not «stale».
    expect(docFitsSpec(doc, a6.find((s) => s.id === CARD_BACK_ID)!)).toBe(true);
  });
});
