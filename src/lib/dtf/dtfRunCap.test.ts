import { describe, expect, it } from "vitest";
import { buildDtfLineData, type DtfPricingContext } from "./buildDtfLineData";
import type { DtfCatalogJson, DtfGarmentJson } from "./dtfDto";
import { quoteDtfDraft, type DtfDraft } from "./dtfDraft";
import type { DtfPresetOption } from "./dtfLineCalc";
import type { DtfLineInput } from "./dtfLineInput";
import { DEFAULT_DTF_SETTINGS } from "./dtfSettings";
import { defaultPriceTiers } from "./garmentPriceTiers";
import { publicDtfEngineInput } from "@/lib/publicQuote/publicQuote";
import type { DtfCustomerType } from "./types";

/** Production price list 2026-11. */
const LOGO = "00000000-0000-4000-8000-000000000001";
const A6 = "00000000-0000-4000-8000-000000000002";
const A5 = "00000000-0000-4000-8000-000000000003";
const A4 = "00000000-0000-4000-8000-000000000004";
const PRESETS: DtfPresetOption[] = [
  { id: LOGO, label: "Logo 10×10", widthCm: 10, heightCm: 10, retailPrice: 100, dealerPrice: 40 },
  { id: A6, label: "A6 10×15", widthCm: 10, heightCm: 15, retailPrice: 100, dealerPrice: 40 },
  { id: A5, label: "A5 15×21", widthCm: 15, heightCm: 21, retailPrice: 140, dealerPrice: 60 },
  { id: A4, label: "A4 21×30", widthCm: 21, heightCm: 30, retailPrice: 180, dealerPrice: 80 },
];
const UNIT_COSTS = { filmPerLinearMeterMdl: 4.83, inkPerMlMdl: 0.4, powderPerGramMdl: 0.18 };

function garment(
  id: string,
  kind: DtfGarmentJson["kind"],
  sizes: string[],
  priceTiers: DtfGarmentJson["variants"][number]["priceTiers"],
  extra: Partial<DtfGarmentJson> = {},
): DtfGarmentJson {
  return {
    id,
    stockItemId: id.split(":")[0],
    categoryCode: kind,
    categoryNames: { ro: kind, ru: kind, en: kind },
    itemNames: { ro: id, ru: id, en: id },
    kind,
    name: id,
    colorName: "White",
    colorHex: "#ffffff",
    includedPrint: null,
    variants: sizes.map((size, i) => ({
      id: `${id}-${size}`,
      size,
      sortOrder: i,
      stockQuantity: 10_000,
      unitCostMdl: 30,
      priceTiers,
    })),
    ...extra,
  };
}

const CAP = garment("eris:white", "cap", ["—"], defaultPriceTiers("cap"), {
  includedPrint: { widthCm: 10, heightCm: 10 },
  maxPrint: { widthCm: 5, heightCm: 9 },
});
const SHIRT = garment("dogo:white", "tshirt", ["S", "M", "L", "XL"], defaultPriceTiers("tshirt"));
const BAG = garment("napa:navy", "bag", ["—"], [{ minQty: 1, priceMdl: 21 }]);
const TOY = garment("lenny:fox", "other", ["—"], [{ minQty: 1, priceMdl: 282 }]);

function ctxFor(g: DtfGarmentJson): DtfPricingContext {
  return { garment: g, presets: PRESETS, settings: DEFAULT_DTF_SETTINGS, unitCosts: UNIT_COSTS };
}

function input(g: DtfGarmentJson, sizes: Record<string, number>, zone: DtfLineInput["zones"][number]): DtfLineInput {
  return {
    garmentSource: "stock",
    garmentProductId: g.id,
    sizes: Object.entries(sizes).map(([size, quantity]) => ({ size, quantity })),
    zones: [zone],
  };
}

const CAP_ZONE = { id: "front", placement: "front" as const, presetId: null, widthCm: 9, heightCm: 5 };
const A4_ZONE = { id: "front", placement: "front" as const, presetId: A4 };
const LOGO_ZONE = { id: "front", placement: "front" as const, presetId: LOGO };

function total(g: DtfGarmentJson, sizes: Record<string, number>, zone: DtfLineInput["zones"][number], who: DtfCustomerType = "retail"): number {
  return buildDtfLineData(input(g, sizes, zone), who, ctxFor(g)).pricing.totalSellPriceMdl;
}

/** Spread `q` pieces over S/M/L/XL as a customer would (M and L heavier). */
function spread(q: number): Record<string, number> {
  const weights: [string, number][] = [["S", 1], ["M", 3], ["L", 3], ["XL", 1]];
  const out: Record<string, number> = {};
  let left = q;
  weights.forEach(([size, w], i) => {
    const n = i === weights.length - 1 ? left : Math.min(left, Math.floor((q * w) / 8));
    if (n > 0) out[size] = n;
    left -= n;
  });
  return out;
}

