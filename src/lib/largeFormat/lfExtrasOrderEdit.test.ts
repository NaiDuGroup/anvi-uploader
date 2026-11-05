import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", async () => {
  const { lfTestDb } = await import("./lfTestFixtures");
  return { prisma: lfTestDb(), HEAVY_TX_OPTIONS: {} };
});
vi.mock("@/lib/accounting/accountingSettings", async () => {
  const { LF_TEST_PRODUCTION_COSTS } = await import("./lfTestFixtures");
  return { getOrCreateAccountingSettings: vi.fn(async () => ({ productionCosts: LF_TEST_PRODUCTION_COSTS })) };
});
vi.mock("@/lib/stock/unified/printers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stock/unified/printers")>()),
  printerInkCostPerMl: vi.fn(async () => 0.617),
}));

import { resolveLinesForAdminOrderUpdate } from "@/lib/adminOrderUpdateHelpers";
import { resolveOrderLines } from "@/lib/orderCreate/orderLines";
import type { AdminOrderLineInput, UpdateAdminOrderInput } from "@/lib/validations";
import { LF_TEST_ROLL_ID } from "./lfTestFixtures";
import type { LargeFormatLineData } from "./types";

const BANNER_ID = LF_TEST_ROLL_ID["BANNER MATT 1.37*50m"]!;
const FILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function shopBannerLine(): Promise<LargeFormatLineData> {
  const input = {
    productType: "large_format_print",
    largeFormatMaterialId: BANNER_ID,
    printWidthCm: 200,
    printHeightCm: 100,
    quantity: 1,
    customerType: "retail",
    lfSizePresetId: null,
    lfFinishing: { hem: true, eyelets: { mode: "spacing", spacingCm: 50 } },
    files: [{ fileName: "b.pdf", fileUrl: "shop-orders/b.pdf", copies: 1, color: "color", paperType: "large_format" }],
  } as AdminOrderLineInput;
  const { resolved } = await resolveOrderLines([input]);
  return resolved[0]!.largeFormatExtras!.largeFormatLineData as unknown as LargeFormatLineData;
}

function order(lineData: LargeFormatLineData) {
  return {
    id: "o-1",
    files: [],
    orderLines: [
      {
        id: LINE_ID,
        productType: "large_format_print",
        largeFormatMaterialId: BANNER_ID,
        largeFormatLineData: lineData,
        files: [{ id: FILE_ID, orderId: "o-1", fileName: "b.pdf", fileUrl: "shop-orders/b.pdf", copies: 1, color: "color", paperType: "large_format", pageCount: null }],
      },
    ],
  } as never;
}

describe("staff edit of a storefront wide-format line", () => {
  it("keeps the finishing the wizard does not send, re-priced at the new size", async () => {
    const data = await shopBannerLine();
    expect(data.totalSellPrice).toBe(570 + 132);
    const patch = (over: Record<string, unknown>) =>
      ({ phone: "+37369123456", lines: [{ orderLineId: LINE_ID, productType: "large_format_print", files: [{ fileId: FILE_ID }], ...over }] }) as unknown as UpdateAdminOrderInput;

    const same = await resolveLinesForAdminOrderUpdate(order(data), patch({}));
    const kept = same[0]!.largeFormatExtras!.largeFormatLineData as unknown as LargeFormatLineData;
    expect(kept.totalSellPrice).toBe(702);
    expect(kept.finishing?.eyelets?.countPerPiece).toBe(12);

    // Wider banner: the eyelets and the hem follow the new size (300×100: 16 eyelets, 8 m).
    const wider = await resolveLinesForAdminOrderUpdate(order(data), patch({ printWidthCm: 300 }));
    const w = wider[0]!.largeFormatExtras!.largeFormatLineData as unknown as LargeFormatLineData;
    expect(w.finishing).toMatchObject({ eyelets: { countPerPiece: 16 }, hem: { metersPerPiece: 8 } });

    // Explicit null clears it.
    const cleared = await resolveLinesForAdminOrderUpdate(order(data), patch({ lfFinishing: null }));
    expect((cleared[0]!.largeFormatExtras!.largeFormatLineData as unknown as LargeFormatLineData).finishing).toBeUndefined();
  });
});
