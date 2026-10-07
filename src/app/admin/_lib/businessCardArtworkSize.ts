import { getImageDimensions } from "@/lib/imageDimensions";
import { DEFAULT_DPI, pxToCm } from "@/lib/printDimensions";
import type { BusinessCardSizeCm } from "@/lib/businessCard/businessCardArtworkCheck";

const PT_PER_CM = 72 / 2.54;

async function isPdf(blob: Blob): Promise<boolean> {
  if (blob.type === "application/pdf") return true;
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === "%PDF-";
}

/**
 * Physical size of a business-card artwork in the browser. PDFs report their
 * page (MediaBox — the area the imposition draws); raster files are read at the
 * studio's 300 dpi print resolution. `null` when the file cannot be decoded,
 * so the caller can warn instead of guessing.
 */
export async function readBusinessCardArtworkSizeCm(
  blob: Blob,
): Promise<BusinessCardSizeCm | null> {
  try {
    if (await isPdf(blob)) {
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(await blob.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const page = doc.getPages()[0];
      if (!page) return null;
      const box = page.getMediaBox();
      return { widthCm: box.width / PT_PER_CM, heightCm: box.height / PT_PER_CM };
    }
    const { width, height } = await getImageDimensions(blob);
    return {
      widthCm: pxToCm(width, DEFAULT_DPI),
      heightCm: pxToCm(height, DEFAULT_DPI),
    };
  } catch {
    return null;
  }
}

/** Same as {@link readBusinessCardArtworkSizeCm} for a file already on the order. */
export async function readStoredBusinessCardArtworkSizeCm(
  fileId: string,
): Promise<BusinessCardSizeCm | null> {
  try {
    const res = await fetch(`/api/download/${fileId}`, {
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    return readBusinessCardArtworkSizeCm(await res.blob());
  } catch {
    return null;
  }
}
