import { describe, expect, it } from "vitest";
import { defaultStickerDraft, stickerDraftSizeIssue } from "./stickerSheetDraft";

describe("stickerDraftSizeIssue", () => {
  const circle = (w: string) => ({ ...defaultStickerDraft(), widthStr: w });
  const rect = (w: string, h: string) => ({ ...defaultStickerDraft(), shape: "rect" as const, widthStr: w, heightStr: h });

  it("valid sizes have no issue", () => {
    expect(stickerDraftSizeIssue(circle("65"))).toBeNull();
    expect(stickerDraftSizeIssue(circle("10"))).toBeNull();
    expect(stickerDraftSizeIssue(rect("90", "50"))).toBeNull();
    expect(stickerDraftSizeIssue(rect("65,5", "420"))).toBeNull();
  });

  it("blank or zero is missing, not «does not fit»", () => {
    expect(stickerDraftSizeIssue(circle(""))).toBe("missing");
    expect(stickerDraftSizeIssue(circle("0"))).toBe("missing");
    expect(stickerDraftSizeIssue(rect("50", ""))).toBe("missing");
  });

  it("below the minimum or above the maximum is out of range", () => {
    expect(stickerDraftSizeIssue(circle("5"))).toBe("out_of_range");
    expect(stickerDraftSizeIssue(circle("6.5"))).toBe("out_of_range");
    expect(stickerDraftSizeIssue(rect("296", "426"))).toBe("out_of_range");
  });

  it("a circle ignores the stale height", () => {
    expect(stickerDraftSizeIssue({ ...circle("65"), heightStr: "" })).toBeNull();
  });
});
