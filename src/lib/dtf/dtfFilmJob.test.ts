import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildDtfFilmPdf, erodeMask, planDtfFilm, type DtfFilmFile } from "./dtfFilmJob";

/** 10×10 cm canvas at 100 px/cm with a centred 4 cm disc; the rest is transparent. */
async function discPng(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><circle cx="500" cy="500" r="200" fill="#c00"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function photoJpg(): Promise<Buffer> {
  return sharp({ create: { width: 300, height: 200, channels: 3, background: "#3366aa" } }).jpeg().toBuffer();
}

describe("planDtfFilm", () => {
  it("cuts transparent margins and nests copies by their outline", async () => {
    const files: Record<string, DtfFilmFile> = {
      disc: { fileName: "disc.png", buffer: await discPng() },
      photo: { fileName: "photo.jpg", buffer: await photoJpg() },
    };
    const job = await planDtfFilm({
      transfers: [
        ...[0, 1, 2, 3].map((i) => ({ tileId: `d${i}`, fileId: "disc", widthCm: 10, heightCm: 10 })),
        { tileId: "p", fileId: "photo", widthCm: 6, heightCm: 4 },
        { tileId: "x", fileId: "missing", widthCm: 5, heightCm: 5 },
      ],
      filmWidthCm: 30,
      layoutGapMm: 3,
      whiteChokeMm: 0.2,
      loadFile: async (id) => files[id] ?? null,
    });

    expect(job.unplaced).toEqual([{ tileId: "x", reason: "unreadable" }]);
    const disc = job.placements.find((p) => p.tileId === "d0")!;
    expect(disc.widthCm).toBeGreaterThan(3.9);
    expect(disc.widthCm).toBeLessThanOrEqual(4.3);
    // Four 4 cm discs with a 3 mm gap fit across a 30 cm film in one row; 10 cm canvases would not.
    expect(job.lengthCm).toBeLessThan(5);
    expect(job.placements.find((p) => p.tileId === "p")).toMatchObject({ widthCm: 6, heightCm: 4 });

    const pdf = Buffer.from(await buildDtfFilmPdf(job)).toString("latin1");
    expect(pdf).toContain("/Separation /White");
    expect(pdf).toContain("/ImageMask true");
    expect(pdf).toMatch(/\/OP true/);
  }, 30_000);

  it("reports an artwork that is wider than the film", async () => {
    const job = await planDtfFilm({
      transfers: [{ tileId: "w", fileId: "photo", widthCm: 40, heightCm: 35 }],
      filmWidthCm: 30,
      layoutGapMm: 3,
      whiteChokeMm: 0,
      loadFile: async () => ({ fileName: "photo.jpg", buffer: await photoJpg() }),
    });
    expect(job.unplaced).toEqual([{ tileId: "w", reason: "too_wide" }]);
  });
});

describe("erodeMask", () => {
  it("shrinks the white by the choke on every side", () => {
    const m = new Uint8Array(25).fill(1);
    const out = erodeMask(m, 5, 5, 1);
    expect([...out]).toEqual([
      0, 0, 0, 0, 0,
      0, 1, 1, 1, 0,
      0, 1, 1, 1, 0,
      0, 1, 1, 1, 0,
      0, 0, 0, 0, 0,
    ]);
  });
});
