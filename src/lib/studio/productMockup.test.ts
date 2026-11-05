import { describe, expect, it } from "vitest";
import { studioMugLook } from "./mugLook";
import { bestMugViewCenter, mugMockupGeometry, mugViewCenters, penMockupGeometry, visibleWrapShare, wrapUAt } from "./productMockup";

describe("product mockup geometry", () => {
  it("maps the front of the body to the middle of the wrap", () => {
    expect(wrapUAt(0, 210, 41)).toBe(105);
    const edge = wrapUAt(1, 210, 41)!;
    expect(edge).toBeCloseTo(105 + (Math.PI / 2) * 41, 5);
    expect(wrapUAt(-1, 100, 41)).toBeNull(); // a short print does not reach the silhouette
    expect(visibleWrapShare(210, 41)).toBeCloseTo((Math.PI * 41) / 210, 5);
    expect(visibleWrapShare(100, 41)).toBe(1);
    expect(wrapUAt(0, 210, 41, 40)).toBe(40);
    const [l, f, r] = mugViewCenters(210, 41);
    expect(f).toBe(105);
    expect(l).toBeCloseTo(105 - (Math.PI / 2) * 41, 5);
    expect(r).toBeCloseTo(105 + (Math.PI / 2) * 41, 5);
    expect(mugViewCenters(100, 41)).toEqual([0, 50, 100]);
  });

  it("fits the mug with its handle inside the canvas", () => {
    const look = studioMugLook({ printWidthCm: 21, printHeightCm: 9.6 });
    const g = mugMockupGeometry(look, 96, 320, 280);
    expect(g.cx - g.rxTop).toBeGreaterThan(0);
    expect(g.cx + g.rxTop + g.handle!.reach + g.handle!.thick).toBeLessThan(320);
    expect(g.yTop - g.ryTop).toBeGreaterThan(0);
    expect(g.yBottom + g.ryBottom).toBeLessThan(280);
    expect(g.labelHeight).toBeLessThanOrEqual(g.yBottom - g.yTop);
    expect(mugMockupGeometry(studioMugLook({ handleStyle: "none" }), 96, 320, 280).handle).toBeNull();
  });

  it("keeps the pen strip inside the barrel", () => {
    const g = penMockupGeometry({ widthMm: 45, heightMm: 7 }, 320, 120);
    expect(g.stripX).toBeGreaterThan(g.left);
    expect(g.stripX + g.stripW).toBeLessThan(g.right);
    expect(g.stripH).toBeLessThan(g.barrelH);
  });

  it("turns the mug towards the customer's photo", () => {
    const photo = { kind: "image", x: 28, w: 69, h: 69, src: {} };
    const text = { kind: "text", x: 120, w: 70, h: 15 };
    expect(bestMugViewCenter([photo, text], 210, 41)).toBeLessThan(80);
    expect(bestMugViewCenter([], 210, 41)).toBe(105);
    // Centred content stays in front; a full-width backdrop does not count.
    expect(
      bestMugViewCenter(
        [
          { kind: "text", x: 75, w: 60, h: 20 },
          { kind: "image", x: 0, w: 210, h: 96, src: {} },
        ],
        210,
        41,
      ),
    ).toBe(105);
  });
});
