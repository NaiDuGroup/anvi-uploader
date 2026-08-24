import { describe, expect, it } from "vitest";
import type { DesignDoc, DesignElement } from "./doc";
import {
  alignToCanvas,
  insertRelative,
  placeRelativeTo,
  placementGap,
  pushElementsBelow,
} from "./placement";

function box(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): DesignElement {
  return {
    kind: "shape",
    id,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    shape: "rect",
    fillColor: "#fff",
    strokeColor: "#000",
    strokeWidthPx: 0,
    cornerRadiusPx: 0,
  };
}

const canvas = { width: 1000, height: 2000 };

describe("placeRelativeTo", () => {
  it("leaves the factory position when nothing is selected", () => {
    const incoming = box("n", 100, 200, 400, 50);
    expect(placeRelativeTo(incoming, null, canvas)).toEqual(incoming);
  });

  it("sits below the anchor, centred on it", () => {
    const anchor = box("h", 100, 80, 800, 60);
    const incoming = box("n", 0, 0, 400, 40);
    const placed = placeRelativeTo(incoming, anchor, canvas, "below");
    expect(placed.y).toBe(80 + 60 + placementGap(canvas));
    expect(placed.x).toBe(100 + (800 - 400) / 2);
  });

  it("sits above the anchor", () => {
    const anchor = box("f", 100, 1600, 800, 80);
    const incoming = box("n", 0, 0, 400, 40);
    const placed = placeRelativeTo(incoming, anchor, canvas, "above");
    expect(placed.y).toBe(1600 - 40 - placementGap(canvas));
  });
});

describe("pushElementsBelow", () => {
  it("shifts only elements whose top is at or below the insert line", () => {
    const header = box("h", 0, 40, 800, 50);
    const art = box("a", 100, 400, 600, 500);
    const next = pushElementsBelow([header, art], 200, 80, canvas.height, "n");
    expect(next[0]!.y).toBe(40);
    expect(next[1]!.y).toBe(480);
  });

  it("does not move the newly inserted id", () => {
    const newbie = box("n", 0, 200, 400, 40);
    const next = pushElementsBelow([newbie], 200, 80, canvas.height, "n");
    expect(next[0]!.y).toBe(200);
  });
});

describe("insertRelative", () => {
  it("places under the header and pushes the art down", () => {
    const header = box("h", 100, 80, 800, 60);
    const art = box("a", 150, 200, 700, 400);
    const doc: DesignDoc = {
      version: 1,
      background: { color: "#fff" },
      elements: [header, art],
    };
    const incoming = box("n", 0, 0, 400, 40);
    const { placed, doc: next } = insertRelative(doc, incoming, header, canvas, "below");
    expect(placed.y).toBeGreaterThan(header.y + header.height);
    const artNext = next.elements.find((el) => el.id === "a");
    expect(artNext?.y).toBeGreaterThan(art.y);
    expect(next.elements[next.elements.length - 1]?.id).toBe("n");
  });

  it("does not shove existing art when nothing is selected", () => {
    const art = box("a", 150, 200, 700, 400);
    const doc: DesignDoc = {
      version: 1,
      background: { color: "#fff" },
      elements: [art],
    };
    const incoming = box("n", 150, 80, 400, 40);
    const { doc: next } = insertRelative(doc, incoming, null, canvas, "below");
    expect(next.elements.find((el) => el.id === "a")?.y).toBe(200);
  });
});

describe("alignToCanvas", () => {
  it("centres horizontally and vertically", () => {
    const el = box("e", 10, 20, 200, 100);
    expect(alignToCanvas(el, "center", canvas).x).toBe(400);
    expect(alignToCanvas(el, "middle", canvas).y).toBe(950);
  });
});
