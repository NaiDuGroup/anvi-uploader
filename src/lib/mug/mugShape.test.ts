import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MUG_SHAPE_DEFAULTS, MUG_SHAPE_PRESETS, parseMugShape } from "./mugShape";
import { buildMug, mugFrameHalfExtents, mugLabelPlacement, MUG_UNIT_PER_CM } from "./mugGeometry";
import { mugAttributesJson, parseMugAttributes } from "./mugVariantAttributes";

describe("parseMugShape", () => {
  it("falls back to the standard 330 ml mug for old data", () => {
    expect(parseMugShape({})).toEqual(MUG_SHAPE_DEFAULTS);
  });

  it("clamps sizes and rejects an unknown handle", () => {
    expect(parseMugShape({ bodyHeightCm: 99, topDiameterCm: "8.25", bottomDiameterCm: 1, handleStyle: "loop" })).toEqual({
      bodyHeightCm: 30,
      topDiameterCm: 8.3,
      bottomDiameterCm: 4,
      handleStyle: "classic",
    });
  });

  it("round-trips through item attributes", () => {
    const a = parseMugAttributes({ bodyHeightCm: 12, topDiameterCm: 8.7, bottomDiameterCm: 8.7, handleStyle: "heart" });
    const back = parseMugAttributes(mugAttributesJson(a));
    expect(back).toMatchObject({ bodyHeightCm: 12, topDiameterCm: 8.7, bottomDiameterCm: 8.7, handleStyle: "heart" });
  });
});

describe("buildMug", () => {
  it("names the parts like the old GLB so colours apply", () => {
    const names = buildMug(MUG_SHAPE_DEFAULTS).group.children.map((c) => c.name).sort();
    expect(names).toEqual(["Mug_Body", "Mug_Fringe", "Mug_Handle", "Mug_Inside"]);
  });

  it("leaves the handle out for a tumbler", () => {
    const tumbler = MUG_SHAPE_PRESETS.find((p) => p.key === "tumbler")!.shape;
    expect(buildMug(tumbler).group.children.map((c) => c.name)).not.toContain("Mug_Handle");
  });

  it("is as tall as the body height (body + rim on top)", () => {
    const { group } = buildMug(MUG_SHAPE_DEFAULTS);
    const box = new THREE.Box3()
      .setFromObject(group.getObjectByName("Mug_Body")!)
      .union(new THREE.Box3().setFromObject(group.getObjectByName("Mug_Fringe")!));
    expect(box.max.y - box.min.y).toBeCloseTo(9.6 * MUG_UNIT_PER_CM, 4);
  });
});

describe("mugLabelPlacement", () => {
  it("wraps the print by its real width: 21 cm on an 8.2 cm mug ≈ 293°", () => {
    const l = mugLabelPlacement(MUG_SHAPE_DEFAULTS, { widthCm: 21, heightCm: 9.6 });
    expect((l.thetaLength * 180) / Math.PI).toBeCloseTo(293.4, 0);
    expect(l.thetaStart).toBeCloseTo(-l.thetaLength / 2);
  });

  it("never covers the handle side", () => {
    const l = mugLabelPlacement(MUG_SHAPE_DEFAULTS, { widthCm: 40, heightCm: 9.6 });
    expect((l.thetaLength * 180) / Math.PI).toBeCloseTo(330, 3);
  });

  it("keeps the legacy 300° wrap without a print size", () => {
    expect((mugLabelPlacement(MUG_SHAPE_DEFAULTS).thetaLength * 180) / Math.PI).toBeCloseTo(300, 3);
  });
});

describe("mugFrameHalfExtents", () => {
  it("fits the handle on either side and grows for a tall tumbler", () => {
    const std = mugFrameHalfExtents(MUG_SHAPE_DEFAULTS);
    // 4.1 cm radius + handle reach must both fit in the half-width.
    expect(std.halfWidth).toBeGreaterThan((4.1 + 3.4) * MUG_UNIT_PER_CM);
    const tumbler = MUG_SHAPE_PRESETS.find((p) => p.key === "tumbler")!.shape;
    const t = mugFrameHalfExtents(tumbler);
    expect(t.halfHeight).toBeGreaterThan(std.halfHeight * 1.3);
    expect(t.halfWidth).toBeLessThan(std.halfWidth);
  });
});
