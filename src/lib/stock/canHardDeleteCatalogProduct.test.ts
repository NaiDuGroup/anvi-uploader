import { describe, it, expect } from "vitest";
import { evaluateCatalogHardDeleteGuard } from "./canHardDeleteCatalogProduct";

describe("evaluateCatalogHardDeleteGuard", () => {
  it("allows hard delete when unused", () => {
    expect(evaluateCatalogHardDeleteGuard(0, 0)).toEqual({ ok: true });
  });

  it("blocks when stock movements exist", () => {
    expect(evaluateCatalogHardDeleteGuard(3, 0)).toEqual({
      ok: false,
      reason: "has_operations",
      movements: 3,
      orderRefs: 0,
    });
  });

  it("blocks when order / line refs exist", () => {
    expect(evaluateCatalogHardDeleteGuard(0, 2)).toEqual({
      ok: false,
      reason: "has_operations",
      movements: 0,
      orderRefs: 2,
    });
  });
});
