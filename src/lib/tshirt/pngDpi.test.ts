import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { readPngDpi, setPngDpi } from "./pngDpi";

/** Minimal 1×1 PNG. */
function tinyPng(): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set([...type].map((ch) => ch.charCodeAt(0)), 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const idat = deflateSync(Buffer.from([0, 0, 0, 0, 0]));
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe("setPngDpi", () => {
  it("marks a canvas PNG as 300 DPI", () => {
    const png = tinyPng();
    expect(readPngDpi(png)).toBeNull();
    const out = setPngDpi(png, 300);
    expect(readPngDpi(out)).toBe(300);
    expect(out.length).toBe(png.length + 21);
  });
  it("replaces an existing resolution", () => {
    const out = setPngDpi(setPngDpi(tinyPng(), 72), 300);
    expect(readPngDpi(out)).toBe(300);
    expect(out.length).toBe(tinyPng().length + 21);
  });
  it("rejects other files", () => {
    expect(() => setPngDpi(new Uint8Array(40), 300)).toThrow("not_png");
  });
});
