import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * «Набор» C on the server: the set item's colour variant is resolved for the
 * stock line (its SKU = what is written off), print lines get the set price
 * split, the stock line 0; a stock UV item as the thermos is refused.
 */
vi.mock("server-only", () => ({}));
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { stockVariant: { findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock("@/lib/accounting/accountingSettings", () => ({
  getOrCreateAccountingSettings: async () => ({ giftSetTemplates: null }),
  invalidateAccountingSettings: () => {},
}));

import type { ResolvedAdminOrderLine } from "@/lib/adminOrderCreateHelpers";
import { applyGiftSetsToResolved } from "./giftSetServer";

const VAR = "11111111-1111-4111-8111-111111111111";
const variant = { id: VAR, sku: "GIFT-SET-THERMOS-BLACK", label: "чёрный", options: { color: "чёрный", colorHex: "#1f2937" }, item: { sku: "GIFT-SET-THERMOS" } };

beforeEach(() => {
  findMany.mockReset();
  findMany.mockImplementation(async (args: { where: { id?: { in: string[] }; sku?: { in: string[] } } }) => {
    if (args.where.id) return args.where.id.in.includes(VAR) ? [variant] : [];
    if (args.where.sku) return args.where.sku.in.includes(variant.sku) ? [{ id: VAR, sku: variant.sku }] : [];
    return [];
  });
});

const set = (role: "ready" | "box", zoneId?: string) => ({
  groupId: "g",
  templateId: "pen_notebook_thermos",
  quantity: 2,
  role,
  ...(zoneId ? { zoneId } : {}),
  readyVariantId: VAR,
});
const file = { fileName: "a.png", fileUrl: "k", copies: 2, color: "color" };
const uvData = (source: "client" | "stock") => ({
  source,
  quantity: 2,
  ...(source === "client" ? { clientItem: { description: "x" } } : {}),
  zones: [],
  pricing: { totalSellPriceMdl: 1 },
  costs: { totalCostMdl: 10 },
});

function lines(thermosSource: "client" | "stock" = "client", withUnit = true): ResolvedAdminOrderLine[] {
  const out = [
    { input: { productType: "uv_print", set: set("ready", "thermos"), uv: { source: thermosSource, quantity: 2 }, files: [file] }, uvExtras: { uvLineData: uvData(thermosSource) } },
    { input: { productType: "notebook", set: set("ready", "notebook"), notebookOther: true, files: [file] }, notebookExtras: { stockVariantId: null } },
    { input: { productType: "pen", set: set("ready", "pen"), penOther: true, files: [file] }, penExtras: { stockVariantId: null } },
    ...(withUnit ? [{ input: { productType: "set_box", set: set("box"), quantity: 2, files: [] } }] : []),
  ];
  return out as unknown as ResolvedAdminOrderLine[];
}

describe("applyGiftSetsToResolved — set C with its stock line", () => {
  it("print lines carry 311 / 189 / 100 per set; the stock line writes off the colour variant at 0", async () => {
    const r = lines();
    await applyGiftSetsToResolved(r, { allowManualPrice: false });
    expect((r[0]!.uvExtras!.uvLineData as unknown as { pricing: { totalSellPriceMdl: number } }).pricing.totalSellPriceMdl).toBe(622);
    expect(r[1]!.manualUnitPriceMdl).toBe(189);
    expect(r[2]!.manualUnitPriceMdl).toBe(100);
    expect(r[3]!.manualUnitPriceMdl).toBeNull();
    expect(r[3]!.setBoxExtras).toEqual({ stockVariantId: VAR });
    expect(r[3]!.giftSetExtras!.setData).toMatchObject({ role: "box", boxSku: "GIFT-SET-THERMOS-BLACK", lineTotalMdl: 0, readyColourLabel: "чёрный" });
    // Nothing hidden on the print lines.
    for (const i of [0, 1, 2]) {
      expect(r[i]!.giftSetExtras!.setData.boxSku).toBeNull();
      expect(r[i]!.giftSetExtras!.setData.setItemSku ?? null).toBeNull();
    }
    expect((r[1]!.notebookExtras!.notebookProductSnapshot as { nameRu: string }).nameRu).toBe("Блокнот из набора · чёрный");
  });

  it("refuses a stock UV item as the thermos (no arbitrary stock item through the thermos line)", async () => {
    await expect(applyGiftSetsToResolved(lines("stock"), { allowManualPrice: false })).rejects.toMatchObject({ message: "gift_set_item_mismatch" });
  });

  it("refuses a C set without its stock line (old 3-line shape)", async () => {
    await expect(applyGiftSetsToResolved(lines("client", false), { allowManualPrice: false })).rejects.toMatchObject({ message: "gift_set_box_mismatch" });
  });

  it("refuses a stock line whose variant is not the template's set item", async () => {
    const r = lines();
    (r[3]!.input.set as { readyVariantId: string }).readyVariantId = "22222222-2222-4222-8222-222222222222";
    await expect(applyGiftSetsToResolved(r, { allowManualPrice: false })).rejects.toMatchObject({ message: "gift_set_item_mismatch" });
  });
});
