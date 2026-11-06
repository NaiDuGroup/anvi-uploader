import { describe, expect, it } from "vitest";
import { studioCartPercent, studioCartProgressText } from "./cartProgress";

describe("«Adaugă în coș» progress", () => {
  it("moves through the stages instead of sitting at 0 %", () => {
    expect(studioCartPercent({ stage: "photos", pct: null, done: 0, total: 2 })).toBe(0);
    expect(studioCartPercent({ stage: "photos", pct: 50, done: 1, total: 2 })).toBe(15);
    expect(studioCartPercent({ stage: "render", pct: null })).toBe(20);
    expect(studioCartPercent({ stage: "upload", pct: null })).toBe(45);
    expect(studioCartPercent({ stage: "upload", pct: 50 })).toBe(70);
    expect(studioCartPercent({ stage: "upload", pct: 100 })).toBe(95);
    expect(studioCartPercent({ stage: "save", pct: null })).toBe(95);
  });

  it("never shows an upload percentage while the file is being drawn", () => {
    expect(studioCartProgressText({ stage: "render", pct: null })).toBe("preparing");
    expect(studioCartProgressText({ stage: "upload", pct: 0 })).toBe("progressUpload");
    expect(studioCartProgressText({ stage: "photos", pct: null, done: 0, total: 1 })).toBe("progressPhotos");
  });

  it("clamps odd values", () => {
    expect(studioCartPercent({ stage: "upload", pct: 140 })).toBe(95);
    expect(studioCartPercent({ stage: "upload", pct: -3 })).toBe(45);
  });
});
