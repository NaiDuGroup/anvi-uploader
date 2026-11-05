import { describe, expect, it } from "vitest";
import { buildShopOrderView, type ShopLineDescriber } from "@/lib/shop/orderView";
import { shopFallbackPrintAreaCm } from "./catalogStock";
import { lineUnavailableText } from "./checkout";
import { shopT } from "./i18n";
import {
  cartLeadTime,
  leadTimeText,
  leadTimeWithExtra,
  lineLeadTime,
  maxLeadTime,
  SHOP_BASE_LEAD_TIME,
} from "./leadTime";
import { EMPTY_LINE_LABELS, qtySuffix, sizesText, type ShopLineLabels } from "./lineLabels";
import { psProduct, PS_PRODUCTS } from "./printShop/config";
import { printShopPageJsonLd } from "./printShop/seo";
import { psPagesText, psProportionsKey, psT } from "./printShop/text";
import { compareSizes, orientedPresets, shopCmSizeText, shopNumText, shopSizeLabel } from "./sizes";
import type { ShopQuoteLine } from "./types";

describe("sizes: month sizes localized and sorted", () => {
  it("labels «6 мес» in every language", () => {
    expect(shopSizeLabel("6 мес", "ro")).toBe("6 luni");
    expect(shopSizeLabel("1 мес", "ro")).toBe("1 lună");
    expect(shopSizeLabel("24 мес", "ro")).toBe("24 de luni");
    expect(shopSizeLabel("18 мес", "ru")).toBe("18 мес.");
    expect(shopSizeLabel("9 мес", "en")).toBe("9 months");
    expect(shopSizeLabel("1 мес", "en")).toBe("1 month");
    expect(shopSizeLabel("6-9 мес", "ro")).toBe("6–9 luni");
    expect(shopSizeLabel("2 года", "ro")).toBe("2 ani");
    expect(shopSizeLabel("5 лет", "ru")).toBe("5 лет");
    expect(shopSizeLabel("1 год", "en")).toBe("1 year");
    // Letter and numeric sizes stay.
    expect(shopSizeLabel("xl", "ro")).toBe("XL");
    expect(shopSizeLabel("38", "ru")).toBe("38");
  });

  it("sorts months numerically, then letters, then numbers", () => {
    expect(["9 мес", "18 мес", "6 мес"].sort(compareSizes)).toEqual(["6 мес", "9 мес", "18 мес"]);
    expect(["XXL", "M", "3XL", "S", "XS", "2XS", "L", "XL", "XXXL"].sort(compareSizes)).toEqual([
      "2XS",
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "XXL",
      "3XL",
      "XXXL",
    ]);
    expect(["44", "38", "40-42", "M", "2 года", "6 мес"].sort(compareSizes)).toEqual(["6 мес", "2 года", "M", "38", "40-42", "44"]);
  });

  it("cart / order options: localized, smallest first, quantity not repeated", () => {
    const sizes = [
      { size: "18 мес", quantity: 1 },
      { size: "6 мес", quantity: 2 },
    ];
    expect(sizesText(sizes, "ro")).toBe("6 luni×2, 18 luni×1");
    expect(sizesText(sizes, "ru")).toBe("6 мес.×2, 18 мес.×1");
    expect(sizesText(sizes, "en")).toBe("6 months×2, 18 months×1");
    expect(qtySuffix(`Roz · ${sizesText(sizes, "ro")} · Față: Logo`, 3)).toBe("");
    expect(qtySuffix(`Roz · ${sizesText(sizes, "ru")}`, 3)).toBe("");
    expect(qtySuffix("Roz · 24 de luni×1", 1)).toBe("");
    expect(qtySuffix("Negru · logo 9×5 cm", 2)).toBe(" × 2");
  });

  it("an out-of-stock size is named in the language", () => {
    const out = { kind: "line_unavailable" as const, index: 0, reason: "out_of_stock" as const, size: "6 мес", available: 0 };
    expect(lineUnavailableText(out, "Body SWEET", shopT("ro"))).toContain("Body SWEET (6 luni)");
  });
});

