import { normalizeLineName } from "./normalizeLineName";
import {
  StockTargetKind,
  type LegacyPostableStockTargetKind,
  type PostableStockTargetKind,
  type PurchaseStockUnit,
  type StockTargetOption,
} from "./types";

export type RollDimensions = { widthMeters: number; lengthMeters: number };

function toNumber(raw: string): number {
  return Number.parseFloat(raw.replace(",", "."));
}

/** «1.07x30m», «1,27 * 50 m», «0.61×100m» → width / length in meters. */
export function parseRollDimensions(name: string): RollDimensions | null {
  const m = normalizeLineName(name).match(
    // «30mx3"» (core size suffix) is common, so allow «x» right after «m» but not «mm».
    /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*m(?![a-wyz])/,
  );
  if (!m) return null;
  const widthMeters: number = toNumber(m[1]!);
  const lengthMeters: number = toNumber(m[2]!);
  if (!(widthMeters > 0 && widthMeters < 6) || !(lengthMeters > 0)) return null;
  return { widthMeters, lengthMeters };
}

export enum InvoiceUnitKind {
  Area = "area",
  Length = "length",
  Volume = "volume",
  Pack = "pack",
  Piece = "piece",
}

/** Classifies the free-text unit of an e-Factura line («M2», «m», «set», «buc», «шт»…). */
export function classifyInvoiceUnit(unit: string | null): InvoiceUnitKind {
  const u: string = (unit ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (/^(m2|m²|mp|mtk|кв\.?\s*м|м2|м²)$/.test(u)) return InvoiceUnitKind.Area;
  if (/^(m|ml|mtr|м|пм|п\.м)$/.test(u)) return InvoiceUnitKind.Length;
  if (/^(l|ltr|litru|л)$/.test(u)) return InvoiceUnitKind.Volume;
  if (/^(set|pac|pachet|pack|уп|упак|набор)$/.test(u)) return InvoiceUnitKind.Pack;
  return InvoiceUnitKind.Piece;
}

const FACTOR_DECIMALS = 10_000;

/** «set 12 buc», «100pcs», «10 шт» → 12 / 100 / 10. */
function packCount(normalizedName: string): number | null {
  const m = normalizedName.match(/(\d+)\s*(?:buc|pcs|шт)\b/);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

/** Legacy kind whose factor rules fit a unified category counted in this unit. */
const FACTOR_RULES_BY_UNIT: Record<Exclude<PurchaseStockUnit, "g">, LegacyPostableStockTargetKind> = {
  pcs: StockTargetKind.Mug,
  lm: StockTargetKind.LfMaterial,
  sheets: StockTargetKind.SheetPaper,
  ml: StockTargetKind.Ink,
};

/** Grams per invoice unit; unlike DTF powder there is no «1 kg bag» default. */
function gramsPerInvoiceUnit(n: string, invoiceUnit: string | null): number {
  if (/^(kg|кг)$/.test((invoiceUnit ?? "").trim().toLowerCase())) return 1000;
  const kg = n.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|кг)\b/);
  if (kg) return toNumber(kg[1]!) * 1000;
  const g = n.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|г)\b/);
  return g ? toNumber(g[1]!) : 1;
}

/**
 * Best guess for «our units per one invoice unit» from the supplier's line name
 * and unit: roll length (or 1/width when billed per m²) for media, sheets per
 * pack for paper, millilitres per bottle for ink, pieces per set for goods.
 * Returns 1 when nothing recognisable is found.
 */
