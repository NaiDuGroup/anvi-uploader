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
  /**
   * Set for business-card artwork (file tagged `business_card_front/back`):
   * the card file size (trim + bleed) and the trim, in mm. The line is then
   * measured against the card instead of the dpi written in the file.
   */
  card?: BusinessCardFrame | null;
}

/** Card artwork size (trim + bleed) and finished trim size, mm. */
export interface BusinessCardFrame {
  widthMm: number;
  heightMm: number;
  trimWidthMm: number;
  trimHeightMm: number;
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
    /** UV on a client's item: the file is neither the print size nor the item size. */
    neither: (print: string, item: string) => string;
  };
  /** Business-card artwork, measured against the card size. */
  card: {
    /** «~324 dpi на 94×54 мм» */
    dpi: (dpi: string, size: string) => string;
    /** «пропорции не 94×54» */
    aspectOff: (size: string) => string;
    /** Proportions of the trim, i.e. the artwork has no bleed. */
    aspectTrim: (trim: string) => string;
    /** PDF page size label, e.g. «94×54 мм» */
    page: (size: string) => string;
    pageBleed: string;
    pageTrim: string;
    pageOff: (size: string, trim: string) => string;
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

/** Relative tolerance for «same proportions» (2 %). */
const CARD_ASPECT_TOLERANCE = 0.02;
/** A PDF page counts as the card size within ±1 mm. */
const CARD_PAGE_TOLERANCE_MM = 1;
/** Below this effective dpi the card line is shown as a warning. */
const CARD_LOW_DPI = 250;

function mm(wMm: number, hMm: number, locale: string): string {
  return `${num(wMm, locale)}×${num(hMm, locale)}`;
}

/** Card frame turned to the artwork's orientation (vertical cards exist). */
function orient(card: BusinessCardFrame, w: number, h: number): BusinessCardFrame {
  if (w >= h === card.widthMm >= card.heightMm) return card;
  return { widthMm: card.heightMm, heightMm: card.widthMm, trimWidthMm: card.trimHeightMm, trimHeightMm: card.trimWidthMm };
}

function sameAspect(w: number, h: number, cw: number, ch: number): boolean {
  return Math.abs(w / h / (cw / ch) - 1) <= CARD_ASPECT_TOLERANCE;
}

function sameSize(w: number, h: number, cw: number, ch: number): boolean {
  return Math.abs(w - cw) <= CARD_PAGE_TOLERANCE_MM && Math.abs(h - ch) <= CARD_PAGE_TOLERANCE_MM;
}

interface CardMetaParts {
  parts: string[];
  warn: boolean;
}

/** Business-card artwork vs the card size; null when the file has no size to compare. */
function cardMetaParts(meta: FileMetaJson, card: BusinessCardFrame, text: FileMetaText, locale: string): CardMetaParts | null {
  if (meta.pixelWidth && meta.pixelHeight) {
    const c = orient(card, meta.pixelWidth, meta.pixelHeight);
    const dpi = meta.pixelWidth / (c.widthMm / 25.4);
    const parts = [
      `${meta.pixelWidth}×${meta.pixelHeight} px`,
      text.card.dpi(num(dpi, locale, 0), mm(c.widthMm, c.heightMm, locale)),
    ];
    let aspectOk = true;
    if (!sameAspect(meta.pixelWidth, meta.pixelHeight, c.widthMm, c.heightMm)) {
      aspectOk = false;
      parts.push(
        sameAspect(meta.pixelWidth, meta.pixelHeight, c.trimWidthMm, c.trimHeightMm)
          ? text.card.aspectTrim(mm(c.trimWidthMm, c.trimHeightMm, locale))
          : text.card.aspectOff(mm(c.widthMm, c.heightMm, locale)),
      );
    }
    return { parts, warn: !aspectOk || dpi < CARD_LOW_DPI };
  }
  if (meta.widthMm && meta.heightMm) {
    const c = orient(card, meta.widthMm, meta.heightMm);
    const parts = [text.card.page(mm(meta.widthMm, meta.heightMm, locale))];
    let warn = false;
    if (sameSize(meta.widthMm, meta.heightMm, c.widthMm, c.heightMm)) parts.push(text.card.pageBleed);
    else if (sameSize(meta.widthMm, meta.heightMm, c.trimWidthMm, c.trimHeightMm)) parts.push(text.card.pageTrim);
    else {
      warn = true;
      parts.push(text.card.pageOff(mm(card.widthMm, card.heightMm, locale), mm(card.trimWidthMm, card.trimHeightMm, locale)));
    }
    return { parts, warn };
  }
  return null;
}

/** Whether the meta line should be shown as a warning (amber). */
export function fileMetaWarns(meta: FileMetaJson, text: FileMetaText, locale: string): boolean {
  if (meta.metaStatus === "missing") return true;
  if (meta.card) {
    const card = cardMetaParts(meta, meta.card, text, locale);
    if (card) return card.warn;
  }
  return meta.pixelWidth != null && meta.dpi == null;
}

/**
 * One line for staff, e.g. «21×29,7 см · 300 dpi · 2480×3508 px · 4,1 МБ».
 * A raster without dpi shows the size it would print at 300 dpi.
 * Business-card artwork is measured against the card file size instead:
 * «1200×1200 px · ~324 dpi на 94×54 мм · пропорции не 94×54 · 1,2 МБ».
 */
export function formatFileMeta(meta: FileMetaJson, text: FileMetaText, locale: string): string {
  if (meta.metaStatus === "missing") return text.missing;
  const card = meta.card ? cardMetaParts(meta, meta.card, text, locale) : null;
  if (card) {
    if (meta.sizeBytes != null) card.parts.push(formatBytes(meta.sizeBytes, text, locale));
    return card.parts.join(" · ");
  }
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
