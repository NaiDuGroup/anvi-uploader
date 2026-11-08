import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
}));

vi.mock("./prisma", () => ({ prisma: db }));

import { buildActorNameResolver } from "./resolveActorNames";

const staff = new Map([
  ["staff-1", "Анна (цех)"],
  ["staff-2", "Иван"],
]);

describe("buildActorNameResolver", () => {
  beforeEach(() => {
    db.user.findMany.mockReset();
  });

  it("resolves staff ids from the map without querying the DB", async () => {
    const name = await buildActorNameResolver(staff, ["staff-1", "staff-2"]);
    expect(name("staff-1")).toBe("Анна (цех)");
    expect(name("staff-2")).toBe("Иван");
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("does not query the DB for an empty id list", async () => {
    const name = await buildActorNameResolver(staff, []);
    expect(name("staff-1")).toBe("Анна (цех)");
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("does not query the DB when ids are only null / undefined / empty", async () => {
    await buildActorNameResolver(staff, [null, undefined, ""]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("looks up non-staff ids, preferring displayName and falling back to name", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "dealer-1", name: "dealer_login", displayName: "ООО Дилер" },
      { id: "cab-1", name: "Пётр Клиент", displayName: null },
    ]);
    const name = await buildActorNameResolver(staff, ["staff-1", "dealer-1", "cab-1"]);
    expect(name("dealer-1")).toBe("ООО Дилер");
    expect(name("cab-1")).toBe("Пётр Клиент");
    expect(name("staff-1")).toBe("Анна (цех)");
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
    const arg = db.user.findMany.mock.calls[0][0];
    expect(arg.where.id.in.sort()).toEqual(["cab-1", "dealer-1"]);
    expect(arg.select).toEqual({ id: true, name: true, displayName: true });
  });

  it("queries each missing id once even when duplicated", async () => {
    db.user.findMany.mockResolvedValue([]);
    await buildActorNameResolver(staff, ["x", "x", null, "staff-1", "x", "y", "y"]);
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
    expect(db.user.findMany.mock.calls[0][0].where.id.in.sort()).toEqual(["x", "y"]);
  });

  it("returns null for null / undefined / unknown ids", async () => {
    db.user.findMany.mockResolvedValue([]);
    const name = await buildActorNameResolver(staff, ["ghost"]);
    expect(name(null)).toBeNull();
    expect(name(undefined)).toBeNull();
    expect(name("")).toBeNull();
    expect(name("ghost")).toBeNull();
    expect(name("never-requested")).toBeNull();
  });

  it("prefers the staff map over the DB row for a staff id", async () => {
    db.user.findMany.mockResolvedValue([{ id: "dealer-1", name: "d", displayName: null }]);
    const name = await buildActorNameResolver(staff, ["dealer-1"]);
    expect(name("staff-2")).toBe("Иван");
    expect(name("dealer-1")).toBe("d");
  });
});
