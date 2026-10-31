import { describe, expect, it } from "vitest";
import { grainNormalMap } from "./surfaceTextures";

describe("grainNormalMap", () => {
  it("builds a tiling normal map that mostly faces out and has real relief", () => {
    for (const kind of ["leather", "cardboard", "speckle"] as const) {
      const t = grainNormalMap(kind, 3, 2);
      expect(t.repeat.x).toBe(3);
      const data = (t.image as { data: Uint8Array }).data;
      let blueSum = 0;
      let redMin = 255;
      let redMax = 0;
      for (let i = 0; i < data.length; i += 4) {
        blueSum += data[i + 2]!;
        redMin = Math.min(redMin, data[i]!);
        redMax = Math.max(redMax, data[i]!);
      }
      // Normals point out of the surface (blue high) …
      expect(blueSum / (data.length / 4)).toBeGreaterThan(200);
      // … but tilt: there is a visible grain.
      expect(redMax - redMin).toBeGreaterThan(40);
    }
  });
});
