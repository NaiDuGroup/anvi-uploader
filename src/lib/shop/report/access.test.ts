import { describe, expect, it } from "vitest";
import { canViewShopAdmin } from "./access";

describe("canViewShopAdmin («Сайт» tab incl. company requests)", () => {
  it("super admin only", () => {
    expect(canViewShopAdmin("superadmin")).toBe(true);
    for (const role of ["admin", "workshop", "dealer", "customer", ""]) expect(canViewShopAdmin(role)).toBe(false);
  });
});
