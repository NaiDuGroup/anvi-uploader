import { describe, expect, it } from "vitest";
import { addLayer, emptyStudioDoc, type StudioDoc, type StudioImageLayer, type StudioLayer } from "./document";
import { isMagicMug, mugMainPhoto, mugOpeningU, mugThetaOfU, mugViewOfU, mugViewU, mugViewZones } from "./mugViews";
import { studioSurfaces, surfaceBase } from "./surfaces";

const spec = studioSurfaces("mug")[0]!; // 210 × 96 mm, 15 mm handle strips
const photo = (o: Partial<StudioImageLayer> = {}): StudioImageLayer => ({
  id: "p", kind: "image", x: 60, y: 20, w: 50, h: 50, rotation: 0,
  src: { key: "uploads/1730000000000-a.jpg", naturalW: 3000, naturalH: 3000 }, mask: "rect", crop: { zoom: 1, ox: 0, oy: 0 }, ...o,
});
function doc(...layers: StudioLayer[]): StudioDoc {
  let d = emptyStudioDoc("mug", studioSurfaces("mug").map(surfaceBase));
  for (const l of layers) d = addLayer(d, d.surfaces[0]!.id, l);
  return d;
}

describe("mug views", () => {
  it("splits the wrap between the handle strips into three zones", () => {
    expect(mugViewZones(spec)).toEqual([
      { view: "left", x: 15, w: 60 },
      { view: "front", x: 75, w: 60 },
      { view: "right", x: 135, w: 60 },
    ]);
    expect(mugViewU(spec, "front")).toBeCloseTo(0.5);
    expect(mugViewU(spec, "left")).toBeCloseTo(45 / 210);
    expect(mugViewU(spec, "right")).toBeCloseTo(165 / 210);
    expect(mugViewOfU(spec, 0.02)).toBe("left");
    expect(mugViewOfU(spec, 0.5)).toBe("front");
    expect(mugViewOfU(spec, 0.99)).toBe("right");
  });

  it("opens at the centre of the largest photo, else the front", () => {
    expect(mugOpeningU(doc(), spec)).toBeCloseTo(0.5);
    const small = photo({ id: "a", x: 140, w: 30, h: 30 });
    const big = photo({ id: "b", x: 20, w: 50, h: 70 });
    expect(mugMainPhoto(doc(small, big))?.id).toBe("b");
    expect(mugOpeningU(doc(small, big), spec)).toBeCloseTo(45 / 210);
    // Empty photo spots and hidden photos do not count.
    expect(mugMainPhoto(doc(photo({ src: null, w: 150 }), small))?.id).toBe("a");
    expect(mugMainPhoto(doc(photo({ hidden: true, w: 150 }), small))?.id).toBe("a");
    // Only the part on the print counts: a big photo mostly off the strip loses.
    const off = photo({ id: "off", x: 190, w: 120, h: 90 });
    expect(mugMainPhoto(doc(off, big))?.id).toBe("b");
    expect(mugOpeningU(doc(photo({ x: 180, w: 60 })), spec)).toBeCloseTo(195 / 210);
  });

  it("maps a wrap position to the 3D label angle", () => {
    expect(mugThetaOfU(0, -1, 4)).toBe(-1);
    expect(mugThetaOfU(0.5, -1, 4)).toBe(1);
    expect(mugThetaOfU(2, -1, 4)).toBe(3);
  });

  it("tells a magic mug by its names or SKU", () => {
    expect(isMagicMug("cana-magica")).toBe(true);
    expect(isMagicMug(null, "Cană termo-magic mată")).toBe(true);
    expect(isMagicMug("Кружка-хамелеон")).toBe(true);
    expect(isMagicMug("cana-alba", "Cană albă 320ml", "S1-KB-320")).toBe(false);
  });
});
