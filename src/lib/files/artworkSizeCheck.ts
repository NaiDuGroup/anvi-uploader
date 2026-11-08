import type { FileMetaJson } from "./fileMetaFormat";

/**
 * Does an artwork match the print size declared for it?
 *
 * - `larger`: the file prints bigger than declared (by its own dpi or PDF page)
 *   — the price was taken for a smaller print. Clients cannot submit this.
 * - `aspect`: proportions differ, so the print would be cut or distorted.
 * - `lowres`: fewer than `LOW_DPI` pixels per inch at the declared size.
 * - `nodpi`: a raster without dpi — only proportions can be checked.
 * The file may be turned 90° (width ↔ height) in every check.
 */
export type ArtworkSizeIssue = "larger" | "aspect" | "lowres" | "nodpi";

export interface ArtworkSizeCheck {
  issues: ArtworkSizeIssue[];
  /** Physical artwork size (cm) when known. */
  fileWidthCm: number | null;
  fileHeightCm: number | null;
  /** Resolution the print gets at the declared size. */
  effectiveDpi: number | null;
}

/** Bigger by more than this share and this many cm on a side = "larger". */
const LARGER_SHARE = 0.05;
const LARGER_MIN_CM = 0.5;
const ASPECT_TOLERANCE = 0.1;
export const LOW_DPI = 150;

function orientations(w: number, h: number): [number, number][] {
  return [
    [w, h],
    [h, w],
  ];
}

export function checkArtworkSize(
  meta: FileMetaJson | null | undefined,
  declared: { widthCm: number; heightCm: number } | null | undefined,
): ArtworkSizeCheck | null {
  if (!meta || meta.metaStatus !== "ok" || !declared || !(declared.widthCm > 0) || !(declared.heightCm > 0)) {
    return null;
  }
  const { widthCm: dw, heightCm: dh } = declared;
  const issues: ArtworkSizeIssue[] = [];
  const fw = meta.widthMm ? meta.widthMm / 10 : null;
  const fh = meta.heightMm ? meta.heightMm / 10 : null;

  if (fw && fh) {
    const tooBig = orientations(fw, fh).every(
      ([w, h]) =>
        (w > dw * (1 + LARGER_SHARE) && w - dw > LARGER_MIN_CM) ||
        (h > dh * (1 + LARGER_SHARE) && h - dh > LARGER_MIN_CM),
    );
    if (tooBig) issues.push("larger");
  }

  const aw = meta.pixelWidth ?? fw;
  const ah = meta.pixelHeight ?? fh;
  if (aw && ah && !issues.includes("larger")) {
    const off = Math.min(...orientations(aw, ah).map(([w, h]) => Math.abs(Math.log(w / h / (dw / dh)))));
    if (off > Math.log(1 + ASPECT_TOLERANCE)) issues.push("aspect");
  }

  let effectiveDpi: number | null = null;
  if (meta.pixelWidth && meta.pixelHeight) {
    effectiveDpi = Math.round(
      Math.max(
        ...orientations(meta.pixelWidth, meta.pixelHeight).map(([w, h]) =>
          Math.min(w / (dw / 2.54), h / (dh / 2.54)),
        ),
      ),
    );
    if (effectiveDpi < LOW_DPI) issues.push("lowres");
    if (!meta.dpi) issues.push("nodpi");
  }

  return { issues, fileWidthCm: fw, fileHeightCm: fh, effectiveDpi };
}

/** Issues that mean «the file is not this size» (lowres / nodpi are about quality, not size). */
function sizeMismatch(check: ArtworkSizeCheck | null): boolean {
  return check != null && check.issues.some((i) => i === "larger" || i === "aspect");
}

/**
 * UV on a client's item: the artwork may be made to the print size or to the
 * whole item (the workshop's preferred way — the logo placed on the material).
 * `against` says which one the file matches; «neither» when it matches no size
 * (the check returned is then the print-size one).
 */
export function checkArtworkSizeForItem(
  meta: FileMetaJson | null | undefined,
  print: { widthCm: number; heightCm: number } | null | undefined,
  item: { widthCm: number; heightCm: number } | null | undefined,
): { check: ArtworkSizeCheck | null; against: "print" | "item" | "neither" } {
  const byPrint = checkArtworkSize(meta, print);
  if (!item) return { check: byPrint, against: "print" };
  if (byPrint && !sizeMismatch(byPrint)) return { check: byPrint, against: "print" };
  const byItem = checkArtworkSize(meta, item);
  if (byItem && !sizeMismatch(byItem)) return { check: byItem, against: "item" };
  if (!byPrint && !byItem) return { check: null, against: "print" };
  return { check: byPrint ?? byItem, against: "neither" };
}
