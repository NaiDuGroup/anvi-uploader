import { describe, expect, it } from "vitest";
import {
  crc32,
  dpiToPixelsPerMeter,
  injectPngPhysChunk,
  isPng,
  pixelsPerMeterToDpi,
  readPngPhysChunk,
  readSourceDpiFromFile,
} from "./pngPhysChunk";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function writeUint32Be(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function wrapChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeUint32Be(out, 0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  writeUint32Be(out, 8 + data.length, crc);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function chunkTypes(bytes: Uint8Array): string[] {
  const types: string[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length =
      ((bytes[offset]! << 24) |
        (bytes[offset + 1]! << 16) |
        (bytes[offset + 2]! << 8) |
        bytes[offset + 3]!) >>>
      0;
    types.push(
      String.fromCharCode(
        bytes[offset + 4]!,
        bytes[offset + 5]!,
        bytes[offset + 6]!,
        bytes[offset + 7]!,
      ),
    );
    offset += 12 + length;
  }
  return types;
}

/** Minimal valid 1×1 PNG: signature + IHDR + empty IDAT + IEND. */
function minimalPng(): Uint8Array {
  const ihdrData = new Uint8Array(13);
  writeUint32Be(ihdrData, 0, 1);
  writeUint32Be(ihdrData, 4, 1);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  return concat(
    PNG_SIGNATURE,
    wrapChunk("IHDR", ihdrData),
    wrapChunk("IDAT", new Uint8Array(0)),
    wrapChunk("IEND", new Uint8Array(0)),
  );
}

describe("dpiToPixelsPerMeter", () => {
  it("converts 300 DPI to the PNG-standard 11811 ppm", () => {
    expect(dpiToPixelsPerMeter(300)).toBe(11811);
  });

  it("round-trips through pixelsPerMeterToDpi within 1 DPI", () => {
    const dpi = pixelsPerMeterToDpi(dpiToPixelsPerMeter(300));
    expect(dpi).not.toBeNull();
    expect(Math.round(dpi!)).toBe(300);
  });
});

describe("isPng", () => {
  it("accepts a PNG signature and rejects other bytes", () => {
    expect(isPng(minimalPng())).toBe(true);
    expect(isPng(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
    expect(isPng(new Uint8Array(4))).toBe(false);
  });
});

describe("injectPngPhysChunk / readPngPhysChunk", () => {
  it("returns null when no pHYs chunk is present", () => {
    expect(readPngPhysChunk(minimalPng())).toBeNull();
  });

  it("inserts pHYs after IHDR and before IDAT", () => {
    const withPhys = injectPngPhysChunk(minimalPng(), 11811, 11811);
    expect(chunkTypes(withPhys)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
    expect(readPngPhysChunk(withPhys)).toEqual({
      xPpm: 11811,
      yPpm: 11811,
      unit: 1,
    });
  });

  it("replaces an existing pHYs instead of duplicating it", () => {
    const first = injectPngPhysChunk(minimalPng(), 11811, 11811);
    const second = injectPngPhysChunk(first, 5906, 5906);
    expect(chunkTypes(second).filter((t) => t === "pHYs")).toHaveLength(1);
    expect(readPngPhysChunk(second)).toEqual({
      xPpm: 5906,
      yPpm: 5906,
      unit: 1,
    });
  });

  it("writes a CRC that matches the type+data bytes", () => {
    const withPhys = injectPngPhysChunk(minimalPng(), 11811, 11811);
    const types = chunkTypes(withPhys);
    const physIndex = types.indexOf("pHYs");
    expect(physIndex).toBeGreaterThan(0);
    let offset = PNG_SIGNATURE.length;
    for (let i = 0; i < physIndex; i += 1) {
      const length =
        ((withPhys[offset]! << 24) |
          (withPhys[offset + 1]! << 16) |
          (withPhys[offset + 2]! << 8) |
          withPhys[offset + 3]!) >>>
        0;
      offset += 12 + length;
    }
    const length =
      ((withPhys[offset]! << 24) |
        (withPhys[offset + 1]! << 16) |
        (withPhys[offset + 2]! << 8) |
        withPhys[offset + 3]!) >>>
      0;
    const crcStored =
      ((withPhys[offset + 8 + length]! << 24) |
        (withPhys[offset + 9 + length]! << 16) |
        (withPhys[offset + 10 + length]! << 8) |
        withPhys[offset + 11 + length]!) >>>
      0;
    const crcComputed = crc32(withPhys.subarray(offset + 4, offset + 8 + length));
    expect(crcStored).toBe(crcComputed);
  });
});

describe("readSourceDpiFromFile", () => {
  it("reads 300 DPI from a PNG blob with pHYs=11811", async () => {
    const bytes = injectPngPhysChunk(minimalPng(), 11811, 11811);
    const file = new File([toArrayBuffer(bytes)], "cover.png", { type: "image/png" });
    expect(await readSourceDpiFromFile(file)).toBe(300);
  });

  it("returns null when the PNG has no pHYs chunk", async () => {
    const file = new File([toArrayBuffer(minimalPng())], "cover.png", { type: "image/png" });
    expect(await readSourceDpiFromFile(file)).toBeNull();
  });
});
