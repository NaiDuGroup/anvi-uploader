import { buildSublimationLineData } from "@/lib/sublimation/buildSublimationLineData";
import type { SublimationCatalogJson } from "@/lib/sublimation/dto";
import { isSublimationErrorCode, type SublimationErrorCode } from "@/lib/sublimation/sublimationErrors";
import { SublimationLineError } from "@/lib/sublimation/sublimationLineCalc";
import { sublimationLineInputSchema, type SublimationLineInput } from "@/lib/sublimation/sublimationLineInput";
import type { SublimationCustomerType, SublimationLineData } from "@/lib/sublimation/types";

/** Editable state of one sublimation order line. */
export interface SublimationDraft {
  variantId: string | null;
  quantityStr: string;
}

export type SublimationQuote =
  | { ok: true; data: SublimationLineData }
  | { ok: false; code: SublimationErrorCode | "subl_incomplete" };

export function emptySublimationDraft(catalog: SublimationCatalogJson): SublimationDraft {
  return { variantId: catalog.items[0]?.id ?? null, quantityStr: "1" };
}

export function sublimationDraftQuantity(draft: SublimationDraft): number {
  const n: number = Number.parseInt(draft.quantityStr.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** API input for the draft, or null while required fields are missing. */
export function sublimationDraftToInput(draft: SublimationDraft): SublimationLineInput | null {
  const parsed = sublimationLineInputSchema.safeParse({
    variantId: draft.variantId ?? undefined,
    quantity: sublimationDraftQuantity(draft),
  });
  return parsed.success ? parsed.data : null;
}

/** Same price the server will charge, computed from the wizard catalog. */
export function quoteSublimationDraft(
  draft: SublimationDraft,
  customerType: SublimationCustomerType,
  catalog: SublimationCatalogJson,
): SublimationQuote {
  const input: SublimationLineInput | null = sublimationDraftToInput(draft);
  if (!input) return { ok: false, code: "subl_incomplete" };
  const item = catalog.items.find((i) => i.id === input.variantId) ?? null;
  try {
    return {
      ok: true,
      data: buildSublimationLineData(input, customerType, {
        item,
        settings: catalog.settings,
        consumableCosts: catalog.consumableCosts,
      }),
    };
  } catch (e) {
    if (e instanceof SublimationLineError && isSublimationErrorCode(e.code)) return { ok: false, code: e.code };
    throw e;
  }
}

/** Editor state for a saved line (edit mode). */
export function sublimationDraftFromLineData(data: SublimationLineData): SublimationDraft {
  return { variantId: data.item.variantId, quantityStr: String(data.quantity) };
}
