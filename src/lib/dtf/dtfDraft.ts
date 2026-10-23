import { buildDtfLineData } from "@/lib/dtf/buildDtfLineData";
import type { DtfGarmentSource, DtfPlacement } from "@/lib/dtf/dtfConstants";
import type { DtfCatalogJson, GarmentProductJson } from "@/lib/dtf/dtfDto";
import { isDtfErrorCode, type DtfErrorCode } from "@/lib/dtf/dtfErrors";
import { DtfLineError } from "@/lib/dtf/dtfLineCalc";
import { dtfLineInputSchema, type DtfLineInput } from "@/lib/dtf/dtfLineInput";
import type { DtfCustomerType, DtfLineData } from "@/lib/dtf/types";

/** Editable (string-typed) state of one DTF zone in the order wizard. */
export interface DtfZoneDraft {
  id: string;
  placement: DtfPlacement;
  /** Null = custom size typed into `widthStr` / `heightStr`. */
  presetId: string | null;
  widthStr: string;
  heightStr: string;
}

export interface DtfSizeDraft {
  size: string;
  quantityStr: string;
}

/** Editable state of one DTF order line. */
export interface DtfDraft {
  garmentSource: DtfGarmentSource;
  garmentProductId: string | null;
  sizes: DtfSizeDraft[];
  zones: DtfZoneDraft[];
}

export type DtfQuote =
  | { ok: true; data: DtfLineData }
  | { ok: false; code: DtfErrorCode | "dtf_incomplete" };

const CLIENT_GARMENT_SIZE = "—";

let zoneSeq = 0;
export function newDtfZoneId(): string {
  zoneSeq += 1;
  return `z${Date.now().toString(36)}${zoneSeq}`;
}

/** Price-list entry matching the print already included in a garment price (A4). */
export function defaultDtfPresetId(catalog: DtfCatalogJson): string | null {
  const included = catalog.presets.find(
    (p) => p.retailPrice === catalog.settings.includedPrintCreditMdl,
  );
  return included?.id ?? catalog.presets[0]?.id ?? null;
}

function sizesForGarment(
  garment: GarmentProductJson | undefined,
  keep: readonly DtfSizeDraft[] = [],
): DtfSizeDraft[] {
  if (!garment) return [{ size: CLIENT_GARMENT_SIZE, quantityStr: "1" }];
  const typed = new Map(keep.map((s) => [s.size.toUpperCase(), s.quantityStr]));
  return garment.variants.map((v) => ({
    size: v.size,
    quantityStr: typed.get(v.size.toUpperCase()) ?? "",
  }));
}

export function emptyDtfDraft(catalog: DtfCatalogJson): DtfDraft {
  const garment: GarmentProductJson | undefined = catalog.garments[0];
  return {
    garmentSource: garment ? "stock" : "client",
    garmentProductId: garment?.id ?? null,
    sizes: sizesForGarment(garment),
    zones: [
      {
        id: newDtfZoneId(),
        placement: "front",
        presetId: defaultDtfPresetId(catalog),
        widthStr: "",
        heightStr: "",
      },
    ],
  };
}

/** Switch garment (or source) keeping quantities typed for sizes that still exist. */
export function withDtfGarment(
  draft: DtfDraft,
  catalog: DtfCatalogJson,
  source: DtfGarmentSource,
  garmentProductId: string | null,
): DtfDraft {
  if (source === "client") {
    const total: number = dtfDraftTotalPieces(draft);
    return {
      ...draft,
      garmentSource: "client",
      garmentProductId: null,
      sizes: [{ size: CLIENT_GARMENT_SIZE, quantityStr: total > 0 ? String(total) : "1" }],
    };
  }
  const garment = catalog.garments.find((g) => g.id === garmentProductId) ?? catalog.garments[0];
  return {
    ...draft,
    garmentSource: "stock",
    garmentProductId: garment?.id ?? null,
    sizes: sizesForGarment(garment, draft.garmentSource === "stock" ? draft.sizes : []),
  };
}

function parsePositiveInt(value: string): number {
  const n: number = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseCm(value: string): number | undefined {
  const n: number = Number.parseFloat(value.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function dtfDraftTotalPieces(draft: DtfDraft): number {
  return draft.sizes.reduce((sum, s) => sum + parsePositiveInt(s.quantityStr), 0);
}

/** API input for the draft, or null while required fields are missing. */
export function dtfDraftToInput(draft: DtfDraft): DtfLineInput | null {
  const candidate = {
    garmentSource: draft.garmentSource,
    garmentProductId: draft.garmentProductId ?? undefined,
    sizes: draft.sizes
      .map((s) => ({ size: s.size, quantity: parsePositiveInt(s.quantityStr) }))
      .filter((s) => s.quantity > 0),
    zones: draft.zones.map((z) => ({
      id: z.id,
      placement: z.placement,
      presetId: z.presetId,
      widthCm: z.presetId ? undefined : parseCm(z.widthStr),
      heightCm: z.presetId ? undefined : parseCm(z.heightStr),
    })),
  };
  const parsed = dtfLineInputSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Same price the server will charge, computed from the wizard catalog. */
export function quoteDtfDraft(
  draft: DtfDraft,
  customerType: DtfCustomerType,
  catalog: DtfCatalogJson,
): DtfQuote {
  const input: DtfLineInput | null = dtfDraftToInput(draft);
  if (!input) return { ok: false, code: "dtf_incomplete" };
  const garment = catalog.garments.find((g) => g.id === input.garmentProductId) ?? null;
  try {
    return {
      ok: true,
      data: buildDtfLineData(input, customerType, {
        garment,
        presets: catalog.presets,
        settings: catalog.settings,
        unitCosts: catalog.unitCosts,
      }),
    };
  } catch (e) {
    if (e instanceof DtfLineError && isDtfErrorCode(e.code)) return { ok: false, code: e.code };
    throw e;
  }
}

/** Editor state for a saved line (edit mode). */
export function dtfDraftFromLineData(data: DtfLineData, catalog: DtfCatalogJson): DtfDraft {
  const zones: DtfZoneDraft[] = data.zones.map((z) => ({
    id: z.id,
    placement: z.placement,
    presetId: z.customSize ? null : z.presetId,
    widthStr: z.customSize ? String(z.widthCm) : "",
    heightStr: z.customSize ? String(z.heightCm) : "",
  }));
  if (data.garmentSource === "client" || !data.garment) {
    return {
      garmentSource: "client",
      garmentProductId: null,
      sizes: data.sizes.map((s) => ({ size: s.size, quantityStr: String(s.quantity) })),
      zones,
    };
  }
  const garment = catalog.garments.find((g) => g.id === data.garment?.garmentProductId);
  const saved: DtfSizeDraft[] = data.sizes.map((s) => ({ size: s.size, quantityStr: String(s.quantity) }));
  return {
    garmentSource: "stock",
    garmentProductId: data.garment.garmentProductId,
    sizes: garment ? sizesForGarment(garment, saved) : saved,
    zones,
  };
}
