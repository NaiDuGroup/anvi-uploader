import { describe, expect, it } from "vitest";
import { nestShapes, rotateShape, solidShape, type NestItem, type NestShape } from "./dtfFilmNest";

function shapeFrom(rows: string[]): NestShape {
  const h = rows.length;
  const w = rows[0].length;
  const cells = new Uint8Array(w * h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => (cells[y * w + x] = ch === "#" ? 1 : 0)));
  return { widthCells: w, heightCells: h, cells };
}

function rowsOf(s: NestShape): string[] {
  const out: string[] = [];
  for (let y = 0; y < s.heightCells; y++) {
    let row = "";
    for (let x = 0; x < s.widthCells; x++) row += s.cells[y * s.widthCells + x] ? "#" : ".";
    out.push(row);
  }
  return out;
}

describe("rotateShape", () => {
  const L = shapeFrom(["#..", "###"]);
  it("turns clockwise", () => {
    expect(rowsOf(rotateShape(L, 90))).toEqual(["##", "#.", "#."]);
    expect(rowsOf(rotateShape(L, 180))).toEqual(["###", "..#"]);
    expect(rowsOf(rotateShape(L, 270))).toEqual([".#", ".#", "##"]);
  });
});

describe("nestShapes", () => {
  it("keeps the gap between rectangles and stacks them along the film", () => {
    const items: NestItem[] = [0, 1, 2].map((i) => ({
      id: `t${i}`,
      shapeKey: "a",
      shape: solidShape(6, 4),
      rotations: [0],
    }));
    const r = nestShapes(items, 10, 2);
    expect(r.unplacedIds).toEqual([]);
    expect(r.placements.map((p) => [p.xCells, p.yCells])).toEqual([
      [0, 0],
      [0, 6],
      [0, 12],
    ]);
    expect(r.lengthCells).toBe(16);
  });

  it("lets two triangles interlock inside each other's bounding box", () => {
    const tri = shapeFrom(["#....", "##...", "###..", "####.", "#####"]);
    const items: NestItem[] = [
      { id: "a", shapeKey: "tri", shape: tri, rotations: [0, 90, 180, 270] },
      { id: "b", shapeKey: "tri", shape: tri, rotations: [0, 90, 180, 270] },
    ];
    const r = nestShapes(items, 8, 1);
    expect(r.unplacedIds).toEqual([]);
    // Bounding boxes 5×5 each; stacked they would need 5 + 1 + 5 = 11 rows.
    expect(r.lengthCells).toBeLessThanOrEqual(6);
  });

  it("rotates a long transfer to fit and reports one that is too wide", () => {
    const r = nestShapes(
      [
        { id: "long", shapeKey: "long", shape: solidShape(12, 3), rotations: [0, 90] },
        { id: "wide", shapeKey: "wide", shape: solidShape(12, 12), rotations: [0, 90] },
      ],
      10,
      1,
    );
    expect(r.unplacedIds).toEqual(["wide"]);
    expect(r.placements[0]).toMatchObject({ id: "long", rotation: 90, widthCells: 3, heightCells: 12 });
  });

  it("never lets two transfers touch closer than the gap", () => {
    const blob = shapeFrom([".##.", "####", "####", ".##."]);
    const items: NestItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: `b${i}`,
      shapeKey: "blob",
      shape: blob,
      rotations: [0, 90, 180, 270],
    }));
    const gap = 2;
    const r = nestShapes(items, 20, gap);
    const ink: { x: number; y: number; id: string }[] = [];
    for (const p of r.placements) {
      const s = rotateShape(blob, p.rotation);
      for (let y = 0; y < s.heightCells; y++)
        for (let x = 0; x < s.widthCells; x++)
          if (s.cells[y * s.widthCells + x]) ink.push({ x: p.xCells + x, y: p.yCells + y, id: p.id });
    }
    for (const a of ink)
      for (const b of ink)
        if (a.id !== b.id) expect((a.x - b.x) ** 2 + (a.y - b.y) ** 2).toBeGreaterThan(gap * gap);
  });
});
