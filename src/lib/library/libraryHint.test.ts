import { describe, expect, it } from "vitest";
import { LIBRARY_HINT_STATUSES, libraryHintCandidateIds, libraryHintMissingCount } from "./libraryHint";

describe("library completion hint", () => {
  it("fires on ready / returned / delivered only", () => {
    expect(LIBRARY_HINT_STATUSES.has("READY_IN_STUDIO")).toBe(true);
    expect(LIBRARY_HINT_STATUSES.has("WORKSHOP_READY")).toBe(true);
    expect(LIBRARY_HINT_STATUSES.has("RETURNED_TO_STUDIO")).toBe(true);
    expect(LIBRARY_HINT_STATUSES.has("DELIVERED")).toBe(true);
    expect(LIBRARY_HINT_STATUSES.has("IN_PROGRESS")).toBe(false);
    expect(LIBRARY_HINT_STATUSES.has("ISSUE")).toBe(false);
  });

  it("counts stored files that are neither saved nor archived", () => {
    const ids = libraryHintCandidateIds([
      { id: "a", fileUrl: "uploads/x/a.pdf" },
      { id: "b", fileUrl: "https://drive.google.com/x" },
      { id: "c", fileUrl: "library/common/k-c.pdf" },
      { id: "d", fileUrl: "uploads/x/d.pdf" },
      { id: "e", fileUrl: "uploads/x/e.pdf" },
    ]);
    expect(ids).toEqual(["a", "d", "e"]);
    expect(libraryHintMissingCount(ids, { inLibrary: { a: "L1" }, archived: { d: "L2" } })).toBe(1);
    expect(libraryHintMissingCount(ids, {})).toBe(3);
  });
});
