/**
 * Client-side helpers for reading raster image dimensions and validating that
 * an uploaded "ready layout" matches the print area declared on the catalog
 * product. Used by the order forms when the user uploads a pre-made PNG.
 *
 * Validation is deliberately tolerant (±2 % by default) because real-world
 * exports from Photoshop/Figma/Canva often round to whole pixels and can drift
 * by ±1 px from the canonical value. The strict expected size still comes from
 * the catalog row, so the operator's hint stays exact.
 */

export interface PixelSize {
  width: number;
  height: number;
}

export interface SizeValidationResult {
  ok: boolean;
  expected: PixelSize;
  actual: PixelSize;
  /** Tolerance used for the comparison, expressed as a fraction (0.02 = 2 %). */
  tolerance: number;
}

/**
 * Read a file's natural pixel dimensions in the browser using `<img>` decoding.
 * Resolves with `{ width, height }` or rejects when the file isn't a decodable
 * image (e.g. corrupt PNG, unsupported format).
 *
 * Safe to call multiple times — each invocation creates and revokes its own
 * object URL, so callers don't have to manage the URL lifecycle.
 */
export function getImageDimensions(file: File | Blob): Promise<PixelSize> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("getImageDimensions can only run in the browser"),
    );
  }
  return new Promise<PixelSize>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const result = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(result);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read image dimensions"));
    };
    img.src = url;
  });
}

/**
 * Compare actual pixel dimensions against the expected ones with a relative
 * tolerance. Both axes must individually fall within `[expected * (1 - t),
 * expected * (1 + t)]`.
 */
export function validateLayoutSize(
  actual: PixelSize,
  expected: PixelSize,
  tolerance: number = 0.02,
): SizeValidationResult {
  const tol = Math.max(0, tolerance);
  const widthOk = withinTolerance(actual.width, expected.width, tol);
  const heightOk = withinTolerance(actual.height, expected.height, tol);
  return {
    ok: widthOk && heightOk,
    expected,
    actual,
    tolerance: tol,
  };
}

function withinTolerance(actual: number, expected: number, tolerance: number) {
  if (expected <= 0) return false;
  const diff = Math.abs(actual - expected);
  return diff / expected <= tolerance;
}
