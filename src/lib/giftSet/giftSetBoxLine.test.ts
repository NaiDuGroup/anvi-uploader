import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * «Набор» box line on order create / edit: the box is written off once per
 * set, through the set's box line (no hidden extra write-off on the first line).
 */
const box = vi.hoisted(() => ({ takeGiftSetBoxStock: vi.fn() }));
const lines = vi.hoisted(() => ({
  consumeMugLineStock: vi.fn(),
  consumeNotebookLineStock: vi.fn(),
  consumePenLineStock: vi.fn(),
  consumeMugPrintStock: vi.fn(),
}));
vi.mock("@/lib/giftSet/giftSetStock", () => box);
vi.mock("@/lib/sublimation/sublimationOrderStock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sublimation/sublimationOrderStock")>()),
  consumeMugPrintStock: lines.consumeMugPrintStock,
}));
vi.mock("@/lib/mug/mugOrderStock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mug/mugOrderStock")>()),
  consumeMugLineStock: lines.consumeMugLineStock,
}));
vi.mock("@/lib/notebook/notebookOrderStock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notebook/notebookOrderStock")>()),
  consumeNotebookLineStock: lines.consumeNotebookLineStock,
}));
vi.mock("@/lib/pen/penOrderStock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pen/penOrderStock")>()),
  consumePenLineStock: lines.consumePenLineStock,
}));

import type { Prisma } from "@prisma/client";
import { deductStockForAdminOrderLines, type ResolvedAdminOrderLine } from "@/lib/adminOrderCreateHelpers";
import { adminOrderLineSchema, createAdminOrderSchema } from "@/lib/validations";
import { DEFAULT_GIFT_SET_TEMPLATES, planGiftSets } from "./giftSet";

const file = (copies: number) => ({ fileName: "a.png", fileUrl: "k", copies, color: "color" as const });
const params = { orderId: "o1", orderNumber: 12, createdById: "u1" };
const tx = (ids: string[]) =>
  ({ orderLine: { findMany: vi.fn(async () => ids.map((id) => ({ id }))) } }) as unknown as Prisma.TransactionClient;

beforeEach(() => {
  vi.clearAllMocks();
  box.takeGiftSetBoxStock.mockResolvedValue(null);
  lines.consumeMugLineStock.mockResolvedValue(null);
  lines.consumeNotebookLineStock.mockResolvedValue(null);
  lines.consumePenLineStock.mockResolvedValue(null);
});

describe("deductStockForAdminOrderLines with a set box line", () => {
  it("set A ×2: mug / notebook / pen from their lines, the box ×2 once — through the box line", async () => {
    const plan = planGiftSets(
      ["mug", "notebook", "pen", "set_box"].map((productType) => ({
        productType,
        quantity: 2,
        customerType: "retail" as const,
        set: { groupId: "g", templateId: "pen_notebook_mug", quantity: 2, role: productType === "set_box" ? ("box" as const) : (productType as "mug") },
      })),
      DEFAULT_GIFT_SET_TEMPLATES,
      { allowManualPrice: false },
    );
    if (!plan.ok) throw new Error(plan.code);
    const set = (i: number) => ({ setGroupId: "g", setData: plan.byLine.get(i)!.data });
    const resolved = [
      { input: { productType: "mug", files: [file(2)] }, mugExtras: { stockVariantId: "v-mug", mugProductSnapshot: null }, giftSetExtras: set(0) },
      { input: { productType: "notebook", files: [file(2)] }, notebookExtras: { stockVariantId: "v-nb", notebookProductSnapshot: null }, giftSetExtras: set(1) },
      { input: { productType: "pen", files: [file(2)] }, penExtras: { stockVariantId: "v-pen", penProductSnapshot: null }, giftSetExtras: set(2) },
      { input: { productType: "set_box", quantity: 2, files: [] }, setBoxExtras: { stockVariantId: "v-box" }, giftSetExtras: set(3) },
    ] as unknown as ResolvedAdminOrderLine[];
    await deductStockForAdminOrderLines(tx(["l-mug", "l-nb", "l-pen", "l-box"]), { ...params, resolved });
    expect(box.takeGiftSetBoxStock).toHaveBeenCalledTimes(1);
    expect(box.takeGiftSetBoxStock.mock.calls[0]![1]).toEqual({ boxSku: "EW-BOX-300X230X85", quantity: 2, orderLineId: "l-box", ...params });
    expect(lines.consumeMugLineStock).toHaveBeenCalledTimes(1);
    expect(lines.consumeNotebookLineStock).toHaveBeenCalledTimes(1);
    expect(lines.consumePenLineStock).toHaveBeenCalledTimes(1);
  });
});

describe("order line schema: the set box line", () => {
  const boxLine = {
    productType: "set_box",
    quantity: 2,
    set: { groupId: "g", templateId: "pen_notebook_mug", quantity: 2, role: "box" },
    files: [],
  };
  const body = (lines: unknown[]) => ({ phone: "060000000", lines });
  const mug = {
    productType: "mug",
    mugOther: true,
    files: [file(2)],
    set: { groupId: "g", templateId: "pen_notebook_mug", quantity: 2, role: "mug" },
  };

  it("accepts a box line without a file, refuses a box line with a file or outside a set", () => {
    expect(adminOrderLineSchema.safeParse(boxLine).success).toBe(true);
    expect(createAdminOrderSchema.safeParse(body([mug, boxLine])).success).toBe(true);
    expect(createAdminOrderSchema.safeParse(body([mug, { ...boxLine, files: [file(1)] }])).success).toBe(false);
    expect(createAdminOrderSchema.safeParse(body([mug, { ...boxLine, set: undefined }])).success).toBe(false);
  });

  it("every other line still needs a file, and only a box line may be a set's box", () => {
    expect(createAdminOrderSchema.safeParse(body([{ ...mug, files: [] }])).success).toBe(false);
    expect(createAdminOrderSchema.safeParse(body([{ ...mug, set: { ...mug.set, role: "box" } }])).success).toBe(false);
  });
});
