import { z } from "zod";

/**
 * Banner finishing (отделка баннера): hem welding / gluing (проклейка),
 * pockets for a pipe or a rope (карманы) and eyelets (люверсы). Pure and
 * client-safe: the order resolver, the storefront quote, the product page
 * preview and the staff texts all count from here.
 *
 * Prices are owner decisions of 2026-11-05: hem 15 lei and pocket 25 lei per
 * running metre; an eyelet 3,5 lei (price list «люверс 3,5»). Eyelets go at
 * most `spacingCm` apart (30–50 cm, the customer's choice) along the chosen
 * edges, always one in each corner of those edges, or only in the four
 * corners. Prices are per piece and the line total is in whole lei.
 */

export const LF_EDGES = ["top", "bottom", "left", "right"] as const;
export type LfEdge = (typeof LF_EDGES)[number];

/** Hem (проклейка края), lei per running metre. */
export const LF_HEM_PER_METER_MDL = 15;
/** Pocket (карман), lei per running metre of pocket. */
export const LF_POCKET_PER_METER_MDL = 25;
/** One eyelet (люверс), lei — price list. */
export const LF_EYELET_MDL = 3.5;
/** Purchase cost of one 10 mm ring (TEX-PLAST 0,35 lei without VAT → with VAT), for the margin only. */
export const LF_EYELET_COST_MDL = 0.42;

export const LF_EYELET_SPACING_MIN_CM = 30;
export const LF_EYELET_SPACING_MAX_CM = 50;
export const LF_EYELET_SPACING_DEFAULT_CM = 50;
/** Eyelet centre from the banner edge (drawn on the preview; the count is measured between corner eyelets). */
export const LF_EYELET_INSET_CM = 3;

const edgesSchema = z
  .array(z.enum(LF_EDGES))
  .min(1)
  .max(4)
  .refine((a) => new Set(a).size === a.length, { message: "lf_finishing_edges_duplicate" });

export const lfEyeletsInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("corners") }).strict(),
  z
    .object({
      mode: z.literal("spacing"),
      spacingCm: z.number().int().min(LF_EYELET_SPACING_MIN_CM).max(LF_EYELET_SPACING_MAX_CM),
      /** Edges with eyelets; omitted = all four. */
      edges: edgesSchema.optional(),
    })
    .strict(),
]);

export const lfFinishingInputSchema = z
  .object({
    /** Hem welding / gluing on every edge without a pocket. */
    hem: z.boolean().optional(),
    /** Edges with a pocket. */
    pockets: edgesSchema.optional(),
    eyelets: lfEyeletsInputSchema.optional(),
  })
  .strict();

export type LfEyeletsInput = z.infer<typeof lfEyeletsInputSchema>;
export type LfFinishingInput = z.infer<typeof lfFinishingInputSchema>;

/** Finishing as frozen on the order line (`LargeFormatLineData.finishing`). */
export interface LfFinishingData {
  /** What was ordered: re-resolved as is when staff edit the order. */
  input: LfFinishingInput;
  hem?: { edges: LfEdge[]; metersPerPiece: number; ratePerMeterMdl: number; totalMdl: number };
  pockets?: { edges: LfEdge[]; metersPerPiece: number; ratePerMeterMdl: number; totalMdl: number };
  eyelets?: {
    mode: "corners" | "spacing";
    spacingCm?: number;
    edges: LfEdge[];
    countPerPiece: number;
    unitPriceMdl: number;
    totalMdl: number;
  };
  /** Sum of the parts for the whole line (all pieces), whole lei. */
  totalMdl: number;
  /** Purchase cost of the rings (margin only), whole lei. */
  costMdl: number;
}

/** Nothing ordered (no hem, no pocket, no eyelet). */
export function isEmptyLfFinishing(input: LfFinishingInput | null | undefined): boolean {
  return !input || (!input.hem && !input.pockets?.length && !input.eyelets);
}

function edgeLengthCm(edge: LfEdge, widthCm: number, heightCm: number): number {
  return edge === "top" || edge === "bottom" ? widthCm : heightCm;
}

function sortEdges(edges: readonly LfEdge[]): LfEdge[] {
  return LF_EDGES.filter((e) => edges.includes(e));
}

export interface LfEyeletPoint {
  /** From the left edge, cm. */
  xCm: number;
  /** From the top edge, cm. */
  yCm: number;
}

/**
 * Eyelet centres on one W×H piece (cm from the top-left corner), each once.
 * Along an edge the eyelets are evenly spread between its corner eyelets, at
 * most `spacingCm` apart.
 */
export function lfEyeletPositions(eyelets: LfEyeletsInput, widthCm: number, heightCm: number): LfEyeletPoint[] {
  const i = Math.min(LF_EYELET_INSET_CM, widthCm / 4, heightCm / 4);
  const left = i;
  const right = widthCm - i;
  const top = i;
  const bottom = heightCm - i;
  const corners: LfEyeletPoint[] = [
    { xCm: left, yCm: top },
    { xCm: right, yCm: top },
    { xCm: left, yCm: bottom },
    { xCm: right, yCm: bottom },
  ];
  if (eyelets.mode === "corners") return corners;
  const edges: LfEdge[] = eyelets.spacingCm > 0 ? sortEdges(eyelets.edges ?? LF_EDGES) : [];
  const out = new Map<string, LfEyeletPoint>();
  const add = (p: LfEyeletPoint) => out.set(`${p.xCm.toFixed(3)}:${p.yCm.toFixed(3)}`, p);
  for (const edge of edges) {
    const horizontal: boolean = edge === "top" || edge === "bottom";
    const from: number = horizontal ? left : top;
    const to: number = horizontal ? right : bottom;
    const span: number = Math.max(0, to - from);
    const intervals: number = Math.max(1, Math.ceil(span / eyelets.spacingCm - 1e-9));
    for (let k = 0; k <= intervals; k++) {
      const along: number = from + (span * k) / intervals;
      if (horizontal) add({ xCm: along, yCm: edge === "top" ? top : bottom });
      else add({ xCm: edge === "left" ? left : right, yCm: along });
    }
  }
  return [...out.values()];
}

