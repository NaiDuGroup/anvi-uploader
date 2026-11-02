/** Declared print sizes of order lines, in cm, for the artwork size check. */

export interface PrintSizeCm {
  widthCm: number;
  heightCm: number;
}

const A_SERIES_CM: Record<string, PrintSizeCm> = {
  A0: { widthCm: 84.1, heightCm: 118.9 },
  A1: { widthCm: 59.4, heightCm: 84.1 },
  A2: { widthCm: 42, heightCm: 59.4 },
  A3: { widthCm: 29.7, heightCm: 42 },
  A4: { widthCm: 21, heightCm: 29.7 },
  A5: { widthCm: 14.8, heightCm: 21 },
  A6: { widthCm: 10.5, heightCm: 14.8 },
};

export function parseCm(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function sizeFromStrings(w: string | number | null | undefined, h: string | number | null | undefined): PrintSizeCm | null {
  const widthCm = parseCm(w);
  const heightCm = parseCm(h);
  return widthCm && heightCm ? { widthCm, heightCm } : null;
}

/** Paper print format ("A4", "other" + custom cm, or stored "other:21x30"). */
export function paperPrintSizeCm(paperType: string | null | undefined, customW?: string, customH?: string): PrintSizeCm | null {
  if (!paperType) return null;
  const stored = /^other:([\d.,]+)x([\d.,]+)$/.exec(paperType);
  if (stored) return sizeFromStrings(stored[1], stored[2]);
  if (paperType === "other") return sizeFromStrings(customW, customH);
  return A_SERIES_CM[paperType] ?? null;
}
