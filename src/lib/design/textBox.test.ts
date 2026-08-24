import { describe, expect, it } from "vitest";
import { estimateTextBoxHeight, estimateWrappedLineCount } from "./textBox";

describe("estimateWrappedLineCount", () => {
  it("counts hard breaks", () => {
    expect(estimateWrappedLineCount("a\nb\nc", 2000, 20, 0)).toBe(3);
  });

  it("wraps a long line", () => {
    const long = "xxxxxxxxxxxxxxxxxxxx";
    expect(estimateWrappedLineCount(long, 40, 20, 0)).toBeGreaterThan(1);
  });

  it("treats empty text as one line", () => {
    expect(estimateWrappedLineCount("", 400, 24, 0)).toBe(1);
  });
});

describe("estimateTextBoxHeight", () => {
  it("is at least one line tall", () => {
    expect(estimateTextBoxHeight({
      text: "Hi",
      width: 800,
      fontSizePx: 40,
      lineHeight: 1.25,
      letterSpacingPx: 0,
    })).toBe(50);
  });

  it("grows with extra lines", () => {
    const one = estimateTextBoxHeight({
      text: "Hi",
      width: 800,
      fontSizePx: 20,
      lineHeight: 1.2,
      letterSpacingPx: 0,
    });
    const two = estimateTextBoxHeight({
      text: "Hi\nthere",
      width: 800,
      fontSizePx: 20,
      lineHeight: 1.2,
      letterSpacingPx: 0,
    });
    expect(two).toBeGreaterThan(one);
  });
});
