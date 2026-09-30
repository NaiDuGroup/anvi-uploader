/**
 * PNG `pHYs` (physical pixel dimensions) helpers.
 *
 * `canvas.toBlob("image/png")` never writes a `pHYs` chunk, so Photoshop /
 * Preview / Windows Photos treat the result as 72 DPI and report a physical
 * size ~4.17× too large. These functions parse and inject a valid `pHYs`
 * chunk so the batch composer can preserve the source print DPI (usually 300).
 *
 * Spec: ISO/IEC 15948 §11.3.5.3 — `pHYs` must appear before the first `IDAT`.
 */

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const CHUNK_TYPE_IHDR = "IHDR";
const CHUNK_TYPE_PHYS = "pHYs";
const CHUNK_TYPE_IDAT = "IDAT";
const PHYS_DATA_LENGTH = 9;
const UNIT_METER = 1;
/** Metres per inch — used to convert DPI ↔ pixels-per-metre. */
const METERS_PER_INCH = 0.0254;
/** Enough of a PNG to reach `pHYs` (always before the first `IDAT`). */
const PNG_HEADER_PROBE_BYTES = 2048;

export interface PngPhysChunk {
  xPpm: number;
  yPpm: number;
  /** `1` = metre (the only unit we write). `0` = unspecified. */
  unit: 0 | 1;
}

export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Convert dots-per-inch to pixels-per-metre, rounded to the nearest integer
 * as required by the PNG spec (`pHYs` stores 32-bit unsigned integers).
 * 300 DPI → 11811 ppm.
 */
export function dpiToPixelsPerMeter(dpi: number): number {
  return Math.round(dpi / METERS_PER_INCH);
}

/** Inverse of {@link dpiToPixelsPerMeter}. Returns `null` if ppm is not finite. */
export function pixelsPerMeterToDpi(ppm: number): number | null {
  if (!Number.isFinite(ppm) || ppm <= 0) return null;
  return ppm * METERS_PER_INCH;
}

export function readPngPhysChunk(bytes: Uint8Array): PngPhysChunk | null {
  if (!isPng(bytes)) return null;
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = readUint32Be(bytes, offset);
    const type = readChunkType(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) return null;
    if (type === CHUNK_TYPE_PHYS && length === PHYS_DATA_LENGTH) {
      const xPpm = readUint32Be(bytes, dataStart);
      const yPpm = readUint32Be(bytes, dataStart + 4);
      const unitByte = bytes[dataStart + 8] ?? 0;
      const unit: 0 | 1 = unitByte === 1 ? 1 : 0;
      return { xPpm, yPpm, unit };
    }
    if (type === "IEND") return null;
    offset = dataEnd + 4;
  }
  return null;
}

/**
 * Insert or replace a `pHYs` chunk. When replacing, the existing chunk is
 * overwritten in place. When inserting, the new chunk is placed immediately
 * after `IHDR` so it stays before the first `IDAT`.
 */
export function injectPngPhysChunk(
  bytes: Uint8Array,
  xPpm: number,
  yPpm: number = xPpm,
): Uint8Array {
  if (!isPng(bytes)) {
    throw new Error("Not a PNG");
  }
  const physChunk = encodePhysChunk(xPpm, yPpm);
  const existing = findChunk(bytes, CHUNK_TYPE_PHYS);
  if (existing) {
    const next = new Uint8Array(bytes.length - existing.totalLength + physChunk.length);
    next.set(bytes.subarray(0, existing.start), 0);
    next.set(physChunk, existing.start);
    next.set(bytes.subarray(existing.end), existing.start + physChunk.length);
    return next;
  }
  const ihdr = findChunk(bytes, CHUNK_TYPE_IHDR);
  if (!ihdr) {
    throw new Error("PNG is missing IHDR");
  }
  const next = new Uint8Array(bytes.length + physChunk.length);
  next.set(bytes.subarray(0, ihdr.end), 0);
  next.set(physChunk, ihdr.end);
  next.set(bytes.subarray(ihdr.end), ihdr.end + physChunk.length);
  return next;
}

/**
 * Read the print DPI from a PNG `File`. Probes only the first 2 KB — `pHYs`
 * is required to appear before `IDAT`, so it always sits near the header.
 * Returns `null` for JPEG / non-PNG / missing or unit-less `pHYs`.
 */
export async function readSourceDpiFromFile(file: File): Promise<number | null> {
  const header = new Uint8Array(
    await file.slice(0, PNG_HEADER_PROBE_BYTES).arrayBuffer(),
  );
  const phys = readPngPhysChunk(header);
  if (!phys || phys.unit !== 1 || phys.xPpm <= 0) return null;
  const dpi = pixelsPerMeterToDpi(phys.xPpm);
  if (dpi === null) return null;
  return Math.round(dpi);
}

function encodePhysChunk(xPpm: number, yPpm: number): Uint8Array {
  const data = new Uint8Array(PHYS_DATA_LENGTH);
  writeUint32Be(data, 0, xPpm);
  writeUint32Be(data, 4, yPpm);
  data[8] = UNIT_METER;
  return wrapChunk(CHUNK_TYPE_PHYS, data);
}

function wrapChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeUint32Be(out, 0, data.length);
  writeChunkType(out, 4, type);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  writeUint32Be(out, 8 + data.length, crc);
  return out;
}

interface LocatedChunk {
  start: number;
  end: number;
  totalLength: number;
}

function findChunk(bytes: Uint8Array, wanted: string): LocatedChunk | null {
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = readUint32Be(bytes, offset);
    const type = readChunkType(bytes, offset + 4);
    const end = offset + 12 + length;
    if (end > bytes.length) return null;
    if (type === wanted) {
      return { start: offset, end, totalLength: 12 + length };
    }
    if (type === "IEND" || type === CHUNK_TYPE_IDAT) {
      // Stop early: pHYs cannot legally appear after the first IDAT.
      if (wanted === CHUNK_TYPE_PHYS) return null;
    }
    offset = end;
  }
  return null;
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function writeUint32Be(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function readChunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function writeChunkType(bytes: Uint8Array, offset: number, type: string): void {
  bytes[offset] = type.charCodeAt(0);
  bytes[offset + 1] = type.charCodeAt(1);
  bytes[offset + 2] = type.charCodeAt(2);
  bytes[offset + 3] = type.charCodeAt(3);
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** PNG CRC-32 over `type || data` (ISO/IEC 15948 Annex D). */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC32_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
