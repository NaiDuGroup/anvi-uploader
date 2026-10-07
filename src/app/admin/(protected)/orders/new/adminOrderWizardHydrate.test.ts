import { describe, expect, it } from "vitest";
import { wizardRowFilesForLine } from "./adminOrderWizardHydrate";

const front = { id: "bbbb", paperType: "business_card_front" } as const;
const back = { id: "aaaa", paperType: "business_card_back" } as const;

describe("wizardRowFilesForLine", () => {
  it("restores a double-sided business-card run as one row", () => {
    const { rowFiles, businessCardBack } = wizardRowFilesForLine(
      "business_card",
      [front, back],
    );
    expect(rowFiles).toEqual([front]);
    expect(businessCardBack).toEqual(back);
  });

  it("restores a single-sided run as one row with no reverse", () => {
    expect(wizardRowFilesForLine("business_card", [front])).toEqual({
      rowFiles: [front],
      businessCardBack: null,
    });
  });

  it("keeps a row per file for every other product", () => {
    const a = { id: "a", paperType: "A4" };
    const b = { id: "b", paperType: "A4" };
    expect(wizardRowFilesForLine("paper_print", [a, b])).toEqual({
      rowFiles: [a, b],
      businessCardBack: null,
    });
  });

  it("still yields one row for cards saved before the side tags existed", () => {
    const first = { id: "aaaa", paperType: null };
    const second = { id: "bbbb", paperType: null };
    expect(wizardRowFilesForLine("business_card", [first, second])).toEqual({
      rowFiles: [first],
      businessCardBack: second,
    });
  });
});