describe("UV item on a bottle: one side only", () => {
  it("the checkout code is explained to the customer", () => {
    const out = { kind: "line_unavailable" as const, index: 0, reason: "invalid" as const, code: "uv_zone_side_unavailable" };
    expect(lineUnavailableText(out, "Sticlă KISKO", shopT("ro"))).toContain("doar pe o parte");
    expect(lineUnavailableText(out, "Бутылка KISKO", shopT("ru"))).toContain("только с одной стороны");
    expect(lineUnavailableText(out, "KISKO bottle", shopT("en"))).toContain("one side only");
  });
});

describe("lead time: the longest line", () => {
  const mug: ShopQuoteLine = { kind: "mug", productId: "mug-1", quantity: 1 };
  const labels: ShopLineLabels = {
    ...EMPTY_LINE_LABELS,
    variants: { "mug-1": { slug: "cana", name: "Cană", option: null, madeToOrderDays: 5 } },
  };
  const invitations = PS_PRODUCTS.find((p) => p.id === "invitations")!;
  const inv = { kind: "sheetShop", product: "invitations" } as unknown as ShopQuoteLine;

  it("made to order adds its days; invitations take their own lead time", () => {
    expect(lineLeadTime(mug, EMPTY_LINE_LABELS)).toEqual(SHOP_BASE_LEAD_TIME);
    expect(lineLeadTime(mug, labels)).toEqual({ from: 6, to: 7 });
    expect(invitations.leadDays).toBe(14);
    expect(lineLeadTime(inv, null)).toEqual({ from: 14, to: null });
    expect(cartLeadTime([mug, inv], labels)).toEqual({ from: 14, to: null });
    expect(cartLeadTime([], labels)).toEqual(SHOP_BASE_LEAD_TIME);
    expect(maxLeadTime([leadTimeWithExtra(2), leadTimeWithExtra(5)])).toEqual({ from: 6, to: 7 });
  });

  it("every print-shop product with a lead-time text has its days", () => {
    for (const p of PS_PRODUCTS) if (p.leadTime) expect(p.leadDays, p.id).toBeGreaterThan(0);
  });

  it("texts in every language", () => {
    expect(leadTimeText(SHOP_BASE_LEAD_TIME, shopT("ro"), "checkout")).toBe("Gata în 1–2 zile lucrătoare după plată.");
    expect(leadTimeText({ from: 6, to: 7 }, shopT("ro"), "checkout")).toBe("Gata în 6–7 zile lucrătoare după plată.");
    expect(leadTimeText({ from: 6, to: 7 }, shopT("ro"), "product")).toBe("✓ Gata în 6–7 zile lucrătoare");
    expect(leadTimeText({ from: 14, to: null }, shopT("ro"), "checkout")).toBe("Termen: de la 14 zile lucrătoare după plată.");
    expect(leadTimeText({ from: 19, to: 20 }, shopT("ro"), "order")).toContain("19–20 de zile lucrătoare");
    expect(leadTimeText({ from: 6, to: 7 }, shopT("ru"), "checkout")).toBe("Готовность: 6–7 рабочих дней после оплаты.");
    expect(leadTimeText(SHOP_BASE_LEAD_TIME, shopT("ru"), "product")).toBe("✓ Готово за 1–2 рабочих дня");
    expect(leadTimeText({ from: 14, to: null }, shopT("ru"), "order")).toBe("Срок изготовления: от 14 рабочих дней после оплаты.");
    expect(leadTimeText({ from: 6, to: 7 }, shopT("en"), "checkout")).toBe("Ready in 6–7 working days after payment.");
  });

  it("the order page gets the longest lead time until it ships", () => {
    const describe = (() => null) as ShopLineDescriber;
    describe.leadTime = (q) => ((q as { kind?: string })?.kind === "sheetShop" ? { from: 14, to: null } : SHOP_BASE_LEAD_TIME);
    const order = {
      orderNumber: 7,
      createdAt: new Date("2026-11-05T10:00:00Z"),
      status: "NEW",
      paymentStatus: "paid",
      isPaid: true,
      shippedAt: null,
      price: 500,
      deliveryPriceMdl: 0,
      deliveryMethod: "pickup",
      deliveryCity: null,
      trackingNumber: null,
      customerName: "Ion",
      clientName: null,
      orderLines: [
        { shopLineData: { title: "Cană", quantity: 1, total: 100, quote: { kind: "mug" } } },
        { shopLineData: { title: "Invitații", quantity: 50, total: 400, quote: { kind: "sheetShop" } } },
      ],
    };
    expect(buildShopOrderView(order, describe).leadTime).toEqual({ from: 14, to: null });
    expect(buildShopOrderView({ ...order, shippedAt: new Date() }, describe).leadTime).toBeUndefined();
    expect(buildShopOrderView(order).leadTime).toBeUndefined();
  });
});

