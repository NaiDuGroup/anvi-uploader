import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findArtworkLargerThanOrdered } from "./serverArtworkCheck";

const KEY = "vitest-artwork-check/30x40.png";
const FILE = path.join(process.cwd(), ".local-uploads", KEY);

describe("findArtworkLargerThanOrdered (cabinet guard)", () => {
  const prev = process.env.R2_ACCOUNT_ID;
  beforeAll(async () => {
    process.env.R2_ACCOUNT_ID = "local-dev";
    await mkdir(path.dirname(FILE), { recursive: true });
    const png = await sharp({ create: { width: 3543, height: 4724, channels: 3, background: "#c22" } })
      .withMetadata({ density: 300 })
      .png()
      .toBuffer();
    await writeFile(FILE, png);
  });
  afterAll(async () => {
    process.env.R2_ACCOUNT_ID = prev;
    await rm(path.dirname(FILE), { recursive: true, force: true });
  });

  const line = (w: number, h: number) => ({
    productType: "large_format_print",
    printWidthCm: w,
    printHeightCm: h,
    files: [{ fileName: "30x40.png", fileUrl: KEY }],
  });

  it("refuses a 30×40 artwork ordered as 10×10", async () => {
    expect(await findArtworkLargerThanOrdered([line(10, 10)])).toBe("30x40.png");
  });

  it("lets the real size through", async () => {
    expect(await findArtworkLargerThanOrdered([line(30, 40)])).toBeNull();
    expect(await findArtworkLargerThanOrdered([line(100, 100)])).toBeNull();
  });
});
