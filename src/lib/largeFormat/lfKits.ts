/**
 * Roll-up and X-banner: a print on roll media sold together with its stand
 * (стойка, bought from TEX-PLAST) at one fixed price per set — owner
 * decision of 2026-11-05. Pure and client-safe.
 *
 * The line is an ordinary `large_format_print` line (the roll layout, the
 * metres and the ink are the workshop's as always); the kit replaces its sell
 * price and adds the stand: its cost to the margin and, when a stock item
 * with `standSku` exists, one stand per set taken from stock.
 */

export const LF_KIT_IDS = ["rollup_80x200", "rollup_100x200", "rollup_120x200", "xbanner_80x180"] as const;
export type LfKitId = (typeof LF_KIT_IDS)[number];

export interface LfKitConfig {
  id: LfKitId;
  kind: "rollup" | "xbanner";
  /** Visible size of the stand, cm. */
  widthCm: number;
  heightCm: number;
  /**
   * Printed size, cm. A roll-up hides the bottom of the banner in its cassette
   * (`hiddenBottomCm`), so the print is taller than the visible part.
   */
  printWidthCm: number;
  printHeightCm: number;
  /** Bottom part rolled into the cassette (not visible), cm. */
  hiddenBottomCm: number;
  /** Set price (stand + print), lei, VAT included. Dealers pay the same (no dealer price set). */
  priceMdl: number;
  /** Stock SKU of the stand; taken from stock only when such a variant exists. */
  standSku: string;
  /** Stand purchase cost with VAT (TEX-PLAST invoices), lei — margin only. */
  standCostMdl: number;
  /** Roll media the print goes on: material name pattern (narrowest roll that fits wins). */
  materialPattern: RegExp;
  /** X-banner: an eyelet in each corner for the stand's hooks (included). */
  cornerEyelets: boolean;
}

/** Roll-up FF-330 media: «BANNER Roll Up MATT 1.07*30m», «Banner pentru Roll Up 1.27*30m Matt». */
const ROLLUP_MEDIA = /roll\s*up/i;
/** X-banner: frontlit «BANNER MATT 1.37*50m» (not the roll-up media). */
const BANNER_MEDIA = /^banner\s+matt\b/i;

/** Bottom of a roll-up banner that stays in the cassette (уточнить у поставщика стойки). */
export const LF_ROLLUP_HIDDEN_BOTTOM_CM = 10;

export const LF_KITS: Record<LfKitId, LfKitConfig> = {
  rollup_80x200: {
    id: "rollup_80x200",
    kind: "rollup",
    widthCm: 80,
    heightCm: 200,
    printWidthCm: 80,
    printHeightCm: 200 + LF_ROLLUP_HIDDEN_BOTTOM_CM,
    hiddenBottomCm: LF_ROLLUP_HIDDEN_BOTTOM_CM,
    priceMdl: 1100,
    standSku: "STAND-ROLLUP-80X200",
    standCostMdl: 450,
    materialPattern: ROLLUP_MEDIA,
    cornerEyelets: false,
  },
  rollup_100x200: {
    id: "rollup_100x200",
    kind: "rollup",
    widthCm: 100,
    heightCm: 200,
    printWidthCm: 100,
    printHeightCm: 200 + LF_ROLLUP_HIDDEN_BOTTOM_CM,
    hiddenBottomCm: LF_ROLLUP_HIDDEN_BOTTOM_CM,
    priceMdl: 1300,
    standSku: "STAND-ROLLUP-100X200",
    standCostMdl: 536,
    materialPattern: ROLLUP_MEDIA,
    cornerEyelets: false,
  },
  rollup_120x200: {
    id: "rollup_120x200",
    kind: "rollup",
    widthCm: 120,
    heightCm: 200,
    printWidthCm: 120,
    printHeightCm: 200 + LF_ROLLUP_HIDDEN_BOTTOM_CM,
    hiddenBottomCm: LF_ROLLUP_HIDDEN_BOTTOM_CM,
    priceMdl: 1600,
    standSku: "STAND-ROLLUP-120X200",
    standCostMdl: 725,
    materialPattern: ROLLUP_MEDIA,
    cornerEyelets: false,
  },
  xbanner_80x180: {
    id: "xbanner_80x180",
    kind: "xbanner",
    widthCm: 80,
    heightCm: 180,
    printWidthCm: 80,
    printHeightCm: 180,
    hiddenBottomCm: 0,
    priceMdl: 650,
    standSku: "STAND-XBANNER-80X180",
    standCostMdl: 228,
    materialPattern: BANNER_MEDIA,
    cornerEyelets: true,
  },
};

export const LF_STAND_SKUS: readonly string[] = LF_KIT_IDS.map((id) => LF_KITS[id].standSku);

export function isLfKitId(v: unknown): v is LfKitId {
  return typeof v === "string" && (LF_KIT_IDS as readonly string[]).includes(v);
}

/** The printed size matches the kit's (either orientation). */
export function lfKitSizeMatches(kit: LfKitConfig, widthCm: number, heightCm: number): boolean {
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
  return (
    (eq(widthCm, kit.printWidthCm) && eq(heightCm, kit.printHeightCm)) ||
    (eq(widthCm, kit.printHeightCm) && eq(heightCm, kit.printWidthCm))
  );
}

/** Frozen on the order line (`LargeFormatLineData.kit`). */
export interface LfKitSnapshot {
  id: LfKitId;
  kind: "rollup" | "xbanner";
  widthCm: number;
  heightCm: number;
  hiddenBottomCm: number;
  unitPriceMdl: number;
  standSku: string;
  standCostMdl: number;
  /** Sell price the print alone had by the formula (before the set price), whole lei. */
  printFormulaSellMdl: number;
  cornerEyelets: boolean;
}

/** «Roll-up 80×200 со стойкой» — staff (Russian). */
export function lfKitTitleRu(kit: Pick<LfKitSnapshot, "kind" | "widthCm" | "heightCm">): string {
  return `${kit.kind === "rollup" ? "Roll-up" : "X-banner"} ${kit.widthCm}×${kit.heightCm} со стойкой`;
}
