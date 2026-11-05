import { describe, expect, it } from "vitest";
import { fitCanvas, type CanvasReserve } from "./canvasFit";

type Box = { x: number; y: number; w: number; h: number };
const placed = (view: { w: number; h: number }, area: { w: number; h: number }, r: CanvasReserve | null): Box => {
  const f = fitCanvas(view, area, 30, r);
  const w = area.w * f.fit;
  const h = area.h * f.fit;
  return { x: f.cx - w / 2, y: f.cy - h / 2, w, h };
};
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const card = (view: { w: number; h: number }, r: CanvasReserve): Box =>
  r.corner === "top-right" ? { x: view.w - r.w, y: 0, w: r.w, h: r.h } : { x: view.w - r.w, y: view.h - r.h, w: r.w, h: r.h };

describe("fitCanvas", () => {
  it("centres in the whole viewport without a reserved corner, or when the corner is free", () => {
    expect(fitCanvas({ w: 1000, h: 600 }, { w: 100, h: 100 }, 30)).toEqual({ fit: 5.4, cx: 500, cy: 300 });
    // A wide mug wrap in a tall viewport leaves the bottom corner free.
    const f = fitCanvas({ w: 600, h: 900 }, { w: 210, h: 95 }, 30, { w: 212, h: 202, corner: "bottom-right" });
    expect(f.cx).toBe(300);
    expect(f.cy).toBe(450);
  });

  it("never puts the print area under the preview dock, at any width (mug, notebook, pen)", () => {
    const areas = [{ w: 210, h: 95 }, { w: 140, h: 200 }, { w: 40, h: 15 }];
    for (let vw = 300; vw <= 1600; vw += 20) {
      for (const vh of [300, 480, 640, 900]) {
        for (const area of areas) {
          for (const r of [{ w: 212, h: 202, corner: "bottom-right" as const }, { w: 128, h: 140, corner: "top-right" as const }]) {
            const view = { w: vw, h: vh };
            const b = placed(view, area, r);
            expect(overlaps(b, card(view, r)), `${vw}×${vh} ${area.w}×${area.h} ${r.corner}`).toBe(false);
          }
        }
      }
    }
  });

  it("at ~800 px (tool panel open) moves the notebook cover beside the dock instead of under it", () => {
    const view = { w: 456, h: 640 };
    const r: CanvasReserve = { w: 212, h: 202, corner: "bottom-right" };
    const f = fitCanvas(view, { w: 140, h: 200 }, 30, r);
    expect(f.fit).toBeGreaterThan(1);
    expect(overlaps(placed(view, { w: 140, h: 200 }, r), card(view, r))).toBe(false);
  });
});
