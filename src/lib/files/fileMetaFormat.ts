/** File facts as the browser gets them (`POST /api/files/meta`). */
export interface FileMetaJson {
  sizeBytes: number | null;
  pixelWidth: number | null;
  pixelHeight: number | null;
  dpi: number | null;
  widthMm: number | null;
  heightMm: number | null;
  pageCount: number | null;
  /** "ok" | "unsupported" | "missing" */
  metaStatus: string | null;
}

export interface FileMetaText {
  pages: (count: number) => string;
  noDpi: string;
  at300: string;
  missing: string;
  cm: string;
  units: { b: string; kb: string; mb: string; gb: string };
  /** Artwork vs the size declared on the order line. */
  check: {
    reading: string;
    larger: (fileSize: string, declared: string) => string;
    aspect: (declared: string) => string;
    lowres: (dpi: number) => string;
    nodpi: string;
    /** Client cabinet: why the order cannot be sent. */
    blocked: string;
  };
}

function num(n: number, locale: string, digits = 1): string {
  return n.toLocaleString(locale, { maximumFractionDigits: digits });
}

export function formatBytes(bytes: number, text: FileMetaText, locale: string): string {
  if (bytes < 1024) return `${bytes} ${text.units.b}`;
  if (bytes < 1024 ** 2) return `${num(bytes / 1024, locale, 0)} ${text.units.kb}`;
  if (bytes < 1024 ** 3) return `${num(bytes / 1024 ** 2, locale)} ${text.units.mb}`;
  return `${num(bytes / 1024 ** 3, locale, 2)} ${text.units.gb}`;
}

export function sizeCm(wMm: number, hMm: number, text: FileMetaText, locale: string): string {
  return `${num(wMm / 10, locale)}×${num(hMm / 10, locale)} ${text.cm}`;
}

/**
 * One line for staff, e.g. «21×29,7 см · 300 dpi · 2480×3508 px · 4,1 МБ».
 * A raster without dpi shows the size it would print at 300 dpi.
 */
export function formatFileMeta(meta: FileMetaJson, text: FileMetaText, locale: string): string {
  if (meta.metaStatus === "missing") return text.missing;
  const parts: string[] = [];
  if (meta.widthMm && meta.heightMm) parts.push(sizeCm(meta.widthMm, meta.heightMm, text, locale));
  if (meta.pixelWidth && meta.pixelHeight) {
    if (meta.dpi) parts.push(`${num(meta.dpi, locale, 0)} dpi`);
    else {
      parts.push(text.noDpi);
      const at300 = (px: number): number => (px / 300) * 25.4;
      parts.push(`${sizeCm(at300(meta.pixelWidth), at300(meta.pixelHeight), text, locale)} ${text.at300}`);
    }
    parts.push(`${meta.pixelWidth}×${meta.pixelHeight} px`);
  }
  if (meta.sizeBytes != null) parts.push(formatBytes(meta.sizeBytes, text, locale));
  return parts.join(" · ");
}
