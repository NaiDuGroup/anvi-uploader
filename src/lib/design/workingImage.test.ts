import { describe, expect, it } from "vitest";
import { workingCopySize } from "./workingImage";
import { enFilesCount, roFilesCount, ruFilesCount } from "@/lib/i18n/filesCount";

describe("workingCopySize", () => {
  it("a 12 MP photo for a pen canvas: still covers the print canvas at 2×", () => {
    const s = workingCopySize(4000, 3000, 472, 177)!;
    expect(s.w).toBeGreaterThanOrEqual(2 * 472);
    expect(s.h).toBeGreaterThanOrEqual(2 * 177);
    // Cover scale on the working copy ≥ 2 source px per print px in both directions.
    expect(Math.min(s.w / 472, s.h / 177)).toBeGreaterThanOrEqual(2 - 1e-9);
    expect(s.w).toBeLessThan(4000);
    expect(s.w / s.h).toBeCloseTo(4000 / 3000, 2);
  });

  it("a tall photo: the narrow side decides", () => {
    const s = workingCopySize(1000, 6000, 472, 177)!;
    expect(s.w).toBeGreaterThanOrEqual(944);
    expect(s).toEqual({ w: 944, h: 5664 });
  });

  it("no copy when the photo is not larger than needed", () => {
    expect(workingCopySize(800, 600, 472, 177)).toBeNull();
    expect(workingCopySize(0, 0, 472, 177)).toBeNull();
  });
});

describe("file counts", () => {
  it("Russian / Romanian / English plurals", () => {
    expect([1, 2, 4, 5, 11, 21, 22, 25].map(ruFilesCount)).toEqual([
      "1 файл", "2 файла", "4 файла", "5 файлов", "11 файлов", "21 файл", "22 файла", "25 файлов",
    ]);
    expect([1, 2, 19, 20, 101].map(roFilesCount)).toEqual(["1 fișier", "2 fișiere", "19 fișiere", "20 de fișiere", "101 fișiere"]);
    expect([1, 2].map(enFilesCount)).toEqual(["1 file", "2 files"]);
  });
});
