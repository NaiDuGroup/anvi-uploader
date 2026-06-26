import { describe, it, expect } from "vitest";
import {
  LF_BANNER_MATT_BORDER_CM,
  LF_CANVAS_GALLERY_WRAP_CM,
  resolveGalleryWrapCm,
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

describe("resolveGalleryWrapCm", () => {
  it("adds a 4 cm mirrored wrap for canvas (Panza din bumbac)", () => {
    expect(resolveGalleryWrapCm("Panza din bumbac 1.07*20m")).toBe(
      LF_CANVAS_GALLERY_WRAP_CM,
    );
    expect(resolveGalleryWrapCm("panza din bumbac")).toBe(
      LF_CANVAS_GALLERY_WRAP_CM,
    );
    expect(resolveGalleryWrapCm("Pânză din bumbac")).toBe(
      LF_CANVAS_GALLERY_WRAP_CM,
    );
  });

  it("does not wrap other materials", () => {
    expect(resolveGalleryWrapCm("BANNER MATT 1.37*50m")).toBe(0);
    expect(resolveGalleryWrapCm("ORACAL GLOSS")).toBe(0);
    expect(resolveGalleryWrapCm("Panza poliester")).toBe(0);
  });

  it("returns 0 for empty/nullish names", () => {
    expect(resolveGalleryWrapCm("")).toBe(0);
    expect(resolveGalleryWrapCm(null)).toBe(0);
    expect(resolveGalleryWrapCm(undefined)).toBe(0);
  });
});
