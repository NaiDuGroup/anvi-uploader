import { describe, expect, it } from "vitest";
import { canManageLibrary, isAdmin } from "./roles";

describe("canManageLibrary", () => {
  it("lets admin and superadmin edit the design library, not the workshop", () => {
    expect(canManageLibrary("admin")).toBe(true);
    expect(canManageLibrary("superadmin")).toBe(true);
    expect(canManageLibrary("workshop")).toBe(false);
    expect(isAdmin("workshop")).toBe(true); // still views and saves to the library
    expect(canManageLibrary("customer")).toBe(false);
    expect(canManageLibrary("dealer")).toBe(false);
  });
});