/** Eyelets on one piece. */
export function lfEyeletCount(eyelets: LfEyeletsInput, widthCm: number, heightCm: number): number {
  return lfEyeletPositions(eyelets, widthCm, heightCm).length;
}

/** Hem edges: every edge that has no pocket. */
export function lfHemEdges(input: LfFinishingInput): LfEdge[] {
  if (!input.hem) return [];
  const pockets: LfEdge[] = input.pockets ?? [];
  return LF_EDGES.filter((e) => !pockets.includes(e));
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Finishing of a line of `quantity` W×H pieces (W, H = the visible size in cm),
 * or null when nothing is ordered.
 */
export function computeLfFinishing(
  input: LfFinishingInput | null | undefined,
  widthCm: number,
  heightCm: number,
  quantity: number,
): LfFinishingData | null {
  if (!input || isEmptyLfFinishing(input)) return null;
  const q: number = Math.max(1, Math.floor(quantity));
  const meters = (edges: readonly LfEdge[]): number =>
    round3(edges.reduce((s, e) => s + edgeLengthCm(e, widthCm, heightCm), 0) / 100);

  const out: LfFinishingData = { input, totalMdl: 0, costMdl: 0 };
  const hemEdges: LfEdge[] = lfHemEdges(input);
  if (hemEdges.length) {
    const m: number = meters(hemEdges);
    out.hem = {
      edges: hemEdges,
      metersPerPiece: m,
      ratePerMeterMdl: LF_HEM_PER_METER_MDL,
      totalMdl: Math.round(m * LF_HEM_PER_METER_MDL * q),
    };
  }
  if (input.pockets?.length) {
    const edges: LfEdge[] = sortEdges(input.pockets);
    const m: number = meters(edges);
    out.pockets = {
      edges,
      metersPerPiece: m,
      ratePerMeterMdl: LF_POCKET_PER_METER_MDL,
      totalMdl: Math.round(m * LF_POCKET_PER_METER_MDL * q),
    };
  }
  if (input.eyelets) {
    const count: number = lfEyeletCount(input.eyelets, widthCm, heightCm);
    out.eyelets = {
      mode: input.eyelets.mode,
      ...(input.eyelets.mode === "spacing" ? { spacingCm: input.eyelets.spacingCm } : {}),
      edges: input.eyelets.mode === "spacing" ? sortEdges(input.eyelets.edges ?? LF_EDGES) : [...LF_EDGES],
      countPerPiece: count,
      unitPriceMdl: LF_EYELET_MDL,
      totalMdl: Math.round(count * LF_EYELET_MDL * q),
    };
    out.costMdl = Math.round(count * LF_EYELET_COST_MDL * q);
  }
  out.totalMdl = (out.hem?.totalMdl ?? 0) + (out.pockets?.totalMdl ?? 0) + (out.eyelets?.totalMdl ?? 0);
  return out;
}

// ─── Staff texts (Russian, the studio language) ──────────────────────────────

const EDGE_RU: Record<LfEdge, string> = { top: "верх", bottom: "низ", left: "лево", right: "право" };

/** «верх, низ» / «по периметру». */
export function lfEdgesRu(edges: readonly LfEdge[]): string {
  return edges.length === 4 ? "по периметру" : sortEdges(edges).map((e) => EDGE_RU[e]).join(", ");
}

function metersRu(m: number): string {
  return `${String(Math.round(m * 100) / 100).replace(".", ",")} м`;
}

/** Each finishing part in Russian for the order card, the workshop and the order notes. */
export function lfFinishingPartsRu(data: LfFinishingData): string[] {
  const parts: string[] = [];
  if (data.eyelets) {
    parts.push(
      data.eyelets.mode === "corners"
        ? `люверсы по углам (${data.eyelets.countPerPiece} шт.)`
        : `люверсы шаг ≤${data.eyelets.spacingCm} см ${lfEdgesRu(data.eyelets.edges)} (${data.eyelets.countPerPiece} шт.)`,
    );
  }
  if (data.hem) {
    parts.push(
      `проклейка ${data.hem.edges.length === 4 ? "по периметру" : lfEdgesRu(data.hem.edges)} (${metersRu(data.hem.metersPerPiece)})`,
    );
  }
  if (data.pockets) parts.push(`карманы: ${lfEdgesRu(data.pockets.edges)} (${metersRu(data.pockets.metersPerPiece)})`);
  return parts;
}

/** «люверсы шаг ≤50 см по периметру (12 шт.), проклейка по периметру (6 м)» — counts per piece. */
export function lfFinishingSummaryRu(data: LfFinishingData | null | undefined): string {
  return data ? lfFinishingPartsRu(data).join(", ") : "";
}
