import { parseDecimal } from "@/lib/dtf/dtfClientApi";
import {
  sublimationNormFor,
  sublimationNormSchema,
  sublimationSettingsSchema,
  type SublimationNorm,
  type SublimationSettings,
} from "@/lib/printMethods/sublimationSettings";

/** Editable (string) state of the «Сублимация: нормы расхода» table. */
export interface SublimationNormsDraft {
  wastePct: string;
  /** By category code. */
  norms: Record<string, { paperSheets: string; tapeCm: string; inkMl: string }>;
}

const NORM_KEYS = ["paperSheets", "tapeCm", "inkMl"] as const;
export type SublimationNormKey = (typeof NORM_KEYS)[number];

/** One row per listed category; categories without a stored norm start at 0. */
export function sublimationNormsDraft(
  settings: SublimationSettings,
  categoryCodes: readonly string[],
): SublimationNormsDraft {
  return {
    wastePct: String(settings.wastePct),
    norms: Object.fromEntries(
      categoryCodes.map((code) => {
        const n: SublimationNorm = sublimationNormFor(settings, code);
        return [code, { paperSheets: String(n.paperSheets), tapeCm: String(n.tapeCm), inkMl: String(n.inkMl) }];
      }),
    ),
  };
}

export type SublimationNormsParse =
  | { ok: true; patch: Pick<SublimationSettings, "wastePct" | "norms"> }
  | { ok: false; field: "wastePct" | { categoryCode: string; key: SublimationNormKey } };

/**
 * Settings patch for the table: the waste and every listed category's norm
 * (empty cell = 0). Fails on the first invalid cell.
 */
export function parseSublimationNormsDraft(draft: SublimationNormsDraft): SublimationNormsParse {
  const waste: number | null = draft.wastePct.trim() === "" ? 0 : parseDecimal(draft.wastePct);
  if (waste == null || !sublimationSettingsSchema.shape.wastePct.safeParse(waste).success) {
    return { ok: false, field: "wastePct" };
  }
  const norms: Record<string, SublimationNorm> = {};
  for (const [categoryCode, row] of Object.entries(draft.norms)) {
    const norm: SublimationNorm = { paperSheets: 0, tapeCm: 0, inkMl: 0 };
    for (const key of NORM_KEYS) {
      const raw: string = row[key];
      const n: number | null = raw.trim() === "" ? 0 : parseDecimal(raw);
      if (n == null || !sublimationNormSchema.shape[key].safeParse(n).success) {
        return { ok: false, field: { categoryCode, key } };
      }
      norm[key] = n;
    }
    norms[categoryCode] = norm;
  }
  return { ok: true, patch: { wastePct: waste, norms } };
}
