const TARGET_DPI = 300;
const PIXELS_PER_METER = Math.round((TARGET_DPI / 2.54) * 100); // 11811

/**
 * Export a canvas as a 300-DPI PNG Blob.
 *
 * HTML Canvas toBlob() always writes 72 DPI in the PNG pHYs chunk.
 * We patch the raw PNG bytes to set the correct 300 DPI metadata so
 * print software reads the intended physical size (21 cm x 9.6 cm).
 */
export async function exportCanvasAsBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const raw = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
      "image/png",
      1.0,
    );
  });

  const buf = await raw.arrayBuffer();
  const patched = setPngDpi(new Uint8Array(buf), PIXELS_PER_METER);
  return new Blob([patched.buffer as ArrayBuffer], { type: "image/png" });
}

export function blobToFile(blob: Blob, fileName: string): File {
  return new File([blob], fileName, { type: "image/png" });
}

// ---------------------------------------------------------------------------
// PNG pHYs chunk manipulation
// ---------------------------------------------------------------------------

const PNG_SIG_LEN = 8;
const CHUNK_HEADER = 4 + 4; // length (4) + type (4)
const CHUNK_CRC = 4;

function readU32(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0
  );
}

function writeU32(data: Uint8Array, offset: number, value: number) {
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >>> 16) & 0xff;
  data[offset + 2] = (value >>> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

function chunkType(data: Uint8Array, offset: number): string {
  return String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);
}

/** CRC-32 used by PNG (same polynomial as zlib). */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a pHYs chunk with the given pixels-per-meter value. */
function buildPhysChunk(ppm: number): Uint8Array {
  // pHYs data: 4 bytes X-ppm + 4 bytes Y-ppm + 1 byte unit(1=meter) = 9 bytes
  const dataLen = 9;
  const chunk = new Uint8Array(CHUNK_HEADER + dataLen + CHUNK_CRC);
  writeU32(chunk, 0, dataLen);
  // "pHYs"
  chunk[4] = 0x70; chunk[5] = 0x48; chunk[6] = 0x59; chunk[7] = 0x73;
  writeU32(chunk, 8, ppm);
  writeU32(chunk, 12, ppm);
  chunk[16] = 1; // unit = meter
  const crc = crc32(chunk.subarray(4, 4 + 4 + dataLen));
  writeU32(chunk, 4 + 4 + dataLen, crc);
  return chunk;
}

/**
 * Replace or insert a pHYs chunk in a PNG so it declares the given pixels-per-meter.
 * Returns a new Uint8Array with the patched PNG.
 */
function setPngDpi(png: Uint8Array, ppm: number): Uint8Array {
  const phys = buildPhysChunk(ppm);

  let offset = PNG_SIG_LEN;
  let physStart = -1;
  let physEnd = -1;
  let firstIdatOffset = -1;

  while (offset < png.length) {
    const len = readU32(png, offset);
    const type = chunkType(png, offset);
    const chunkEnd = offset + CHUNK_HEADER + len + CHUNK_CRC;

    if (type === "pHYs") {
      physStart = offset;
      physEnd = chunkEnd;
    }
    if (type === "IDAT" && firstIdatOffset < 0) {
      firstIdatOffset = offset;
    }
    offset = chunkEnd;
  }

  if (physStart >= 0) {
    // Replace existing pHYs
    const before = png.subarray(0, physStart);
    const after = png.subarray(physEnd);
    const out = new Uint8Array(before.length + phys.length + after.length);
    out.set(before, 0);
    out.set(phys, before.length);
    out.set(after, before.length + phys.length);
    return out;
  }

  // Insert before first IDAT (or at end of header chunks)
  const insertAt = firstIdatOffset >= 0 ? firstIdatOffset : PNG_SIG_LEN + CHUNK_HEADER + readU32(png, PNG_SIG_LEN) + CHUNK_CRC;
  const before = png.subarray(0, insertAt);
  const after = png.subarray(insertAt);
  const out = new Uint8Array(before.length + phys.length + after.length);
  out.set(before, 0);
  out.set(phys, before.length);
  out.set(after, before.length + phys.length);
  return out;
}
