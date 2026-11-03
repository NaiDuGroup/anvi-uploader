import { buildDtfLineData } from "@/lib/dtf/buildDtfLineData";
import type { DtfGarmentSource, DtfPlacement } from "@/lib/dtf/dtfConstants";
import type { DtfCatalogJson, DtfGarmentJson } from "@/lib/dtf/dtfDto";
import { isDtfErrorCode, type DtfErrorCode } from "@/lib/dtf/dtfErrors";
import { DtfLineError, dtfPrintFitsItem, type DtfPresetOption } from "@/lib/dtf/dtfLineCalc";
import { dtfLineInputSchema, type DtfLineInput } from "@/lib/dtf/dtfLineInput";
import { dtfGarmentTakesShirtZones, nextDtfPlacement } from "@/lib/dtf/dtfZones";
import type { DtfCustomerType, DtfLineData } from "@/lib/dtf/types";

/** Editable (string-typed) state of one DTF zone in the order wizard. */
export interface DtfZoneDraft {
  id: string;
  placement: DtfPlacement;
  /** Where exactly, for an «other» zone («левая штанина»); optional. */
  placementNote?: string;
  /** Null = custom size typed into `widthStr` / `heightStr`. */
  presetId: string | null;
  widthStr: string;
  heightStr: string;
  /** Dealer takes the transfer unpressed (only formats with a no-press price). */
  noPress?: boolean;
  /** Format picked by hand (or saved): choosing a zone no longer suggests one. */
  presetManual?: boolean;
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
  /** Same key on several lines of the order = the same layout (run prices count them together). */
  layoutKey?: string;
  /** Pieces of this layout across the order's lines; the wizard keeps it in sync. */
  layoutRunQuantity?: number;
}

export type DtfQuote =
  | { ok: true; data: DtfLineData }
  | { ok: false; code: DtfErrorCode | "dtf_incomplete" };

const CLIENT_GARMENT_SIZE = "—";

let layoutSeq = 0;
export function newDtfLayoutKey(): string {
  layoutSeq += 1;
  return `l${Date.now().toString(36)}${layoutSeq}`;
}

let zoneSeq = 0;
export function newDtfZoneId(): string {
  zoneSeq += 1;
  return `z${Date.now().toString(36)}${zoneSeq}`;
}

/** The usual front print: the A4 format (21×30), else the first one. */
export function defaultDtfPresetId(catalog: DtfCatalogJson): string | null {
  const a4 = catalog.presets.find(
    (p) => Math.min(p.widthCm, p.heightCm) === 21 && Math.max(p.widthCm, p.heightCm) === 30,
  );
  return a4?.id ?? catalog.presets[0]?.id ?? null;
}

/** Price list formats a garment takes (caps 5×9, socks 10×10); every format when no garment / no limit. */
export function dtfPresetsForGarment<P extends DtfPresetOption>(
  presets: readonly P[],
  garment: Pick<DtfGarmentJson, "maxPrint"> | null | undefined,
): P[] {
  return presets.filter((p) => dtfPrintFitsItem(p.widthCm, p.heightCm, garment?.maxPrint));
}

/**
 * Zones moved to the largest format the garment takes when theirs is too big
 * for it; with no format small enough (a cap: 5×9 under the 10×10 logo), a
 * custom size of the garment's largest print, priced as the format it fits.
 */
function fitZonesToGarment(
  zones: readonly DtfZoneDraft[],
  catalog: DtfCatalogJson,
  garment: DtfGarmentJson | undefined,
): DtfZoneDraft[] {
  const maxPrint = garment?.maxPrint;
  if (!garment || !maxPrint) return [...zones];
  const fitting = dtfPresetsForGarment(catalog.presets, garment);
  const largest = fitting.reduce<DtfPresetOption | null>(
    (best, p) => (best == null || p.widthCm * p.heightCm > best.widthCm * best.heightCm ? p : best),
    null,
  );
  return zones.map((z) => {
    const preset = z.presetId ? catalog.presets.find((p) => p.id === z.presetId) : undefined;
    const w: number = preset ? preset.widthCm : Number.parseFloat(z.widthStr.replace(",", ".")) || 0;
    const h: number = preset ? preset.heightCm : Number.parseFloat(z.heightStr.replace(",", ".")) || 0;
    if (dtfPrintFitsItem(w, h, maxPrint)) return z;
    if (largest) return { ...z, presetId: largest.id, widthStr: "", heightStr: "" };
    return {
      ...z,
      presetId: null,
      widthStr: String(maxPrint.widthCm),
      heightStr: String(maxPrint.heightCm),
    };
  });
}

/**
 * Zones moved between the T-shirt places and «other» when the garment changes
 * shape: a cap / socks / bag gets «other» (described by a note) instead of
 * T-shirt zones; back on a T-shirt (or the client's garment), an «other» zone
 * left without a note gets a T-shirt place again.
 */
