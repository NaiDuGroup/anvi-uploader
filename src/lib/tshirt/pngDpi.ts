/**
 * Write the print resolution into a PNG (pHYs chunk), so print software opens
 * the file at its real size: 3543 px at 300 DPI = 30 cm. Canvas PNGs carry no
 * resolution and are read as 72 DPI otherwise.
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** PNG bytes with a pHYs chunk set to `dpi` (any existing one replaced). */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
  if (png.length < 33 || SIGNATURE.some((b, i) => png[i] !== b)) throw new Error("not_png");
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const ppm = Math.round(dpi / 0.0254); // pixels per metre

  const chunk = new Uint8Array(21);
  const cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  cv.setUint32(8, ppm);
  cv.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  cv.setUint32(17, crc32(chunk.subarray(4, 17)));

  // Copy every chunk, dropping an old pHYs, and put ours right after IHDR.
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let off = 8;
  while (off + 12 <= png.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(png[off + 4]!, png[off + 5]!, png[off + 6]!, png[off + 7]!);
    const end = off + 12 + len;
    if (type !== "pHYs") parts.push(png.subarray(off, end));
    if (type === "IHDR") parts.push(chunk);
    off = end;
    if (type === "IEND") break;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Resolution stored in a PNG (null if none). */
export function readPngDpi(png: Uint8Array): number | null {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let off = 8;
  while (off + 12 <= png.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(png[off + 4]!, png[off + 5]!, png[off + 6]!, png[off + 7]!);
    if (type === "pHYs" && png[off + 16] === 1) return Math.round(view.getUint32(off + 8) * 0.0254);
    off += 12 + len;
  }
  return null;
}

/** One PNG chunk: length, type, data, CRC. */
export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Complete RGBA PNG from already-compressed (zlib) scanlines, with its resolution. */
export function assemblePng(width: number, height: number, zlibScanlines: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 8; // bits per channel
  ihdr[9] = 6; // RGBA
  const ppm = Math.round(dpi / 0.0254);
  const phys = new Uint8Array(9);
  const pv = new DataView(phys.buffer);
  pv.setUint32(0, ppm);
  pv.setUint32(4, ppm);
  phys[8] = 1;
  const parts = [
    new Uint8Array(SIGNATURE),
    pngChunk("IHDR", ihdr),
    pngChunk("pHYs", phys),
    pngChunk("IDAT", zlibScanlines),
    pngChunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
