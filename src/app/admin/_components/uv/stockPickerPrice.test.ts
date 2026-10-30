import { describe, expect, it } from "vitest";
import { formatStockPickerPrice, stockPickerPrice } from "./StockItemPickerModal";

const mug = { priceTiers: [{ minQty: 1, priceMdl: 130 }], dealerPriceMdl: 60 };

describe("stockPickerPrice", () => {
  it("shows the one-piece retail price without «от»", () => {
    const p = stockPickerPrice(mug, "retail");
    expect(p).toEqual({ minMdl: 130, maxMdl: 130, bulk: null });
    expect(formatStockPickerPrice(p!, "ru", "MDL")).toBe("130 MDL");
  });

  it("shows the dealer price to dealers when it is lower", () => {
    expect(stockPickerPrice(mug, "dealer")).toEqual({ minMdl: 60, maxMdl: 60, bulk: null });
    expect(stockPickerPrice({ ...mug, dealerPriceMdl: 150 }, "dealer")?.minMdl).toBe(130);
    expect(stockPickerPrice({ ...mug, dealerPriceMdl: null }, "dealer")?.minMdl).toBe(130);
  });

  it("adds the cheapest run-size step", () => {
    const pen = {
      priceTiers: [
        { minQty: 50, priceMdl: 80 },
        { minQty: 1, priceMdl: 100 },
        { minQty: 10, priceMdl: 90 },
      ],
      dealerPriceMdl: 85,
    };
    expect(stockPickerPrice(pen, "retail")).toEqual({ minMdl: 100, maxMdl: 100, bulk: { minQty: 50, priceMdl: 80 } });
    expect(stockPickerPrice(pen, "dealer")).toEqual({ minMdl: 85, maxMdl: 85, bulk: { minQty: 50, priceMdl: 80 } });
    expect(stockPickerPrice({ ...pen, dealerPriceMdl: 70 }, "dealer")).toEqual({ minMdl: 70, maxMdl: 70, bulk: null });
  });

  it("shows a range for garment sizes", () => {
    const shirt = { priceTiers: [{ minQty: 1, priceMdl: 150 }], sizePricesMdl: [150, 190, 170] };
    const p = stockPickerPrice(shirt);
    expect(p).toEqual({ minMdl: 150, maxMdl: 190, bulk: null });
    expect(formatStockPickerPrice(p!, "ru", "MDL")).toBe("150–190 MDL");
    expect(formatStockPickerPrice(stockPickerPrice({ ...shirt, sizePricesMdl: [150, 150] })!, "ru", "MDL")).toBe("150 MDL");
  });

  it("is empty without prices", () => {
    expect(stockPickerPrice({ priceTiers: [] })).toBeNull();
  });
});
