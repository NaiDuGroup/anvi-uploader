import { describe, expect, it } from "vitest";
import { studioLayerSchema } from "./document";
import { newImageLayer, newQrLayer, newShapeLayer, newTextLayer, placeFree, presetSizePt, qrSideMm } from "./layerFactory";

const mug = { widthMm: 210, heightMm: 96 };
const pen = { widthMm: 40, heightMm: 15 };

describe("studio layer factory", () => {
  it("sizes text presets by the area height", () => {
    expect(presetSizePt(mug, "title")).toBeGreaterThan(presetSizePt(mug, "subtitle"));
    expect(presetSizePt(pen, "body")).toBeGreaterThanOrEqual(5);
    const t = newTextLayer(mug, "arc", "La mulți ani");
    expect(t.arcDeg).toBe(90);
    expect(t.x + t.w / 2).toBeCloseTo(105);
  });
  it("creates valid, centred layers", () => {
    for (const l of [
      newTextLayer(pen, "title", "ANVI"),
      newImageLayer(mug, { localId: "x", naturalW: 4000, naturalH: 3000 }, "circle"),
      newImageLayer(mug, null),
      newShapeLayer(mug, "snowflake"),
      newQrLayer(pen, { type: "url", data: { url: "anvi.md" } }),
    ]) {
      expect(studioLayerSchema.safeParse(l).success).toBe(true);
      expect(l.x).toBeGreaterThanOrEqual(0);
    }
    const c = newImageLayer(mug, { localId: "x", naturalW: 4000, naturalH: 3000 }, "circle");
    expect(c.w).toBeCloseTo(c.h);
    expect(qrSideMm(mug)).toBe(25);
    expect(qrSideMm(pen)).toBeCloseTo(13.5);
  });
});

describe("placeFree", () => {
  it("moves a new layer below / above the ones in the middle", () => {
    const a = newTextLayer(mug, "title", "A");
    const b = placeFree(newTextLayer(mug, "subtitle", "B"), [a], mug);
    expect(b.y).toBeGreaterThan(a.y);
    expect(placeFree(a, [], mug)).toEqual(a);
  });
});