export function suggestUnitsPerInvoiceUnit(
  kind: PostableStockTargetKind,
  name: string,
  invoiceUnit: string | null,
  /** Category unit of a unified variant (ignored for legacy kinds). */
  stockUnit: PurchaseStockUnit = "pcs",
): number {
  const n: string = normalizeLineName(name);
  if (kind === StockTargetKind.StockVariant) {
    return stockUnit === "g"
      ? gramsPerInvoiceUnit(n, invoiceUnit)
      : suggestUnitsPerInvoiceUnit(FACTOR_RULES_BY_UNIT[stockUnit], name, invoiceUnit);
  }
  const unitKind: InvoiceUnitKind = classifyInvoiceUnit(invoiceUnit);
  switch (kind) {
    case StockTargetKind.LfMaterial: {
      if (unitKind === InvoiceUnitKind.Length) return 1;
      const roll: RollDimensions | null = parseRollDimensions(n);
      if (!roll) return 1;
      return unitKind === InvoiceUnitKind.Area
        ? Math.round(FACTOR_DECIMALS / roll.widthMeters) / FACTOR_DECIMALS
        : roll.lengthMeters;
    }
    case StockTargetKind.SheetPaper: {
      const m = n.match(/(\d+)\s*(?:coli|foi|sheets|листов|лист|sh)\b/);
      return m ? Number.parseInt(m[1]!, 10) : (packCount(n) ?? 1);
    }
    case StockTargetKind.Ink: {
      if (unitKind === InvoiceUnitKind.Volume) return 1000;
      const ml = n.match(/(\d+(?:[.,]\d+)?)\s*(?:ml|мл)\b/);
      if (ml) return toNumber(ml[1]!);
      const l = n.match(/(\d+(?:[.,]\d+)?)\s*(?:l|л|litr\w*)\b/);
      return l ? toNumber(l[1]!) * 1000 : 1;
    }
    case StockTargetKind.DtfFilm: {
      if (unitKind === InvoiceUnitKind.Length) return 1;
      const roll: RollDimensions | null = parseRollDimensions(n);
      if (roll) return roll.lengthMeters;
      const length = n.match(/[x×*]\s*(\d+(?:[.,]\d+)?)\s*m(?![a-wyz])/);
      return length ? toNumber(length[1]!) : 1;
    }
    case StockTargetKind.DtfPowder: {
      if (/^(kg|кг)$/.test((invoiceUnit ?? "").trim().toLowerCase())) return 1000;
      const kg = n.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|кг)\b/);
      if (kg) return toNumber(kg[1]!) * 1000;
      const g = n.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|г)\b/);
      return g ? toNumber(g[1]!) : 1000;
    }
    case StockTargetKind.Mug:
    case StockTargetKind.Notebook:
    case StockTargetKind.Pen:
    case StockTargetKind.Garment:
      return unitKind === InvoiceUnitKind.Pack ? (packCount(n) ?? 1) : 1;
  }
}

function tokens(text: string): Set<string> {
  return new Set(
    normalizeLineName(text)
      .split(/[^\p{L}\p{N}.]+/u)
      .map((t) => t.replace(/^\.+|\.+$/g, ""))
      .filter((t) => t.length >= 2),
  );
}

/** Loose stem match so «matt» ~ «matte», «gloss» ~ «glossy». */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const min: number = Math.min(a.length, b.length);
  return min >= 4 && (a.startsWith(b) || b.startsWith(a));
}

export type ScoredTarget = StockTargetOption & { score: number };

/**
 * Deterministic ranking of stock items for an unmapped invoice line:
 * token overlap plus a strong bonus when the roll width matches.
 */
export function rankStockTargets(
  lineName: string,
  options: readonly StockTargetOption[],
  limit = 5,
): ScoredTarget[] {
  const lineTokens: string[] = [...tokens(lineName)];
  const roll: RollDimensions | null = parseRollDimensions(lineName);

  const scored: ScoredTarget[] = options.map((o) => {
    const optTokens: string[] = [...tokens(o.name)];
    const shared: number = lineTokens.filter((t) =>
      optTokens.some((u) => tokensMatch(t, u)),
    ).length;
    const overlap: number =
      lineTokens.length + optTokens.length === 0
        ? 0
        : (2 * shared) / (lineTokens.length + optTokens.length);
    const widthBonus: number =
      roll && o.widthMeters != null && Math.abs(o.widthMeters - roll.widthMeters) < 0.006
        ? 0.5
        : 0;
    return { ...o, score: Math.round((overlap + widthBonus) * 1000) / 1000 };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
