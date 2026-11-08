import { describe, expect, it } from "vitest";
import { canManageLibrary, isAdmin } from "./roles";

describe("canManageLibrary", () => {
  it("lets all staff (admin, superadmin, workshop) edit the design library", () => {
    expect(canManageLibrary("admin")).toBe(true);
    expect(canManageLibrary("superadmin")).toBe(true);
    expect(canManageLibrary("workshop")).toBe(true);
    expect(isAdmin("workshop")).toBe(true);
    expect(canManageLibrary("customer")).toBe(false);
    expect(canManageLibrary("dealer")).toBe(false);
  });
});
