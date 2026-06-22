import { describe, it, expect } from "vitest";
import {
  LF_BANNER_MATT_BORDER_CM,
  resolveLayoutBorderCm,
} from "./lfLayoutBorder";

describe("resolveLayoutBorderCm", () => {
  it("adds a 4 cm border for BANNER MATT", () => {
    expect(resolveLayoutBorderCm("BANNER MATT 1.37*50m")).toBe(
      LF_BANNER_MATT_BORDER_CM,
    );
    expect(resolveLayoutBorderCm("banner matt")).toBe(LF_BANNER_MATT_BORDER_CM);
    expect(resolveLayoutBorderCm("BANNERMATT")).toBe(LF_BANNER_MATT_BORDER_CM);
  });

  it("does not add a border for other materials", () => {
    expect(resolveLayoutBorderCm("ORACAL MATT 1.27*50m")).toBe(0);
    expect(resolveLayoutBorderCm("BANNER Roll Up MATT 1.07*30m")).toBe(0);
    expect(resolveLayoutBorderCm("ORACAL GLOSS")).toBe(0);
  });

  it("returns 0 for empty/nullish names", () => {
    expect(resolveLayoutBorderCm("")).toBe(0);
    expect(resolveLayoutBorderCm(null)).toBe(0);
    expect(resolveLayoutBorderCm(undefined)).toBe(0);
  });
});
