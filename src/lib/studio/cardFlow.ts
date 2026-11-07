import type { ShopLang } from "@/lib/storefront/i18n";
import { buildCardDoc, cardSideSlots, matchingBack } from "./cardBuild";
import { cardInitials } from "./cardTemplates/stack";
import type { SmartTextKey, StudioDoc, StudioImageSrc } from "./document";
import type { BrandPalette, LogoLook } from "./palette";
import { STUDIO_COLOR_FIELD_KEYS, type StudioFields } from "./smartFields";
import type { SheetStudioKind, StudioSurfaceSpec } from "./surfaces";
import type { MeasureText } from "./textFit";
import {
  CARD_INDUSTRIES,
  CARD_STYLES,
  FLYER_PURPOSES,
  studioBackTemplates,
  studioTemplateById,
  studioTemplatesFor,
  type CardStyle,
  type FlyerPurpose,
  type StudioIndustry,
  type StudioTemplate,
} from "./templates";

/**
 * The customer flow of the business-card Studio, pure parts: the
 * personalised gallery («Alege un model»: filter chips) and the short edit
 * («Editare rapidă»: what the customer picked and typed → the document).
 */

// ─── Gallery ────────────────────────────────────────────────────────────

/** One chip at a time: an industry (cards) / a purpose (flyers) or a style (none = «Toate»). */
export type CardGalleryFilter = { industry?: StudioIndustry; style?: CardStyle; purpose?: FlyerPurpose };

/** The fronts of the gallery (business cards by default, or flyers), filtered. */
export function cardGalleryFronts(filter: CardGalleryFilter = {}, kind: SheetStudioKind = "card"): StudioTemplate[] {
  return studioTemplatesFor(kind).filter(
    (t) =>
      (!filter.industry || (t.industries ?? []).includes(filter.industry)) &&
      (!filter.purpose || (t.purposes ?? []).includes(filter.purpose)) &&
      (!filter.style || t.style === filter.style),
  );
}

/** Chips that have at least one front, in the gallery's order. */
export function cardGalleryChips(kind: SheetStudioKind = "card"): { industries: StudioIndustry[]; styles: CardStyle[]; purposes: FlyerPurpose[] } {
  const all: StudioTemplate[] = cardGalleryFronts({}, kind);
  return {
    industries: kind === "flyer" ? [] : CARD_INDUSTRIES.filter((i) => all.some((t) => (t.industries ?? []).includes(i))),
    styles: CARD_STYLES.filter((s) => all.some((t) => t.style === s)),
    purposes: FLYER_PURPOSES.filter((p) => all.some((t) => (t.purposes ?? []).includes(p))),
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

/** The back that a sides switch outside the short edit's preview adds: the customer never saw it before it prints. */
export const SHEET_AUTO_BACK_FALLBACK: Record<SheetStudioKind, string> = { card: "card-back-logo", flyer: "flyer-back-logo" };

/**
 * The back added for the customer without them looking at it («Pe ambele
 * fețe» on the verify step): the front's own back only when every free text
 * of it is the customer's (`texts`, `back:<slot>`) — a coupon / price list
 * still showing its samples prints with holes — else the logo + contacts
 * back, which «Datele mele» fill completely.
 */
export function sheetAutoBack(front: StudioTemplate, texts: Readonly<Record<string, string>>, lang: ShopLang, specs: readonly StudioSurfaceSpec[], kind: SheetStudioKind): StudioTemplate | null {
  const own: StudioTemplate | null = matchingBack(front);
  const fallback: StudioTemplate | null = studioTemplateById(SHEET_AUTO_BACK_FALLBACK[kind]);
  const filled = (tpl: StudioTemplate): boolean => cardSideSlots(tpl, "back", lang, specs, kind).every((s) => s.kind !== "text" || !!texts[s.id]?.trim());
  if (own && filled(own)) return own;
  return fallback ?? own;
}

/** {@link cardShortWithBack} for the verify step: the back is {@link sheetAutoBack}. */
export function cardShortWithAutoBack(state: CardShortState, lang: ShopLang, specs: readonly StudioSurfaceSpec[]): CardShortState {
  if (state.backId) return state;
  const front: StudioTemplate | null = studioTemplateById(state.frontId);
  if (!front) return state;
  const kind: SheetStudioKind = front.layouts.flyer ? "flyer" : "card";
  return { ...state, backId: sheetAutoBack(front, state.texts, lang, specs, kind)?.id ?? null };
}

/** Another back («Alt verso»): one of the back templates of the same product. */
export function cardShortSetBack(state: CardShortState, backId: string): CardShortState {
  const kind: SheetStudioKind = studioTemplateById(state.frontId)?.layouts.flyer ? "flyer" : "card";
  return studioBackTemplates(kind).some((t) => t.id === backId) ? { ...state, backId } : state;
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
  ctx: { fields: StudioFields; lang: ShopLang; specs: readonly StudioSurfaceSpec[]; measure?: MeasureText; id?: string; logo?: LogoLook | null; kind?: SheetStudioKind },
): StudioDoc | null {
  const front: StudioTemplate | null = studioTemplateById(state.frontId);
  if (!front || front.side === "back") return null;
  const back: StudioTemplate | null = state.backId ? studioTemplateById(state.backId) : null;
  const doc: StudioDoc = buildCardDoc({ front, back, fields: ctx.fields, lang: ctx.lang, specs: ctx.specs, texts: state.texts, photo: state.photo, measure: ctx.measure, logo: ctx.logo, kind: ctx.kind ?? (front.layouts.flyer ? "flyer" : "card") });
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

// ─── Fields a design leaves out ─────────────────────────────────────────

/** The text fields the customer fills for each product, in the form's order. */
export const SHEET_TEXT_FIELDS: Record<SheetStudioKind, readonly SmartTextKey[]> = {
  card: ["name", "title", "company", "phone", "email", "site", "address"],
  flyer: ["headline", "subheadline", "body", "bullets", "offer", "date", "company", "phone", "site", "address", "email"],
};

/**
 * The fields the customer filled in that this design does not print (on
 * none of its sides): «Ofertă mare» has no list, a one-sided flyer whose
 * address is on the back… A field counts as printed when a visible text
 * shows it, or a visible contact QR carries it (a site in a link QR, the
 * contacts in a vCard). The company also counts as printed when the design
 * carries the customer's logo or the monogram made of its initials (most
 * designs show the brand that way, not as a line of text). In the form's order.
 */
export function sheetFieldsNotShown(doc: Pick<StudioDoc, "surfaces">, fields: StudioFields, kind: SheetStudioKind): SmartTextKey[] {
  const shown = new Set<string>();
  const initials: string = fields.company?.trim() ? cardInitials({ company: fields.company }) : "";
  for (const s of doc.surfaces) {
    for (const l of s.layers) {
      if (l.hidden) continue;
      if (l.kind === "text" && l.bind) {
        shown.add(l.bind);
      } else if ((l.kind === "image" && l.bind === "logo" && l.src) || (l.kind === "text" && initials && l.text.trim() === initials)) {
        shown.add("company");
      } else if (l.kind === "qr" && l.qr.type === "vcard") {
        for (const [k, v] of Object.entries(l.qr.data)) if (v?.trim()) shown.add(k);
      } else if (l.kind === "qr" && l.qr.type === "url" && fields.site?.trim() && l.qr.data.url === fields.site.trim()) {
        shown.add("site");
      }
    }
  }
  return SHEET_TEXT_FIELDS[kind].filter((k) => !!fields[k]?.trim() && !shown.has(k));
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