const CASES: [string, DtfGarmentJson, (q: number) => Record<string, number>, DtfLineInput["zones"][number]][] = [
  ["cap ERIS, logo 9×5", CAP, (q) => ({ "—": q }), CAP_ZONE],
  ["T-shirt one size, A4", SHIRT, (q) => ({ M: q }), A4_ZONE],
  ["T-shirt several sizes, A4", SHIRT, spread, A4_ZONE],
  ["bag NAPA, logo", BAG, (q) => ({ "—": q }), LOGO_ZONE],
  ["toy LENNY, logo", TOY, (q) => ({ "—": q }), LOGO_ZONE],
];

describe("DTF line: a bigger package is never cheaper", () => {
  for (const who of ["retail", "dealer"] as const) {
    for (const [name, g, sizes, zone] of CASES) {
      it(`${who}: ${name} — totals never drop from 1 to 400 pcs, whole lei`, () => {
        let prev = 0;
        for (let q = 1; q <= 400; q++) {
          const t = total(g, sizes(q), zone, who);
          expect(t, `${q} pcs`).toBeGreaterThanOrEqual(prev);
          expect(Number.isInteger(t), `${q} pcs = ${t}`).toBe(true);
          prev = t;
        }
      });
    }
  }

  it("caps the QA examples at the next step", () => {
    expect(total(CAP, { "—": 9 }, CAP_ZONE)).toBe(1180);
    expect(total(CAP, { "—": 10 }, CAP_ZONE)).toBe(1180);
    expect(total(CAP, { "—": 49 }, CAP_ZONE)).toBe(5000);
    expect(total(CAP, { "—": 50 }, CAP_ZONE)).toBe(5000);
    expect(total(CAP, { "—": 8 }, CAP_ZONE)).toBe(1180);
    expect(total(CAP, { "—": 7 }, CAP_ZONE)).toBe(1050);
    expect(total(BAG, { "—": 49 }, LOGO_ZONE)).toBe(4550);
    expect(total(BAG, { "—": 43 }, LOGO_ZONE)).toBe(4550);
    expect(total(BAG, { "—": 42 }, LOGO_ZONE)).toBe(4452);
  });

  it("keeps uncapped lines unchanged and records the cap", () => {
    const own = buildDtfLineData(input(CAP, { "—": 7 }, CAP_ZONE), "retail", ctxFor(CAP));
    expect(own.pricing.runCapDiscountMdl).toBeUndefined();
    const capped = buildDtfLineData(input(CAP, { "—": 9 }, CAP_ZONE), "retail", ctxFor(CAP));
    const p = capped.pricing;
    expect(p.runCapDiscountMdl).toBe(170);
    expect(p.garmentSellTotalMdl + p.printSellTotalMdl + p.pressSellTotalMdl - (p.runCapDiscountMdl ?? 0)).toBe(p.totalSellPriceMdl);
  });

  it("caps a layout shared by two lines on its share of the bigger run", () => {
    // 5 + 4 caps of one layout: run 9, as one line of 9 → 1180 together.
    const a = buildDtfLineData(input(CAP, { "—": 5 }, CAP_ZONE), "retail", ctxFor(CAP), 9).pricing.totalSellPriceMdl;
    const b = buildDtfLineData(input(CAP, { "—": 4 }, CAP_ZONE), "retail", ctxFor(CAP), 9).pricing.totalSellPriceMdl;
    expect(a).toBe(655); // floor(5×118×10/9)
    expect(b).toBe(524);
    expect(a + b).toBeLessThanOrEqual(1180);
  });
});

describe("storefront and studio wizard price DTF lines alike", () => {
  const catalog = (g: DtfGarmentJson): DtfCatalogJson => ({
    garments: [g],
    presets: PRESETS.map((p, i) => ({ ...p, isActive: true, sortOrder: i })),
    settings: DEFAULT_DTF_SETTINGS,
    unitCosts: UNIT_COSTS,
  });
  for (const [name, g, sizes, zone] of CASES) {
    it(name, () => {
      for (const q of [1, 2, 9, 10, 30, 49, 50, 120]) {
        const shop = publicDtfEngineInput({ kind: "dtf", garmentId: g.id, sizes: Object.entries(sizes(q)).map(([size, quantity]) => ({ size, quantity })), zones: [zone] } as never);
        if ("error" in shop) throw new Error(shop.error);
        const storefront = buildDtfLineData(shop, "retail", ctxFor(g)).pricing.totalSellPriceMdl;
        const draft: DtfDraft = {
          garmentSource: "stock",
          garmentProductId: g.id,
          sizes: Object.entries(sizes(q)).map(([size, n]) => ({ size, quantityStr: String(n) })),
          zones: [
            {
              id: zone.id,
              placement: zone.placement,
              presetId: zone.presetId,
              widthStr: zone.widthCm ? String(zone.widthCm) : "",
              heightStr: zone.heightCm ? String(zone.heightCm) : "",
            },
          ],
        };
        const wizard = quoteDtfDraft(draft, "retail", catalog(g));
        expect(wizard.ok && wizard.data.pricing.totalSellPriceMdl, `${q} pcs`).toBe(storefront);
      }
    });
  }
});
