import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  bankTransaction: { findMany: vi.fn() },
  fiscalInvoice: { findUnique: vi.fn(), upsert: vi.fn() },
}));
const client = vi.hoisted(() => ({ getInvoiceBySeriaNumber: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("./index", () => ({
  getEFacturaClient: () => client,
  isEFacturaLive: () => true,
}));

import { pullInvoicesFromBankReferences } from "./sync";

const purposes = [
  { purpose: "Plata conform factura EBJ000662654" },
  { purpose: "Plata conform factura EBJ000662655" },
  { purpose: "Plata conform factura EBJ000662656" },
];

describe("pullInvoicesFromBankReferences time budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.bankTransaction.findMany.mockResolvedValue(purposes);
    db.fiscalInvoice.findUnique.mockResolvedValue(null);
  });

  it("stops waiting on a hanging SFS call and starts no new ones", async () => {
    client.getInvoiceBySeriaNumber.mockImplementation(() => new Promise(() => {}));

    const started = Date.now();
    const res = await pullInvoicesFromBankReferences({ budgetMs: 50, delayMs: 0 });

    expect(Date.now() - started).toBeLessThan(1000);
    expect(res.timedOut).toBe(true);
    expect(res.tokensSeen).toBe(3);
    expect(res.skipped).toBe(3);
    expect(res.fetched).toBe(0);
    expect(client.getInvoiceBySeriaNumber).toHaveBeenCalledTimes(1);
  });

  it("checks every reference when SFS answers within budget", async () => {
    client.getInvoiceBySeriaNumber.mockRejectedValue(new Error("HTTP 500"));

    const res = await pullInvoicesFromBankReferences({ budgetMs: 5_000, delayMs: 0 });

    expect(res.timedOut).toBe(false);
    expect(res.skipped).toBe(0);
    expect(res.errors).toBe(3);
    expect(res.notFound).toBe(3);
  });
});
