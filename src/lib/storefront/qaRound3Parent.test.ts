import { describe, expect, it } from "vitest";
import { dtfZoneSizeText, toDtfPublicSummary } from "@/lib/dtf/dtfPublicSummary";
import { dtfRu as adminRu } from "@/lib/i18n/dtf/ru";
import { capZones, CAP_ZONE_NOTE, shopPresetLabel } from "./dtfPrint";
import { buildLineLabels, describeQuoteLine } from "./lineLabels";
import { shopT } from "./i18n";
import type { ShopProduct } from "./types";

describe("shop preset labels in the shop language", () => {
  const logo = { label: "Logo 10×10", widthCm: 10, heightCm: 10 };
  it("names the logo format in each language, A-formats unchanged", () => {
    expect(shopPresetLabel(logo, "ro")).toBe("Logo 10×10");
    expect(shopPresetLabel(logo, "ru")).toBe("Лого 10×10");
    expect(shopPresetLabel(logo, "en")).toBe("Logo 10×10");
    expect(shopPresetLabel({ label: "logo", widthCm: 7.5, heightCm: 7.5 }, "ru")).toBe("Лого 7,5×7,5");
    expect(shopPresetLabel({ label: "A4 21×30", widthCm: 21, heightCm: 30 }, "ru")).toBe("A4 21×30");
  });

  it("writes the cap logo of a cart line in the shop language", () => {
    const cap = {
      slug: "chipiu",
      name: "Chipiu ERIS",
      variants: [],
      dtf: {
        garment: "cap",
        colors: [{ garmentId: "cap:white", label: "Alb", sizeStock: {} }],
        itemZones: [],
        fixedZone: { widthCm: 9, heightCm: 5 },
        prints: [],
      },
    } as unknown as ShopProduct;
    const quote = { kind: "dtf" as const, garmentId: "cap:white", sizes: [{ size: "—", quantity: 3 }], zones: capZones({ widthCm: 9, heightCm: 5 }) };
    const labels = buildLineLabels([cap]);
    expect(describeQuoteLine(quote, labels, shopT("ru"))?.optionsText).toBe("Alb · лого 9×5 см");
    expect(describeQuoteLine(quote, labels, shopT("ro"))?.optionsText).toBe("Alb · logo 9×5 cm");
    expect(describeQuoteLine(quote, labels, shopT("en"))?.optionsText).toBe("Alb · logo 9×5 cm");
  });
});

describe("cap logo zone for the workshop", () => {
  it("is the cap front with the exact logo size, not the T-shirt «full front»", () => {
    expect(capZones({ widthCm: 9, heightCm: 5 })).toEqual([
      { id: "front", placement: "other", placementNote: CAP_ZONE_NOTE, presetId: null, widthCm: 9, heightCm: 5 },
    ]);
  });

  it("admin shows the typed size with the format it is priced as", () => {
    const summary = toDtfPublicSummary({
      version: 1,
      garmentSource: "stock",
      garment: { garmentProductId: "cap:white", kind: "cap", name: "ERIS", colorName: "White", colorHex: null },
      customerType: "retail",
      sizes: [{ garmentVariantId: "v", size: "—", quantity: 1, unitSellPriceMdl: 180, unitCostMdl: 0 }],
      quantity: 1,
      zones: [
        {
          id: "front",
          placement: "other",
          placementNote: CAP_ZONE_NOTE,
          presetId: "logo",
          presetLabel: "Logo 10×10",
          customSize: true,
          widthCm: 9,
          heightCm: 5,
          unitListPriceMdl: 100,
          unitIncludedCreditMdl: 100,
          unitPrintPriceMdl: 0,
          unitPressFeeMdl: 0,
        },
      ],
      filmPrintableWidthCm: 30,
      filmGapCm: 1,
      consumption: { filmLinearMeters: 0.06, inkMl: 0.9, powderGrams: 0.6 },
      pricing: { tierMinQty: 1, garmentSellTotalMdl: 180, printSellTotalMdl: 0, pressSellTotalMdl: 0, minimumLineUpliftMdl: 0, totalSellPriceMdl: 180 },
      costs: { garmentCostMdl: 0, filmCostMdl: 0, inkCostMdl: 0, powderCostMdl: 0, totalCostMdl: 0 },
      estimatedProfitMdl: 180,
    });
    expect(summary).not.toBeNull();
    expect(dtfZoneSizeText(summary!.zones[0]!, adminRu.editor.customSizeAs)).toBe("9×5 см (по цене Logo 10×10)");
  });
});
