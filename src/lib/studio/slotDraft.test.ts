import { describe, expect, it } from "vitest";
import { initSlotDraft, syncSlotDraft, typeSlotDraft, type SlotDraft } from "./slotDraft";

function typeAll(s: SlotDraft, text: string): SlotDraft {
  let cur = s;
  for (let i = 1; i <= text.length; i++) cur = typeSlotDraft(cur, text.slice(0, i));
  return cur;
}

describe("«Personalizează» text field draft", () => {
  it("shows each letter at once, whatever the document lags", () => {
    const s = typeAll(initSlotDraft(""), "anvi.md");
    expect(s.draft).toBe("anvi.md");
  });

  it("late document values the field sent do not roll the field back (no doubled text)", () => {
    let s = typeAll(initSlotDraft(""), "anvi.md");
    // The document catches up out of step: «an», then «anvi.m», then the whole text.
    for (const late of ["an", "anvi.m", "anvi.md"]) {
      const next = syncSlotDraft(s, late);
      expect(next).not.toBeNull();
      s = next!;
      expect(s.draft).toBe("anvi.md");
    }
    expect(s.sent).toEqual([]);
    // Typing on after it settled.
    s = typeSlotDraft(s, "anvi.md/");
    expect(s.draft).toBe("anvi.md/");
  });

  it("a change from elsewhere (undo, «Datele mele») replaces the draft", () => {
    let s = typeAll(initSlotDraft(""), "abc");
    s = syncSlotDraft(s, "abc")!;
    const undone = syncSlotDraft(s, "ab");
    expect(undone?.draft).toBe("ab");
    const filled = syncSlotDraft(undone!, "site.md");
    expect(filled?.draft).toBe("site.md");
  });

  it("no change → nothing to apply", () => {
    expect(syncSlotDraft(initSlotDraft("x"), "x")).toBeNull();
  });
});
