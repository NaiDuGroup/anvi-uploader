import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { flagLineLayoutIssue, LayoutIssueError } from "./orderLineLayoutIssue";

/** «Набор» lines of an order in the workshop phase: notebook printing, pen waiting, box following (PRINTING). */
function fakeDb(lines: { id: string; productType: string; setGroupId: string | null; productionStatus: string }[]) {
  const updates: { where: unknown; data: { productionStatus?: string } }[] = [];
  const orderUpdates: { data: { status?: string } }[] = [];
  const tx = {
    $queryRaw: vi.fn(async () => []),
    order: {
      findMany: vi.fn(async () => [
        {
          id: "o1",
          orderNumber: 9001,
          status: "WORKSHOP_PRINTING",
          deletedAt: null,
          orderLines: lines.map((l, i) => ({ ...l, sortOrder: i })),
        },
      ]),
      update: vi.fn(async (args: { data: { status?: string } }) => {
        orderUpdates.push(args);
        return {};
      }),
    },
    orderLine: {
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async (args: { where: unknown; data: { productionStatus?: string } }) => {
        updates.push(args);
        return { count: 1 };
      }),
    },
    orderLog: { createMany: vi.fn(async () => ({ count: 0 })) },
  };
  const db = { $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  return { db: db as unknown as Parameters<typeof flagLineLayoutIssue>[0], updates, orderUpdates };
}

const setLines = () => [
  { id: "nb", productType: "notebook", setGroupId: "g", productionStatus: "PRINTING" },
  { id: "pen", productType: "pen", setGroupId: "g", productionStatus: "WAITING" },
  { id: "box", productType: "set_box", setGroupId: "g", productionStatus: "PRINTING" },
];

describe("«Нужен макет» on a «Набор» order", () => {
  it("the box line follows its set when the only printing line is flagged (order back to «В цех»)", async () => {
    const { db, updates, orderUpdates } = fakeDb(setLines());
    const res = await flagLineLayoutIssue(db, { orderId: "o1", lineId: "nb", reason: "other", note: "x", userId: "u" });
    expect(updates).toEqual([
      expect.objectContaining({ where: { orderId: "o1", id: { in: ["box"] } }, data: expect.objectContaining({ productionStatus: "WAITING" }) }),
    ]);
    expect(res.newOrderStatus).toBe("SENT_TO_WORKSHOP");
    expect(orderUpdates[0]?.data.status).toBe("SENT_TO_WORKSHOP");
  });

  it("the box line itself cannot be flagged (no file, no layout)", async () => {
    const { db } = fakeDb(setLines());
    await expect(
      flagLineLayoutIssue(db, { orderId: "o1", lineId: "box", reason: "other", userId: "u" }),
    ).rejects.toEqual(new LayoutIssueError("line_not_flaggable"));
  });
});
