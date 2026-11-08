import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import type { ResolvedAdminOrderLine } from "@/lib/adminOrderCreateHelpers";
import { dealerLineTotalsMdl } from "@/lib/orderCreate/dealerLinePrices";
import { buildUvLineData } from "./buildUvLineData";
import { uvDealerClientItemIssue, uvDealerLinesIssue } from "./uvDealerClientItem";
import { quoteUvDraft, uvDraftFromLineData, uvDraftToInput, type UvDraft } from "./uvDraft";
import { uvInputFromLineData } from "./uvInputFromLineData";
import { uvLineInputSchema, uvPrintFitsItem, type UvLineInput } from "./uvLineInput";
import { CATALOG, INK_COSTS, SETTINGS } from "./uvTestFixtures";

/** Prod-like rates: 400 lei/m² dealer, line minimum 100, no zone minimum. */
const PROD = {
  ...SETTINGS,
  dealerPricePerSqmMdl: 400,
  retailPricePerSqmMdl: 600,
  minimumZonePriceDealerMdl: 0,
  minimumZonePriceRetailMdl: 0,
  minimumLineTotalMdl: 100,
};
const PROD_CATALOG = { ...CATALOG, settings: PROD };
const PHOTO = { fileUrl: "uploads/1731000000000-abc12345-lid.jpg", fileName: "lid.jpg" };

/** The dealer's MDF box lid: item 33.8×26.2, logo 15×15. */
function lidDraft(over: Partial<UvDraft> = {}): UvDraft {
  return {
    source: "client",
    variantId: null,
    description: "Крышка коробки МДФ, белая",
    notes: "",
    quantityStr: "1",
    itemWidthStr: "33,8",
    itemHeightStr: "26.2",
    photo: { ...PHOTO, previewUrl: "blob:x" },
    zones: [
      { id: "z1", placement: "front", placementLabel: "", widthStr: "15", heightStr: "15", whiteLayers: 1, varnish: false, primer: false },
    ],
    ...over,
  };
}

describe("dealer UV: no line minimum (owner 2026-11-09)", () => {
  it("client item: 15×15 at 400/m² = 9 lei, no «до минимума»; client and server totals agree", async () => {
    const quote = quoteUvDraft(lidDraft(), "dealer", PROD_CATALOG);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.data.zones[0]!.unitPrintPriceMdl).toBe(9);
    expect(quote.data.pricing.minimumLineUpliftMdl).toBe(0);
    expect(quote.data.pricing.totalSellPriceMdl).toBe(9);

    // Server: the same input priced by the shared builder, read back as the dealer line total.
    const input = uvDraftToInput(lidDraft()) as UvLineInput;
    const server = buildUvLineData(uvLineInputSchema.parse(input), "dealer", { item: null, settings: PROD, inkCosts: INK_COSTS });
    expect(server.pricing.totalSellPriceMdl).toBe(quote.data.pricing.totalSellPriceMdl);
    const resolved = { input: { productType: "uv_print", files: [] }, uvExtras: { uvLineData: server } };
    expect(await dealerLineTotalsMdl([resolved as unknown as ResolvedAdminOrderLine], new Map())).toEqual([9]);

    // 1000 pcs: 9 000, not the whole lid's price.
    const many = quoteUvDraft(lidDraft({ quantityStr: "1000" }), "dealer", PROD_CATALOG);
    expect(many.ok && many.data.pricing.totalSellPriceMdl).toBe(9000);
  });

  it("retail keeps the line minimum; the set-up fee stays for dealers too", () => {
    const retail = quoteUvDraft(lidDraft(), "retail", PROD_CATALOG);
    expect(retail.ok && retail.data.pricing.minimumLineUpliftMdl).toBeGreaterThan(0);
    expect(retail.ok && retail.data.pricing.totalSellPriceMdl).toBe(100);
    const withFee = quoteUvDraft(lidDraft(), "dealer", { ...PROD_CATALOG, settings: { ...PROD, clientItemSetupFeeMdl: 50 } });
    expect(withFee.ok && withFee.data.pricing).toMatchObject({ setupFeeMdl: 50, minimumLineUpliftMdl: 0, totalSellPriceMdl: 59 });
  });

  it("the zone minimum still applies to dealers", () => {
    const q = quoteUvDraft(lidDraft(), "dealer", { ...PROD_CATALOG, settings: { ...PROD, minimumZonePriceDealerMdl: 10 } });
    expect(q.ok && q.data.pricing.totalSellPriceMdl).toBe(10);
  });
});

