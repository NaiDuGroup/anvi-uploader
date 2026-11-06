import type { SmartTextKey, StudioDoc, StudioImageLayer, StudioImageSrc, StudioKind, StudioLayer, StudioTextLayer } from "./document";
import { carryOverTemplate } from "./smartFields";
import { looksLikeDate } from "./textRole";
import { KIND_ORIENTATION, STUDIO_TEMPLATES, type StudioTemplate } from "./templates";

/**
 * «Fotografia ta mai întâi» and the short «Personalizează» form. Pure.
 *
 * - The customer's photos fill a template's photo slots in order (every
 *   thumbnail shows them); a template with only a logo spot takes the first
 *   photo there when the customer has no logo.
 * - The form lists only the template's slots: photos, then texts top-down
 *   (bound «Datele mele» fields by their key, dates, other texts).
 * - Switching template keeps what the customer typed, but a theme text they
 *   never touched (the old template's own sample, e.g. «La mulți ani!») is
 *   replaced by the new template's text.
 */

export interface StudioStarter {
  photos: StudioImageSrc[];
  name: string;
}

export type StudioSlot =
  | {
      kind: "photo";
      layerId: string;
      index: number;
      logo: boolean;
      filled: boolean;
    }
  | {
      kind: "text";
      layerId: string;
      field: SmartTextKey | "date" | "text";
      index: number;
      multiline: boolean;
      text: string;
      placeholder: boolean;
    };

const isPhoto = (l: StudioLayer): l is StudioImageLayer => l.kind === "image" && !l.hidden;

export { looksLikeDate } from "./textRole";

/** The slots of the first surface, photos first, texts top-down; one entry per bound field. */
export function personaliseSlots(doc: StudioDoc): StudioSlot[] {
  const layers: StudioLayer[] = doc.surfaces[0]?.layers ?? [];
  const out: StudioSlot[] = [];
  let pi = 0;
  for (const l of layers) {
    if (!isPhoto(l)) continue;
    out.push({
      kind: "photo",
      layerId: l.id,
      index: ++pi,
      logo: l.bind === "logo",
      filled: l.src != null,
    });
  }
  const texts: StudioTextLayer[] = layers
    .filter((l): l is StudioTextLayer => l.kind === "text" && !l.hidden)
    .sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const seen = new Set<string>();
  let ti = 0;
  for (const l of texts) {
    const bound: SmartTextKey | null = l.bind && l.bind !== "logo" && !l.bind.startsWith("brandColor") ? (l.bind as SmartTextKey) : null;
    if (bound) {
      if (seen.has(bound)) continue;
      seen.add(bound);
    }
    const field: SmartTextKey | "date" | "text" = bound ?? (looksLikeDate(l.text) ? "date" : "text");
    out.push({
      kind: "text",
      layerId: l.id,
      field,
      index: field === "text" ? ++ti : 0,
      multiline: l.text.includes("\n"),
      text: l.text,
      placeholder: !!l.placeholder,
    });
  }
  return out;
}

/** The photo slots of a template on a product (logo spots apart). */
export function templatePhotoSlots(tpl: StudioTemplate, kind: StudioKind): { photos: number; logos: number } {
  const layout = tpl.layouts[KIND_ORIENTATION[kind]] ?? [];
  let photos = 0;
  let logos = 0;
  for (const l of layout) {
    if (l.k !== "photo") continue;
    if (l.logo) logos++;
    else photos++;
  }
  return { photos, logos };
}

