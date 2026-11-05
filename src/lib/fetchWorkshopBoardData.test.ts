import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({ $queryRaw: vi.fn(async () => [] as unknown[]) }));
vi.mock("server-only", () => ({}));
vi.mock("./prisma", () => ({ prisma: db }));

import { MAX_COMPLETED_ORDERS, fetchWorkshopBoardData } from "./fetchWorkshopBoardData";

const user = { id: "u1", name: "W", role: "workshop" };

/** The board query as one SQL string + its bound values. */
function boardQuery(): { text: string; values: unknown[] } {
  const [strings, ...values] = db.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
  const sql = Prisma.sql(strings, ...values);
  return { text: sql.text.replace(/\s+/g, " "), values: sql.values };
}

beforeEach(() => db.$queryRaw.mockClear());

describe("workshop board order query", () => {
  it("active only: newest first, no completed orders", async () => {
    await fetchWorkshopBoardData(user);
    const { text, values } = boardQuery();
    expect(text).toContain("active_orders AS");
    expect(text).toMatch(/active_orders AS \(.*ORDER BY created_at DESC LIMIT \$\d+/);
    expect(text).not.toContain("completed_orders");
    expect(values).toContainEqual(["SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY"]);
  });

  it("«Показать завершённые»: active orders are kept, completed ones come separately, newest first and capped", async () => {
    await fetchWorkshopBoardData(user, { includeDelivered: true });
    const { text, values } = boardQuery();
    expect(text).toMatch(/completed_orders AS \(.*ORDER BY created_at DESC LIMIT \$\d+/);
    expect(text).toContain("SELECT * FROM active_orders UNION ALL SELECT * FROM completed_orders");
    expect(values).toContainEqual(["SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY"]);
    expect(values).toContainEqual(["RETURNED_TO_STUDIO", "DELIVERED"]);
    expect(values).toContain(MAX_COMPLETED_ORDERS);
  });
});