describe("client item photo and real size", () => {
  it("stored on the line data and read back for edits", () => {
    const quote = quoteUvDraft(lidDraft(), "dealer", PROD_CATALOG);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.data.clientItem).toMatchObject({ itemWidthCm: 33.8, itemHeightCm: 26.2, photo: PHOTO });
    // The blob preview never leaves the browser.
    expect(JSON.stringify(quote.data)).not.toContain("blob:");
    const back = uvDraftFromLineData(quote.data);
    expect(back).toMatchObject({ itemWidthStr: "33.8", itemHeightStr: "26.2", photo: PHOTO });
    expect(uvInputFromLineData(quote.data)?.clientItem).toMatchObject({ itemWidthCm: 33.8, photo: PHOTO });
  });

  it("dealers: photo and item size required server-side", () => {
    const input = uvDraftToInput(lidDraft()) as UvLineInput;
    expect(uvDealerClientItemIssue(input)).toBeNull();
    const noPhoto = uvDraftToInput(lidDraft({ photo: null })) as UvLineInput;
    expect(uvDealerClientItemIssue(noPhoto)).toBe("uv_item_photo_required");
    const noSize = uvDraftToInput(lidDraft({ itemWidthStr: "", itemHeightStr: "" })) as UvLineInput;
    expect(uvDealerClientItemIssue(noSize)).toBe("uv_item_size_required");
    // Stock items and «Набор» lines are not affected.
    expect(uvDealerLinesIssue([{ productType: "uv_print", uv: { source: "stock" } as UvLineInput }])).toBeNull();
    expect(uvDealerLinesIssue([{ productType: "uv_print", uv: noPhoto, set: { role: "ready" } }])).toBeNull();
    expect(uvDealerLinesIssue([{ productType: "mug" }, { productType: "uv_print", uv: noSize }])).toBe("uv_item_size_required");
  });

  it("the photo must be an order upload key", () => {
    const base = uvDraftToInput(lidDraft()) as UvLineInput;
    const bad = (fileUrl: string) =>
      uvLineInputSchema.safeParse({ ...base, clientItem: { ...base.clientItem, photo: { fileUrl, fileName: "x.jpg" } } }).success;
    expect(bad(PHOTO.fileUrl)).toBe(true);
    expect(bad("library/common/x.jpg")).toBe(false);
    expect(bad("https://example.com/x.jpg")).toBe(false);
    expect(bad("uploads/../catalog/x.jpg")).toBe(false);
  });
});

describe("print size inside the item size", () => {
  it("either orientation, small slack", () => {
    expect(uvPrintFitsItem({ widthCm: 15, heightCm: 15 }, { widthCm: 33.8, heightCm: 26.2 })).toBe(true);
    expect(uvPrintFitsItem({ widthCm: 26, heightCm: 33 }, { widthCm: 33.8, heightCm: 26.2 })).toBe(true);
    expect(uvPrintFitsItem({ widthCm: 33.8, heightCm: 26.2 }, { widthCm: 33.8, heightCm: 26.2 })).toBe(true);
    expect(uvPrintFitsItem({ widthCm: 34, heightCm: 27 }, { widthCm: 33.8, heightCm: 26.2 })).toBe(false);
    expect(uvPrintFitsItem({ widthCm: 30, heightCm: 30 }, { widthCm: 33.8, heightCm: 26.2 })).toBe(false);
  });

  it("the wizard and the server refuse a print bigger than the item", () => {
    const big = lidDraft({ zones: [{ ...lidDraft().zones[0]!, widthStr: "34", heightStr: "27" }] });
    expect(quoteUvDraft(big, "dealer", PROD_CATALOG)).toEqual({ ok: false, code: "uv_print_larger_than_item" });
    const input = uvDraftToInput({ ...big, itemWidthStr: "" });
    expect(input).not.toBeNull();
    const parsed = uvLineInputSchema.safeParse({
      ...input,
      clientItem: { ...input!.clientItem, itemWidthCm: 33.8, itemHeightCm: 26.2 },
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("uv_print_larger_than_item");
    // Without an item size (admin, optional) nothing to compare.
    expect(quoteUvDraft({ ...big, itemWidthStr: "", itemHeightStr: "" }, "retail", PROD_CATALOG).ok).toBe(true);
  });

  it("half an item size is refused", () => {
    const base = uvDraftToInput(lidDraft()) as UvLineInput;
    const parsed = uvLineInputSchema.safeParse({ ...base, clientItem: { ...base.clientItem, itemHeightCm: undefined } });
    expect(parsed.error?.issues[0]?.message).toBe("uv_item_size_required");
  });
});
