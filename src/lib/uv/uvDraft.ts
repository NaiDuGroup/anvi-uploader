import { buildUvLineData } from "@/lib/uv/buildUvLineData";
import { UV_DEFAULT_WHITE_LAYERS, type UvItemSource, type UvPlacement } from "@/lib/uv/uvConstants";
import type { UvCatalogJson } from "@/lib/uv/dto";
import { isUvErrorCode, type UvErrorCode } from "@/lib/uv/uvErrors";
import { UvLineError } from "@/lib/uv/uvLineCalc";
import { uvLineInputSchema, type UvLineInput } from "@/lib/uv/uvLineInput";
import type { UvCustomerType, UvLineData } from "@/lib/uv/types";

/** Editable (string-typed) state of one UV zone in the order wizard. */
export interface UvZoneDraft {
  id: string;
  placement: UvPlacement;
  placementLabel: string;
  /** Print size in cm as typed (the main zone of a stock item shows the item's print parameters). */
  widthStr: string;
  heightStr: string;
  whiteLayers: number;
  varnish: boolean;
  primer: boolean;
}

/** Editable state of one UV order line. */
export interface UvDraft {
  source: UvItemSource;
  /** Stock variant (stock source). */
  variantId: string | null;
  /** Client item (client source). */
  description: string;
  notes: string;
  quantityStr: string;
  zones: UvZoneDraft[];
}

export type UvQuote = { ok: true; data: UvLineData } | { ok: false; code: UvErrorCode | "uv_incomplete" };

let zoneSeq = 0;
export function newUvZoneId(): string {
  zoneSeq += 1;
  return `u${Date.now().toString(36)}${zoneSeq}`;
}

export function newUvZoneDraft(placement: UvPlacement): UvZoneDraft {
  return {
    id: newUvZoneId(),
    placement,
    placementLabel: "",
    widthStr: "",
    heightStr: "",
    whiteLayers: UV_DEFAULT_WHITE_LAYERS,
    varnish: false,
    primer: false,
  };
}

export function emptyUvDraft(catalog: UvCatalogJson): UvDraft {
  const draft: UvDraft = {
    source: "client",
    variantId: null,
    description: "",
    notes: "",
    quantityStr: "1",
    zones: [newUvZoneDraft("front")],
  };
  return catalog.items[0] ? withUvItem(draft, catalog, "stock", catalog.items[0].id) : draft;
}

function cmText(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Switch the source or the stock item; quantity and zones stay. A stock item's
 * main zone (the first) takes the item's print parameters: size and norms
 * (underbase layers, varnish, primer) — the operator may change the norms.
 */
export function withUvItem(
  draft: UvDraft,
  catalog: UvCatalogJson,
  source: UvItemSource,
  variantId: string | null,
): UvDraft {
  if (source === "client") return { ...draft, source: "client" };
  const item = catalog.items.find((i) => i.id === variantId) ?? catalog.items[0];
  const area = item?.printArea ?? null;
  const main: UvZoneDraft | undefined = draft.zones[0];
  const changedItem: boolean = draft.source !== "stock" || draft.variantId !== (item?.id ?? null);
  const zones: UvZoneDraft[] =
    main && item
      ? [
          {
            ...main,
            ...(area ? { widthStr: cmText(area.widthCm), heightStr: cmText(area.heightCm) } : {}),
            ...(changedItem
              ? { whiteLayers: item.printNorms.whiteLayers, varnish: item.printNorms.varnish, primer: item.printNorms.primer }
              : {}),
          },
          ...draft.zones.slice(1),
        ]
      : draft.zones;
  return { ...draft, source: "stock", variantId: item?.id ?? null, zones };
}

function parsePositiveInt(value: string): number {
  const n: number = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseCm(value: string): number | undefined {
  const n: number = Number.parseFloat(value.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function uvDraftQuantity(draft: UvDraft): number {
  return parsePositiveInt(draft.quantityStr);
}

/** API input for the draft, or null while required fields are missing. */
export function uvDraftToInput(draft: UvDraft): UvLineInput | null {
  const description: string = draft.description.trim();
  const notes: string = draft.notes.trim();
  const candidate = {
    source: draft.source,
    variantId: draft.source === "stock" ? (draft.variantId ?? undefined) : undefined,
    clientItem:
      draft.source === "client" && description
        ? { description, notes: notes || undefined }
        : undefined,
    quantity: uvDraftQuantity(draft),
    zones: draft.zones.map((z) => ({
      id: z.id,
      placement: z.placement,
      placementLabel: z.placementLabel.trim() || undefined,
      widthCm: parseCm(z.widthStr),
      heightCm: parseCm(z.heightStr),
      whiteLayers: z.whiteLayers,
      varnish: z.varnish,
      primer: z.primer,
    })),
  };
  const parsed = uvLineInputSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Same price the server will charge, computed from the wizard catalog. */
export function quoteUvDraft(draft: UvDraft, customerType: UvCustomerType, catalog: UvCatalogJson): UvQuote {
  const input: UvLineInput | null = uvDraftToInput(draft);
  if (!input) return { ok: false, code: "uv_incomplete" };
  const item = catalog.items.find((i) => i.id === input.variantId) ?? null;
  try {
    return {
      ok: true,
      data: buildUvLineData(input, customerType, {
        item,
        settings: catalog.settings,
        inkCosts: catalog.inkCosts,
      }),
    };
  } catch (e) {
    if (e instanceof UvLineError && isUvErrorCode(e.code)) return { ok: false, code: e.code };
    throw e;
  }
}

/** Editor state for a saved line (edit mode). */
export function uvDraftFromLineData(data: UvLineData): UvDraft {
  return {
    source: data.source,
    variantId: data.item?.variantId ?? null,
    description: data.clientItem?.description ?? "",
    notes: data.clientItem?.notes ?? "",
    quantityStr: String(data.quantity),
    zones: data.zones.map((z) => ({
      id: z.id,
      placement: z.placement,
      placementLabel: z.placementLabel ?? "",
      widthStr: cmText(z.widthCm),
      heightStr: cmText(z.heightCm),
      whiteLayers: z.whiteLayers,
      varnish: z.varnish,
      primer: z.primer === true,
    })),
  };
}
