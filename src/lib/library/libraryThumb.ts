import "server-only";
import sharp from "sharp";
import { getObjectBytesIfSmall, isLocalObjectStorage } from "@/lib/r2";
import { readLocalFile, statLocalFile } from "@/lib/local-storage";
import { readObjectBytes, writeObjectBytes } from "@/lib/design/objectStore";
import { pdfFirstPageToPng } from "@/lib/sheetProduct/pdfArtworkToPng";
import { libraryThumbKeys, thumbKindOf } from "./libraryKeys";

/** Longest side of a thumbnail: sharp on a 2× phone card / picker row. */
export const THUMB_MAX_PX = 480;
/** Larger originals get no thumbnail (a whole file is read into memory to render it). */
export const THUMB_SOURCE_MAX_BYTES = 60 * 1024 * 1024;

/** Source bytes when the object exists and is small enough to render. */
async function readSource(key: string): Promise<Buffer | "missing" | "too_big"> {
  if (isLocalObjectStorage()) {
    const st = await statLocalFile(key);
    if (!st) return "missing";
    if (st.size > THUMB_SOURCE_MAX_BYTES) return "too_big";
    return (await readLocalFile(key)) ?? "missing";
  }
  const got = await getObjectBytesIfSmall(key, THUMB_SOURCE_MAX_BYTES);
  if (!got) return "missing";
  return "tooBig" in got ? "too_big" : got.bytes;
}

/** WebP thumbnail of a PDF (first page) or raster image; throws when it cannot be rendered. */
export async function renderThumb(bytes: Buffer, kind: "pdf" | "raster"): Promise<Buffer> {
  const input = kind === "pdf" ? await pdfFirstPageToPng(bytes, THUMB_MAX_PX) : bytes;
  return sharp(input, { pages: 1, failOn: "none" })
    .rotate()
    .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .webp({ quality: 74 })
    .toBuffer();
}

export type ThumbResult = { ok: true; bytes: Buffer } | { ok: false; reason: "no_preview" | "missing" };

/** Thumbnail of a stored file, rendered on the fly (no cache: order files expire anyway). */
export async function thumbForStoredFile(key: string, fileName: string): Promise<ThumbResult> {
  const kind = thumbKindOf(fileName);
  if (!kind) return { ok: false, reason: "no_preview" };
  const src = await readSource(key);
  if (src === "missing") return { ok: false, reason: "missing" };
  if (src === "too_big") return { ok: false, reason: "no_preview" };
  try {
    return { ok: true, bytes: await renderThumb(src, kind) };
  } catch (error) {
    console.error("thumb: render failed", key, error);
    return { ok: false, reason: "no_preview" };
  }
}

/**
 * Thumbnail of a library item, cached next to the copies under
 * `library/thumbs/<id>.webp` (rendered once on first view; a `.none` marker
 * remembers files that cannot be previewed so they are not re-read every time).
 */
export async function libraryItemThumb(item: { id: string; storageKey: string; fileName: string }): Promise<ThumbResult> {
  if (!thumbKindOf(item.fileName)) return { ok: false, reason: "no_preview" };
  const keys = libraryThumbKeys(item.id);
  const cached = await readObjectBytes(keys.thumb, "uploads").catch(() => null);
  if (cached && cached.byteLength > 0) return { ok: true, bytes: cached };
  const marker = await readObjectBytes(keys.none, "uploads").catch(() => null);
  if (marker) return { ok: false, reason: "no_preview" };

  const res = await thumbForStoredFile(item.storageKey, item.fileName);
  if (res.ok) {
    await writeObjectBytes(keys.thumb, res.bytes, "image/webp", "uploads").catch((error) =>
      console.error("thumb: cache write failed", keys.thumb, error),
    );
  } else if (res.reason === "no_preview") {
    await writeObjectBytes(keys.none, Buffer.from("1"), "text/plain", "uploads").catch(() => {});
  }
  return res;
}
