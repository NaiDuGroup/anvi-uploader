import { normalizeLineName } from "./normalizeLineName";
import {
  StockTargetKind,
  type PostableStockTargetKind,
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

/**
 * Best guess for «our units per one invoice unit» from the supplier's line name:
 * roll length for media, sheets per pack for paper, millilitres per bottle for ink.
 * Returns 1 when nothing recognisable is found.
 */
export function suggestUnitsPerInvoiceUnit(
  kind: PostableStockTargetKind,
  name: string,
): number {
  const n: string = normalizeLineName(name);
  switch (kind) {
    case StockTargetKind.LfMaterial:
      return parseRollDimensions(n)?.lengthMeters ?? 1;
    case StockTargetKind.SheetPaper: {
      const m = n.match(/(\d+)\s*(?:coli|foi|sheets|листов|лист|sh)\b/);
      return m ? Number.parseInt(m[1]!, 10) : 1;
    }
    case StockTargetKind.Ink: {
      const ml = n.match(/(\d+(?:[.,]\d+)?)\s*(?:ml|мл)\b/);
      if (ml) return toNumber(ml[1]!);
      const l = n.match(/(\d+(?:[.,]\d+)?)\s*(?:l|л|litr\w*)\b/);
      return l ? toNumber(l[1]!) * 1000 : 1;
    }
    default:
      return 1;
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
