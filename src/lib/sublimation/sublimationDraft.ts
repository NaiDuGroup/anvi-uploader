import { buildSublimationLineData } from "@/lib/sublimation/buildSublimationLineData";
import type { SublimationCatalogJson } from "@/lib/sublimation/dto";
import { sublimationLineSource } from "@/lib/sublimation/parseSublimationLineData";
import type { SublimationItemSource } from "@/lib/sublimation/sublimationConstants";
import { isSublimationErrorCode, type SublimationErrorCode } from "@/lib/sublimation/sublimationErrors";
import { SublimationLineError } from "@/lib/sublimation/sublimationLineCalc";
import { sublimationLineInputSchema, type SublimationLineInput } from "@/lib/sublimation/sublimationLineInput";
import type { SublimationCustomerType, SublimationLineData } from "@/lib/sublimation/types";

/** Editable state of one sublimation order line. */
export interface SublimationDraft {
  source: SublimationItemSource;
  /** Stock blank (stock source). */
  variantId: string | null;
  /** Client item (client source): what it is, a note, print size in cm as typed. */
  description: string;
  notes: string;
  widthStr: string;
  heightStr: string;
  quantityStr: string;
}

export type SublimationQuote =
  | { ok: true; data: SublimationLineData }
  | { ok: false; code: SublimationErrorCode | "subl_incomplete" };

/** A stock line on the first blank of the catalog. */
export function emptySublimationDraft(catalog: SublimationCatalogJson): SublimationDraft {
  return {
    source: "stock",
    variantId: catalog.items[0]?.id ?? null,
    description: "",
    notes: "",
    widthStr: "",
    heightStr: "",
    quantityStr: "1",
  };
}

/**
 * Switch between a stock blank and the client's item; everything typed stays.
 * Switching to stock keeps the picked blank, else takes the first one.
 */
export function withSublimationSource(
  draft: SublimationDraft,
  catalog: SublimationCatalogJson,
  source: SublimationItemSource,
): SublimationDraft {
  if (source === "client") return { ...draft, source: "client" };
  const keep: boolean = draft.variantId != null && catalog.items.some((i) => i.id === draft.variantId);
  return { ...draft, source: "stock", variantId: keep ? draft.variantId : (catalog.items[0]?.id ?? null) };
}

function parseCm(value: string): number | undefined {
  const n: number = Number.parseFloat(value.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function cmText(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function sublimationDraftQuantity(draft: SublimationDraft): number {
  const n: number = Number.parseInt(draft.quantityStr.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** API input for the draft, or null while required fields are missing (a client item needs its description). */
export function sublimationDraftToInput(draft: SublimationDraft): SublimationLineInput | null {
  const isClient: boolean = draft.source === "client";
  const description: string = draft.description.trim();
  const notes: string = draft.notes.trim();
  const parsed = sublimationLineInputSchema.safeParse({
    source: draft.source,
    variantId: isClient ? undefined : (draft.variantId ?? undefined),
    clientItem:
      isClient && description
        ? {
            description,
            notes: notes || undefined,
            widthCm: parseCm(draft.widthStr),
            heightCm: parseCm(draft.heightStr),
          }
        : undefined,
    quantity: sublimationDraftQuantity(draft),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Same price the server will charge, computed from the wizard catalog. A client
 * item is priced before it is described (the description does not change the
 * price); {@link sublimationDraftToInput} still requires it to save the line.
 */
export function quoteSublimationDraft(
  draft: SublimationDraft,
  customerType: SublimationCustomerType,
  catalog: SublimationCatalogJson,
): SublimationQuote {
  const priced: SublimationDraft =
    draft.source === "client" && !draft.description.trim() ? { ...draft, description: "—" } : draft;
  const input: SublimationLineInput | null = sublimationDraftToInput(priced);
  if (!input) return { ok: false, code: "subl_incomplete" };
  const item = input.source === "client" ? null : (catalog.items.find((i) => i.id === input.variantId) ?? null);
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

/** Editor state for a saved line (edit mode); stock and client lines round-trip. */
export function sublimationDraftFromLineData(data: SublimationLineData): SublimationDraft {
  const c = data.clientItem ?? null;
  return {
    source: sublimationLineSource(data),
    variantId: data.item?.variantId ?? null,
    description: c?.description ?? "",
    notes: c?.notes ?? "",
    widthStr: c ? cmText(c.widthCm) : "",
    heightStr: c ? cmText(c.heightCm) : "",
    quantityStr: String(data.quantity),
  };
}
