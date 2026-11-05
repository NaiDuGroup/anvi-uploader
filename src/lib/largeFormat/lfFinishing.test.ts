import { describe, expect, it } from "vitest";
import {
  computeLfFinishing,
  isEmptyLfFinishing,
  lfEyeletCount,
  lfEyeletPositions,
  lfFinishingInputSchema,
  lfFinishingSummaryRu,
  lfHemEdges,
} from "./lfFinishing";

describe("eyelets", () => {
  it("200×100 every 50 cm on the perimeter: 5 + 5 + 3 + 3 − 4 corners = 12", () => {
    expect(lfEyeletCount({ mode: "spacing", spacingCm: 50 }, 200, 100)).toBe(12);
  });

  it("every 30 cm on 200×100: 8 + 8 + 5 + 5 − 4 = 22", () => {
    // 194 / 30 → 7 gaps (8 eyelets) on the long side, 94 / 30 → 4 gaps (5) on the short one.
    expect(lfEyeletCount({ mode: "spacing", spacingCm: 30 }, 200, 100)).toBe(22);
  });

  it("only corners: 4 at any size", () => {
    expect(lfEyeletCount({ mode: "corners" }, 300, 120)).toBe(4);
    expect(lfEyeletPositions({ mode: "corners" }, 300, 120)).toEqual([
      { xCm: 3, yCm: 3 },
      { xCm: 297, yCm: 3 },
      { xCm: 3, yCm: 117 },
      { xCm: 297, yCm: 117 },
    ]);
  });

  it("top edge only: corners of that edge + the ones between, never further apart than the spacing", () => {
    const pts = lfEyeletPositions({ mode: "spacing", spacingCm: 40, edges: ["top"] }, 200, 100);
    expect(pts).toHaveLength(6);
    expect(pts.every((p) => p.yCm === 3)).toBe(true);
    const xs = pts.map((p) => p.xCm);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeLessThanOrEqual(40);
  });

  it("top + left share the top-left corner once", () => {
    // top: 194/50 → 4 gaps → 5; left: 94/50 → 2 gaps → 3; shared corner → 7.
    expect(lfEyeletCount({ mode: "spacing", spacingCm: 50, edges: ["top", "left"] }, 200, 100)).toBe(7);
  });
});

describe("computeLfFinishing", () => {
  it("banner 200×100 with eyelets every 50 cm and hem: 12 × 3,5 = 42 + 6 m × 15 = 90", () => {
    const f = computeLfFinishing({ hem: true, eyelets: { mode: "spacing", spacingCm: 50 } }, 200, 100, 1)!;
    expect(f.eyelets?.countPerPiece).toBe(12);
    expect(f.eyelets?.totalMdl).toBe(42);
    expect(f.hem?.metersPerPiece).toBe(6);
    expect(f.hem?.totalMdl).toBe(90);
    expect(f.totalMdl).toBe(132);
    expect(f.costMdl).toBe(5); // 12 rings × 0,42
  });

  it("pockets top + bottom at 25 lei/m; the hem skips the pocket edges", () => {
    const f = computeLfFinishing({ hem: true, pockets: ["top", "bottom"] }, 300, 100, 2)!;
    expect(f.pockets).toMatchObject({ edges: ["top", "bottom"], metersPerPiece: 6, totalMdl: 300 });
    expect(lfHemEdges({ hem: true, pockets: ["top", "bottom"] })).toEqual(["left", "right"]);
    expect(f.hem).toMatchObject({ edges: ["left", "right"], metersPerPiece: 2, totalMdl: 60 });
    expect(f.totalMdl).toBe(360);
  });

  it("an odd eyelet count rounds the line to whole lei", () => {
    // 3 pieces × 4 corners × 3,5 = 42; top edge of 150 cm every 45 cm: 144 / 45 → 4 gaps → 5 eyelets = 17,5 → 18.
    expect(computeLfFinishing({ eyelets: { mode: "corners" } }, 100, 100, 3)!.totalMdl).toBe(42);
    const f = computeLfFinishing({ eyelets: { mode: "spacing", spacingCm: 45, edges: ["top"] } }, 150, 100, 1)!;
    expect(f.eyelets!.countPerPiece).toBe(5);
    expect(f.totalMdl).toBe(18);
  });

  it("nothing ordered → null", () => {
    expect(computeLfFinishing({}, 100, 100, 1)).toBeNull();
    expect(computeLfFinishing({ hem: false, pockets: undefined }, 100, 100, 1)).toBeNull();
    expect(isEmptyLfFinishing(null)).toBe(true);
  });

  it("staff summary in Russian", () => {
    const f = computeLfFinishing(
      { hem: true, pockets: ["top"], eyelets: { mode: "spacing", spacingCm: 50 } },
      200,
      100,
      1,
    );
    expect(lfFinishingSummaryRu(f)).toBe(
      "люверсы шаг ≤50 см по периметру (12 шт.), проклейка низ, лево, право (4 м), карманы: верх (2 м)",
    );
  });
});

describe("lfFinishingInputSchema", () => {
  it("spacing 30–50 cm only, whole cm, unique edges", () => {
    expect(lfFinishingInputSchema.safeParse({ eyelets: { mode: "spacing", spacingCm: 50 } }).success).toBe(true);
    expect(lfFinishingInputSchema.safeParse({ eyelets: { mode: "spacing", spacingCm: 25 } }).success).toBe(false);
    expect(lfFinishingInputSchema.safeParse({ eyelets: { mode: "spacing", spacingCm: 60 } }).success).toBe(false);
    expect(lfFinishingInputSchema.safeParse({ eyelets: { mode: "spacing", spacingCm: 42.5 } }).success).toBe(false);
    expect(lfFinishingInputSchema.safeParse({ pockets: ["top", "top"] }).success).toBe(false);
    expect(lfFinishingInputSchema.safeParse({ hem: true, extra: 1 }).success).toBe(false);
  });
});
