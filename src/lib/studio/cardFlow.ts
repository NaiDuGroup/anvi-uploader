import type { ShopLang } from "@/lib/storefront/i18n";
import { buildCardDoc, matchingBack } from "./cardBuild";
import type { StudioDoc, StudioImageSrc } from "./document";
import type { BrandPalette } from "./palette";
import { STUDIO_COLOR_FIELD_KEYS, type StudioFields } from "./smartFields";
import type { StudioSurfaceSpec } from "./surfaces";
import type { MeasureText } from "./textFit";
import {
  CARD_INDUSTRIES,
  CARD_STYLES,
  studioCardBackTemplates,
  studioTemplateById,
  studioTemplatesFor,
  type CardStyle,
  type StudioIndustry,
  type StudioTemplate,
} from "./templates";

/**
 * The customer flow of the business-card Studio, pure parts: the
 * personalised gallery («Alege un model»: filter chips) and the short edit
 * («Editare rapidă»: what the customer picked and typed → the document).
 */

// ─── Gallery ────────────────────────────────────────────────────────────

/** One chip at a time: an industry or a style (none = «Toate»). */
export type CardGalleryFilter = { industry?: StudioIndustry; style?: CardStyle };

/** The card fronts of the gallery, filtered. */
export function cardGalleryFronts(filter: CardGalleryFilter = {}): StudioTemplate[] {
  return studioTemplatesFor("card").filter(
    (t) => (!filter.industry || (t.industries ?? []).includes(filter.industry)) && (!filter.style || t.style === filter.style),
  );
}

/** Chips that have at least one front, in the gallery's order. */
export function cardGalleryChips(): { industries: StudioIndustry[]; styles: CardStyle[] } {
  const all: StudioTemplate[] = cardGalleryFronts();
  return {
    industries: CARD_INDUSTRIES.filter((i) => all.some((t) => (t.industries ?? []).includes(i))),
    styles: CARD_STYLES.filter((s) => all.some((t) => t.style === s)),
  };
}

// ─── Short edit ─────────────────────────────────────────────────────────

/** What the short edit keeps (the document is re-drawn from it and «Datele mele» on every change). */
export interface CardShortState {
  frontId: string;
  /** null = one-sided card. */
  backId: string | null;
  /** Free-text slots the customer rewrote, `front:<slot>` / `back:<slot>`. */
  texts: Record<string, string>;
  /** The photo of a photo template. */
  photo: StudioImageSrc | null;
}

/** The short edit right after a gallery pick: front only (the back costs extra — the customer adds it). */
export function cardShortStart(front: StudioTemplate): CardShortState {
  return { frontId: front.id, backId: null, texts: {}, photo: null };
}

/** Back on (the front's matching back, or the one picked before) / off. Free texts of the back stay, for turning it on again. */
export function cardShortWithBack(state: CardShortState, on: boolean, previousBackId: string | null = null): CardShortState {
  if (!on) return { ...state, backId: null };
  if (state.backId) return state;
  const front: StudioTemplate | null = studioTemplateById(state.frontId);
  const pick: string | null = (previousBackId && studioTemplateById(previousBackId)?.side === "back" ? previousBackId : null) ?? (front ? (matchingBack(front)?.id ?? null) : null);
  return { ...state, backId: pick };
}

/** Another back («Alt verso»): one of the back templates. */
export function cardShortSetBack(state: CardShortState, backId: string): CardShortState {
  return studioCardBackTemplates().some((t) => t.id === backId) ? { ...state, backId } : state;
}

/** A free-text slot written (empty = the template's sample again). */
export function cardShortSetText(state: CardShortState, id: string, value: string): CardShortState {
  const texts: Record<string, string> = { ...state.texts };
  if (value === "") delete texts[id];
  else texts[id] = value.slice(0, 400);
  return { ...state, texts };
}

/** The document of the short edit (same `id` all along: autosave, verify and the cart keep one design). */
export function cardShortDoc(
  state: CardShortState,
  ctx: { fields: StudioFields; lang: ShopLang; specs: readonly StudioSurfaceSpec[]; measure?: MeasureText; id?: string },
): StudioDoc | null {
  const front: StudioTemplate | null = studioTemplateById(state.frontId);
  if (!front || front.side === "back") return null;
  const back: StudioTemplate | null = state.backId ? studioTemplateById(state.backId) : null;
  const doc: StudioDoc = buildCardDoc({ front, back, fields: ctx.fields, lang: ctx.lang, specs: ctx.specs, texts: state.texts, photo: state.photo, measure: ctx.measure });
  return ctx.id ? { ...doc, id: ctx.id } : doc;
}

/** A stored short-edit state (resume), or null when it is not one / its templates are gone. */
export function parseCardShortState(v: unknown): CardShortState | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.frontId !== "string" || !studioTemplateById(o.frontId) || studioTemplateById(o.frontId)?.side === "back") return null;
  const backId: string | null = typeof o.backId === "string" && studioTemplateById(o.backId)?.side === "back" ? o.backId : null;
  const texts: Record<string, string> = {};
  if (o.texts && typeof o.texts === "object") {
    for (const [k, t] of Object.entries(o.texts as Record<string, unknown>)) if (/^(front|back):[\w-]{1,40}$/.test(k) && typeof t === "string") texts[k] = t.slice(0, 400);
  }
  const p = o.photo as Record<string, unknown> | null | undefined;
  const photo: StudioImageSrc | null =
    p && typeof p === "object" && typeof p.naturalW === "number" && typeof p.naturalH === "number" && (typeof p.localId === "string" || typeof p.key === "string")
      ? (p as unknown as StudioImageSrc)
      : null;
  return { frontId: o.frontId, backId, texts, photo };
}

// ─── Colours ────────────────────────────────────────────────────────────

/** The fields with a colour set (null: the templates' own colours). */
export function fieldsWithPalette(fields: StudioFields, palette: BrandPalette | null): StudioFields {
  const out: StudioFields = { ...fields };
  for (const k of STUDIO_COLOR_FIELD_KEYS) {
    if (palette) out[k] = palette[k];
    else delete out[k];
  }
  return out;
}

/** The customer's current colours are this set. */
export function isPaletteOf(fields: StudioFields, palette: BrandPalette | null): boolean {
  if (!palette) return STUDIO_COLOR_FIELD_KEYS.every((k) => !fields[k]);
  return STUDIO_COLOR_FIELD_KEYS.every((k) => (fields[k] ?? "").toLowerCase() === palette[k].toLowerCase());
}