function zonesForGarmentShape(
  zones: readonly DtfZoneDraft[],
  wasShirt: boolean,
  isShirt: boolean,
): DtfZoneDraft[] {
  if (wasShirt === isShirt) return [...zones];
  if (!isShirt) return zones.map((z) => (z.placement === "other" ? z : { ...z, placement: "other" }));
  const out: DtfZoneDraft[] = [];
  for (const z of zones) {
    const keep: boolean = z.placement !== "other" || (z.placementNote ?? "").trim() !== "";
    out.push(keep ? z : { ...z, placement: nextDtfPlacement(out.map((o) => o.placement)) });
  }
  return out;
}

function sizesForGarment(
  garment: DtfGarmentJson | undefined,
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
  const garment: DtfGarmentJson | undefined = catalog.garments[0];
  return {
    garmentSource: garment ? "stock" : "client",
    garmentProductId: garment?.id ?? null,
    sizes: sizesForGarment(garment),
    zones: fitZonesToGarment(
      [
        {
          id: newDtfZoneId(),
          placement: dtfGarmentTakesShirtZones(garment) ? "front_mid" : "other",
          presetId: defaultDtfPresetId(catalog),
          widthStr: "",
          heightStr: "",
        },
      ],
      catalog,
      garment,
    ),
  };
}

/** Switch garment (or source) keeping quantities typed for sizes that still exist. */
export function withDtfGarment(
  draft: DtfDraft,
  catalog: DtfCatalogJson,
  source: DtfGarmentSource,
  garmentProductId: string | null,
): DtfDraft {
  const previous: DtfGarmentJson | undefined =
    draft.garmentSource === "stock" ? catalog.garments.find((g) => g.id === draft.garmentProductId) : undefined;
  const wasShirt: boolean = dtfGarmentTakesShirtZones(previous);
  if (source === "client") {
    const total: number = dtfDraftTotalPieces(draft);
    return {
      ...draft,
      garmentSource: "client",
      garmentProductId: null,
      sizes: [{ size: CLIENT_GARMENT_SIZE, quantityStr: total > 0 ? String(total) : "1" }],
      zones: zonesForGarmentShape(draft.zones, wasShirt, true),
    };
  }
  const garment = catalog.garments.find((g) => g.id === garmentProductId) ?? catalog.garments[0];
  const zones = zonesForGarmentShape(draft.zones, wasShirt, dtfGarmentTakesShirtZones(garment));
  return {
    ...draft,
    garmentSource: "stock",
    garmentProductId: garment?.id ?? null,
    sizes: sizesForGarment(garment, draft.garmentSource === "stock" ? draft.sizes : []),
    zones: fitZonesToGarment(zones, catalog, garment),
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
      ...(z.placement === "other" && z.placementNote?.trim() ? { placementNote: z.placementNote.trim() } : {}),
      presetId: z.presetId,
      widthCm: z.presetId ? undefined : parseCm(z.widthStr),
      heightCm: z.presetId ? undefined : parseCm(z.heightStr),
      ...(z.noPress ? { noPress: true } : {}),
    })),
    ...(draft.layoutKey ? { layoutKey: draft.layoutKey } : {}),
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
      data: buildDtfLineData(
        input,
        customerType,
        { garment, presets: catalog.presets, settings: catalog.settings, unitCosts: catalog.unitCosts },
        draft.layoutRunQuantity,
      ),
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
    ...(z.placementNote ? { placementNote: z.placementNote } : {}),
    presetId: z.customSize ? null : z.presetId,
    widthStr: z.customSize ? String(z.widthCm) : "",
    heightStr: z.customSize ? String(z.heightCm) : "",
    ...(z.noPress ? { noPress: true } : {}),
    presetManual: true,
  }));
  if (data.garmentSource === "client" || !data.garment) {
    return {
      garmentSource: "client",
      garmentProductId: null,
      sizes: data.sizes.map((s) => ({ size: s.size, quantityStr: String(s.quantity) })),
      zones,
      ...(data.layoutKey ? { layoutKey: data.layoutKey } : {}),
    };
  }
  const garment = catalog.garments.find((g) => g.id === data.garment?.garmentProductId);
  const saved: DtfSizeDraft[] = data.sizes.map((s) => ({ size: s.size, quantityStr: String(s.quantity) }));
  return {
    garmentSource: "stock",
    garmentProductId: data.garment.garmentProductId,
    sizes: garment ? sizesForGarment(garment, saved) : saved,
    zones,
    ...(data.layoutKey ? { layoutKey: data.layoutKey } : {}),
  };
}

/** Pieces of each layout across the order's DTF drafts, by `layoutKey`. */
export function dtfDraftLayoutRuns(drafts: readonly (DtfDraft | null | undefined)[]): Map<string, number> {
  const byKey = new Map<string, number>();
  for (const d of drafts) {
    if (!d?.layoutKey) continue;
    byKey.set(d.layoutKey, (byKey.get(d.layoutKey) ?? 0) + dtfDraftTotalPieces(d));
  }
  return byKey;
}
