import { describe, expect, it } from "vitest";
import { penZoneOnBarrel } from "./penPreview";

describe("penZoneOnBarrel", () => {
  it("draws barrel prints on the pen and a case print (KIOTO 12×3 cm) flat", () => {
    expect(penZoneOnBarrel({ w: 40, h: 6 })).toBe(true); // TALBOT / PERET fallback 4×0.6
    expect(penZoneOnBarrel({ w: 40, h: 15 })).toBe(true); // LOIS / PARTAS card 4×1.5
    expect(penZoneOnBarrel({ w: 50, h: 6 })).toBe(true); // ARDENES 5×0.6
    expect(penZoneOnBarrel({ w: 120, h: 30 })).toBe(false); // KIOTO case
    expect(penZoneOnBarrel({ w: 40, h: 20 })).toBe(false);
  });
});