describe("desk calendar: page check texts", () => {
  it("no fit buttons → no «choose below»", () => {
    const desk = psProduct("calendarDesk")!;
    expect(psProportionsKey(desk)).toBe("checkProportionsNoFit");
    expect(psProportionsKey(psProduct("flyers")!)).toBe("checkProportions");
    for (const lang of ["ro", "ru", "en"] as const) {
      const text = psT(lang)("checkProportionsNoFit", { size: "214×152" });
      expect(text).toContain("214×152");
      expect(text).not.toMatch(/mai jos|ниже|below/);
    }
  });

  it("pages in the right plural", () => {
    expect(psPagesText(1, "ro")).toBe("1 pagină");
    expect(psPagesText(2, "ro")).toBe("2 pagini");
    expect(psPagesText(20, "ro")).toBe("20 de pagini");
    expect(psPagesText(1, "ru")).toBe("1 страница");
    expect(psPagesText(3, "ru")).toBe("3 страницы");
    expect(psPagesText(12, "ru")).toBe("12 страниц");
    expect(psPagesText(1, "en")).toBe("1 page");
    expect(psPagesText(13, "en")).toBe("13 pages");
    expect(psT("ro")("checkPages", { pages: psPagesText(1, "ro"), need: 13 })).toBe("PDF-ul are 1 pagină, trebuie 13.");
  });
});

describe("UV stock items in the wizard: the shop's fallback zone", () => {
  it("FILEY (no card print area) has its shop zone; unknown SKUs none", () => {
    expect(shopFallbackPrintAreaCm("XM1511S1511")).toEqual({ widthCm: 6, heightCm: 6 });
    expect(shopFallbackPrintAreaCm("NOT-ON-SHOP")).toBeNull();
  });
});

describe("cosmetics", () => {
  it("decimal comma in ro / ru sizes", () => {
    expect(shopCmSizeText(1.5, 45, "ro")).toBe("1,5×45 cm");
    expect(shopCmSizeText(1.5, 45, "ru")).toBe("1,5×45 см");
    expect(shopCmSizeText(1.5, 45, "en")).toBe("1.5×45 cm");
    expect(shopNumText(29.7, "ro")).toBe("29,7");
  });

  it("canvas sizes turn and sort with the orientation", () => {
    const presets = [
      { widthCm: 50, heightCm: 70 },
      { widthCm: 30, heightCm: 40 },
      { widthCm: 60, heightCm: 40 },
    ];
    expect(orientedPresets(presets, false).map((p) => `${p.widthCm}×${p.heightCm}#${p.index}`)).toEqual(["30×40#1", "40×60#2", "50×70#0"]);
    expect(orientedPresets(presets, true).map((p) => `${p.widthCm}×${p.heightCm}#${p.index}`)).toEqual(["40×30#1", "60×40#2", "70×50#0"]);
  });

  it("Tipografie product pages carry Product JSON-LD", () => {
    const env = { SHOP_PUBLIC_URL: "https://anvi.md" };
    const [product, crumbs] = printShopPageJsonLd({ kind: "product", product: psProduct("calendarDesk")! }, "ro", env);
    expect(product).toMatchObject({ "@type": "Product", sku: "calendare-de-birou" });
    expect((product as { offers?: { price: string } }).offers?.price).toBe("130.00");
    expect(crumbs).toMatchObject({ "@type": "BreadcrumbList" });
    const [uv] = printShopPageJsonLd({ kind: "uv" }, "ru", env);
    expect(uv).toMatchObject({ "@type": "Product", sku: "stickere-uv-dtf" });
  });
});