/** With the customer's photos: templates with photo spots first (else the order stays). */
export function orderTemplatesForPhotos(list: readonly StudioTemplate[], kind: StudioKind, photos: number): StudioTemplate[] {
  if (photos <= 0) return [...list];
  const score = (t: StudioTemplate): number => {
    const s = templatePhotoSlots(t, kind);
    // Enough spots for every photo first, then any photo spot, then logo spots, then the rest.
    return s.photos >= photos ? 0 : s.photos > 0 ? 1 : s.logos > 0 ? 2 : 3;
  };
  return list
    .map((t, i) => ({ t, i, s: score(t) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.t);
}

/**
 * The customer's photos into the empty photo slots in order (crop reset).
 * Without a plain photo slot the first logo spot takes a photo when the
 * customer has no logo (it becomes a photo slot: not saved as the logo).
 */
export function fillStarterPhotos(doc: StudioDoc, photos: readonly StudioImageSrc[], opts: { hasLogo?: boolean } = {}): StudioDoc {
  if (photos.length === 0) return doc;
  const s0 = doc.surfaces[0];
  if (!s0) return doc;
  const plain: boolean = s0.layers.some((l) => isPhoto(l) && l.bind !== "logo");
  let i = 0;
  const layers: StudioLayer[] = s0.layers.map((l) => {
    if (!isPhoto(l) || l.src || i >= photos.length) return l;
    if (l.bind === "logo") {
      if (plain || opts.hasLogo) return l;
      const { bind: _bind, name: _name, ...rest } = l;
      void _bind;
      void _name;
      return { ...rest, src: photos[i++]!, crop: { zoom: 1, ox: 0, oy: 0 } };
    }
    return { ...l, src: photos[i++]!, crop: { zoom: 1, ox: 0, oy: 0 } };
  });
  return { ...doc, surfaces: [{ ...s0, layers }, ...doc.surfaces.slice(1)] };
}

/** One slot's text: a bound field changes every text with that key; the text is the customer's now. */
export function setSlotText(doc: StudioDoc, layerId: string, text: string): StudioDoc {
  const target: StudioLayer | undefined = doc.surfaces.flatMap((s) => s.layers).find((l) => l.id === layerId);
  if (!target || target.kind !== "text") return doc;
  const bind = target.bind;
  const v: string = text.slice(0, 400);
  return {
    ...doc,
    surfaces: doc.surfaces.map((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.kind === "text" && (l.id === layerId || (bind && l.bind === bind)) ? { ...l, text: v, placeholder: false } : l)),
    })),
  };
}

/** One photo slot's photo or crop. */
export function setSlotPhoto(doc: StudioDoc, layerId: string, patch: Partial<Pick<StudioImageLayer, "src" | "crop">>): StudioDoc {
  return {
    ...doc,
    surfaces: doc.surfaces.map((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.kind === "image" && l.id === layerId ? { ...l, ...patch } : l)),
    })),
  };
}

let defaults: Set<string> | null = null;
const norm = (t: string): string => t.replace(/\s+/g, " ").trim().toLowerCase();

/** Every sample text of every template, in every language (normalised). */
function templateDefaultTexts(): Set<string> {
  if (defaults) return defaults;
  const out = new Set<string>();
  for (const tpl of STUDIO_TEMPLATES) {
    for (const layout of [...Object.values(tpl.layouts), tpl.stripThin ?? []]) {
      for (const l of layout ?? []) {
        if (l.k !== "text") continue;
        for (const v of Object.values(l.text)) out.add(norm(v));
      }
    }
  }
  defaults = out;
  return out;
}

/** The text is a template's own sample (the customer did not type it). */
export function isTemplateDefaultText(text: string): boolean {
  return templateDefaultTexts().has(norm(text));
}

/**
 * Switch template keeping what the customer made (see `carryOverTemplate`),
 * except the old template's untouched theme texts: those are not carried, so
 * the new template shows its own (no «La mulți ani!» on a Christmas mug).
 */
export function switchTemplateKeepTyped(oldDoc: StudioDoc, newDoc: StudioDoc): StudioDoc {
  const marked: StudioDoc = {
    ...oldDoc,
    surfaces: oldDoc.surfaces.map((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.kind === "text" && !l.bind && !l.placeholder && isTemplateDefaultText(l.text) ? { ...l, placeholder: true } : l)),
    })),
  };
  return carryOverTemplate(marked, newDoc);
}
