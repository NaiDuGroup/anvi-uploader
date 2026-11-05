/**
 * TIFF size and dpi from the IFD only — no pixel decoding. Works on random
 * access reads (a `File.slice` in the browser, an object range on the server),
 * because many writers put the IFD after the pixels, at the end of a
 * multi-hundred-MB banner.
 */

export type ByteReader = (offset: number, length: number) => Promise<Uint8Array>;

export interface TiffHead {
  width: number;
  height: number;
  dpi: number | null;
}

const MAX_IFDS = 8;

export function isTiffHead(b: Uint8Array): boolean {
  if (b.length < 4) return false;
  return (
    (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
    (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)
  );
}

/** Width, height (orientation applied) and dpi of the main image; null if not a classic TIFF. */
export async function readTiffHead(read: ByteReader): Promise<TiffHead | null> {
  const head = await read(0, 8);
  if (head.length < 8 || !isTiffHead(head)) return null;
  const le = head[0] === 0x49;
  const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  let ifdOff = dv(head).getUint32(4, le);

  let fallback: TiffHead | null = null;
  for (let n = 0; n < MAX_IFDS && ifdOff > 0; n++) {
    const countBytes = await read(ifdOff, 2);
    if (countBytes.length < 2) break;
    const count = dv(countBytes).getUint16(0, le);
    const ifd = await read(ifdOff + 2, count * 12 + 4);
    if (ifd.length < count * 12) break;
    const v = dv(ifd);

    let width = 0;
    let height = 0;
    let orientation = 1;
    let subfile = 0;
    let unit = 2;
    let xResOff = -1;
    for (let i = 0; i < count; i++) {
      const e = i * 12;
      const tag = v.getUint16(e, le);
      const type = v.getUint16(e + 2, le);
      const value = type === 3 ? v.getUint16(e + 8, le) : v.getUint32(e + 8, le);
      if (tag === 256) width = value;
      else if (tag === 257) height = value;
      else if (tag === 254) subfile = value;
      else if (tag === 274) orientation = value;
      else if (tag === 296) unit = value;
      else if (tag === 282 && type === 5) xResOff = v.getUint32(e + 8, le);
    }

    let dpi: number | null = null;
    if (xResOff > 0) {
      const r = await read(xResOff, 8);
      if (r.length === 8) {
        const num = dv(r).getUint32(0, le);
        const den = dv(r).getUint32(4, le);
        const x = den ? num / den : 0;
        if (x > 1 && unit !== 1) dpi = unit === 3 ? x * 2.54 : x;
      }
    }
    if (width > 0 && height > 0) {
      const swap = orientation >= 5;
      const found = { width: swap ? height : width, height: swap ? width : height, dpi };
      // Skip reduced-resolution previews (NewSubfileType bit 0).
      if ((subfile & 1) === 0) return found;
      fallback ??= found;
    }
    ifdOff = ifd.length >= count * 12 + 4 ? v.getUint32(count * 12, le) : 0;
  }
  return fallback;
}

/** Reader over bytes already in memory (the first chunk), falling back to `more` beyond it. */
export function headFirstReader(head: Uint8Array, more?: ByteReader): ByteReader {
  return async (offset, length) => {
    if (offset + length <= head.length || !more) return head.subarray(offset, Math.min(head.length, offset + length));
    return more(offset, length);
  };
}
