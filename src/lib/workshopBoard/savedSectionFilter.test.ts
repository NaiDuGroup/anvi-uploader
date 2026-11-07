import { describe, expect, it } from "vitest";
import { parseSavedBoardSections } from "./savedSectionFilter";

describe("parseSavedBoardSections", () => {
  it("reads the current list, UV-DTF included, and drops unknown keys", () => {
    expect(parseSavedBoardSections("uv_dtf,mug,bogus", null)).toEqual(["uv_dtf", "mug"]);
    expect(parseSavedBoardSections("uv_print", "uv_print")).toEqual(["uv_print"]);
  });

  it("treats an empty current list as no filter", () => {
    expect(parseSavedBoardSections("", "uv_print")).toEqual([]);
    expect(parseSavedBoardSections(null, null)).toEqual([]);
  });

  it("keeps a legacy UV filter showing UV-DTF stickers too", () => {
    expect(parseSavedBoardSections(null, "mug,uv_print")).toEqual(["mug", "uv_print", "uv_dtf"]);
    expect(parseSavedBoardSections(null, "mug")).toEqual(["mug"]);
  });
});
