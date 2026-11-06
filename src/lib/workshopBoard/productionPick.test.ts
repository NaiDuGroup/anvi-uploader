import { describe, expect, it } from "vitest";
import { canDownloadSheetLayout, heldForLayoutCount, lfPlannerLines } from "./productionPick";
import type { WorkshopBoardLine } from "./types";

/** Only the fields the pickers read. */
function line(id: string, kind: string, lineStatus: string): WorkshopBoardLine {
  return { orderLineId: id, lineStatus, facts: { kind } } as unknown as WorkshopBoardLine;
}

describe("lfPlannerLines (LF roll planner)", () => {
  it("keeps large-format lines, drops «Нужен макет» ones and other kinds", () => {
    const lines = [
      line("lf-wait", "lf", "WAITING"),
      line("lf-held", "lf", "NEEDS_LAYOUT"),
      line("lf-print", "lf", "PRINTING"),
      line("lf-done", "lf", "DONE"),
      line("mug", "mug", "WAITING"),
      line("mug-held", "mug", "NEEDS_LAYOUT"),
    ];
    expect(lfPlannerLines(lines).map((l) => l.orderLineId)).toEqual(["lf-wait", "lf-print", "lf-done"]);
  });

  it("all held → nothing to plan", () => {
    expect(lfPlannerLines([line("a", "lf", "NEEDS_LAYOUT"), line("b", "lf", "NEEDS_LAYOUT")])).toEqual([]);
    expect(lfPlannerLines([])).toEqual([]);
  });

  it("returns the same objects (no copies)", () => {
    const l = line("lf", "lf", "WAITING");
    expect(lfPlannerLines([l])[0]).toBe(l);
  });
});

describe("heldForLayoutCount («N ждут макет»)", () => {
  it("counts only NEEDS_LAYOUT lines, whatever the product", () => {
    expect(heldForLayoutCount([])).toBe(0);
    expect(
      heldForLayoutCount([
        line("a", "lf", "NEEDS_LAYOUT"),
        line("b", "dtf", "NEEDS_LAYOUT"),
        line("c", "lf", "WAITING"),
        line("d", "lf", "PRINTING"),
        line("e", "lf", "DONE"),
      ]),
    ).toBe(2);
  });
});

describe("canDownloadSheetLayout (business cards / flyers)", () => {
  it.each([
    ["WAITING", true],
    ["PRINTING", true],
    ["DONE", true],
    ["NEEDS_LAYOUT", false],
  ])("%s → %s", (status, expected) => {
    expect(canDownloadSheetLayout(line("x", "paper", status))).toBe(expected);
  });
});
