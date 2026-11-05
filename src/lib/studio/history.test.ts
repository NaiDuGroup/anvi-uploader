import { describe, expect, it } from "vitest";
import { commit, initHistory, redo, replacePresent, undo } from "./history";

describe("studio history", () => {
  it("undoes and redoes steps", () => {
    let h = initHistory(1);
    h = commit(h, 2, null, 0);
    h = commit(h, 3, null, 10);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    expect(undo(h)).toBe(h);
    h = redo(h);
    expect(h.present).toBe(2);
    h = commit(h, 9, null, 20);
    expect(h.future).toEqual([]);
  });
  it("coalesces a drag (same tag, quick) into one step", () => {
    let h = initHistory(0);
    h = commit(h, 1, "move:a", 1000);
    h = commit(h, 2, "move:a", 1100);
    h = commit(h, 3, "move:a", 1200);
    expect(h.past).toEqual([0]);
    h = commit(h, 4, "move:a", 5000);
    expect(h.past).toEqual([0, 3]);
    h = commit(h, 5, "move:b", 5100);
    expect(h.past).toEqual([0, 3, 4]);
  });
  it("replaces the present without a step", () => {
    const h = replacePresent(commit(initHistory("a"), "b", null, 0), "c");
    expect(h.present).toBe("c");
    expect(undo(h).present).toBe("a");
  });
});
