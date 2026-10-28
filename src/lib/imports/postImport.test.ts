import { beforeEach, describe, expect, it, vi } from "vitest";

const ledger = vi.hoisted(() => ({
  receive: vi.fn(async () => ({ receiptId: "r-new" })),
  correctReceiptCost: vi.fn(async () => undefined),
  reverseReceipt: vi.fn(async () => undefined),
  revalueAverageCost: vi.fn(async () => undefined),
}));
vi.mock("@/lib/stock/unified/ledger", () => ledger);

import type { Prisma } from "@prisma/client";
import { ImportPostError, postImport, unpostImport } from "./postImport";

type Line = {
  id: string;
  position: number;
  supplierCode: string;
  quantity: number;
  amount: number;
  variantId: string | null;
  skip: boolean;
  receiptId: string | null;
  postedUnitCostMdl: number | null;
};

function fakeTx(
  lines: Line[],
  opts: { postedMode?: string | null; otherHistorical?: { quantity: number; postedUnitCostMdl: number }[]; receiptsFor?: string[] } = {},
) {
  const shipment = {
    id: "imp1",
    supplierName: "GOR FACTORY",
    supplierOrderNo: "4457712-OG",
    proformaNo: "402229536",
    orderedAt: new Date("2026-10-15"),
    arrivedAt: null,
    postedMode: opts.postedMode ?? null,
    lines,
    costs: [
      { kind: "supplier_payment", amountMdl: 1000, excluded: false, isProvisional: false },
      { kind: "customs", amountMdl: 500, excluded: false, isProvisional: true },
      { kind: "freight", amountMdl: 9999, excluded: true, isProvisional: false },
    ],
  };
  const updates: { line: Record<string, unknown>[]; shipment: Record<string, unknown>[] } = { line: [], shipment: [] };
  const tx = {
    importShipment: {
      findUnique: vi.fn(async () => shipment),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.shipment.push(data);
        Object.assign(shipment, data);
      }),
    },
    importLine: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.line.push({ id: where.id, ...data });
        Object.assign(lines.find((l) => l.id === where.id)!, data);
      }),
      findMany: vi.fn(async ({ where }: { where: { variantId: string } }) => [
        ...lines
          .filter((l) => l.variantId === where.variantId && !l.skip && l.postedUnitCostMdl != null)
          .map((l) => ({ quantity: l.quantity, postedUnitCostMdl: l.postedUnitCostMdl })),
        ...(opts.otherHistorical ?? []),
      ]),
    },
    stockReceipt: {
      count: vi.fn(async ({ where }: { where: { variantId: string } }) => ((opts.receiptsFor ?? []).includes(where.variantId) ? 1 : 0)),
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, shipment, updates };
}

const line = (over: Partial<Line>): Line => ({
  id: "l1",
  position: 1,
  supplierCode: "NB8091S102",
  quantity: 10,
  amount: 100,
  variantId: "v1",
  skip: false,
  receiptId: null,
  postedUnitCostMdl: null,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("postImport — normal", () => {
  it("receives each stock line at its landed cost (excluded costs left out), skips «не на склад»", async () => {
    const lines = [line({}), line({ id: "l2", supplierCode: "X", amount: 100, variantId: null, skip: true })];
    const { tx, shipment } = fakeTx(lines);
    await postImport(tx, { importId: "imp1", mode: "normal", userId: "u1", costsIncludeVat: true });
    // 1 500 MDL over 200 EUR → 750 per line; 10 pcs → 75.
    expect(ledger.receive).toHaveBeenCalledTimes(1);
    expect(ledger.receive).toHaveBeenCalledWith(tx, expect.objectContaining({
      variantId: "v1",
      quantity: 10,
      totalCostMdl: 750,
      isProvisional: true,
      amountsIncludeVat: true,
      note: "Импорт 4457712-OG · GOR FACTORY",
    }));
    expect(lines[0]).toMatchObject({ receiptId: "r-new", postedUnitCostMdl: 75 });
    expect(shipment).toMatchObject({ status: "posted", postedMode: "normal" });
  });

  it("posting again re-prices the existing receipts", async () => {
    const { tx } = fakeTx([line({ receiptId: "r1" })], { postedMode: "normal" });
    await postImport(tx, { importId: "imp1", mode: "normal", userId: "u1", costsIncludeVat: true });
    expect(ledger.receive).not.toHaveBeenCalled();
    expect(ledger.correctReceiptCost).toHaveBeenCalledWith(tx, expect.objectContaining({ receiptId: "r1", newTotalCostMdl: 1500 }));
  });

  it("refuses unmatched lines, a switched mode and an empty import", async () => {
    const code = async (p: Promise<unknown>) => p.then(() => null, (e: ImportPostError) => e.code);
    expect(await code(postImport(fakeTx([line({ variantId: null })]).tx, { importId: "imp1", mode: "normal", userId: null, costsIncludeVat: true }))).toBe(
      "import_lines_unmatched",
    );
    expect(await code(postImport(fakeTx([line({})], { postedMode: "historical" }).tx, { importId: "imp1", mode: "normal", userId: null, costsIncludeVat: true }))).toBe(
      "import_mode_locked",
    );
    expect(await code(postImport(fakeTx([]).tx, { importId: "imp1", mode: "normal", userId: null, costsIncludeVat: true }))).toBe("import_no_lines");
  });
});

describe("postImport — historical", () => {
  it("sets the variant cost (weighted with other historical imports) without receipts", async () => {
    const { tx, shipment } = fakeTx([line({})], { otherHistorical: [{ quantity: 30, postedUnitCostMdl: 100 }] });
    await postImport(tx, { importId: "imp1", mode: "historical", userId: "u1", costsIncludeVat: true });
    expect(ledger.receive).not.toHaveBeenCalled();
    // This import: 10 pcs × 150; other: 30 × 100 → 112.5.
    expect(ledger.revalueAverageCost).toHaveBeenCalledWith(tx, expect.objectContaining({ variantId: "v1", unitCostMdl: 112.5 }));
    expect(shipment).toMatchObject({ status: "posted", postedMode: "historical" });
  });

  it("keeps the cost of a variant that already has a real receipt", async () => {
    const lines = [line({}), line({ id: "l2", variantId: "v2" })];
    const { tx, shipment } = fakeTx(lines, { receiptsFor: ["v1"] });
    await postImport(tx, { importId: "imp1", mode: "historical", userId: "u1", costsIncludeVat: true });
    expect(ledger.revalueAverageCost).toHaveBeenCalledTimes(1);
    expect(ledger.revalueAverageCost).toHaveBeenCalledWith(tx, expect.objectContaining({ variantId: "v2" }));
    expect(lines[0]!.postedUnitCostMdl).not.toBeNull();
    expect(shipment).toMatchObject({ status: "posted", postedMode: "historical" });
  });
});

describe("unpostImport", () => {
  it("takes the receipts back for a normal posting only", async () => {
    const lines = [line({ receiptId: "r1", postedUnitCostMdl: 75 })];
    const { tx, shipment } = fakeTx(lines, { postedMode: "normal" });
    await unpostImport(tx, { importId: "imp1", userId: "u1" });
    expect(ledger.reverseReceipt).toHaveBeenCalledWith(tx, { receiptId: "r1", createdById: "u1" });
    expect(lines[0]).toMatchObject({ receiptId: null, postedUnitCostMdl: null });
    expect(shipment).toMatchObject({ status: "received", postedMode: null });
    await expect(unpostImport(fakeTx([], { postedMode: "historical" }).tx, { importId: "imp1", userId: null })).rejects.toThrow(
      "import_unpost_only_normal",
    );
  });
});
