import type { ShopLang } from "@/lib/storefront/i18n";
import { contrastRatio, INK_DARK, INK_LIGHT } from "./contrast";
import { addCardBack } from "./cardLine";
import type { StudioDoc, StudioImageSrc, StudioLayer, StudioSurface, StudioTextLayer } from "./document";
import { studioColorBelow } from "./quality";
import type { StudioFields } from "./smartFields";
import { CARD_BACK_ID, CARD_FRONT_ID, type StudioSurfaceSpec } from "./surfaces";
import { fitTextLayer, textBandWidth, type MeasureText } from "./textFit";
import { instantiateStudioTemplate, studioTemplateById, type StudioTemplate } from "./templates";

/**
 * A business card drawn from its templates and the customer's details — what
 * the personalised gallery shows and what the short edit («Editare rapidă»)
 * keeps re-drawing while the customer types: the front, and the back (when
 * on) with the same details and logo colours. Pure (the text measure is
 * passed in: the browser's fonts in the Studio, the node canvas in tests).
 *
 * - texts take the brand colours (`bindColor`) unless they would not read on
 *   what is under them — then white or the dark ink;
 * - every bound / sample text shrinks to fit the width the template gave it
 *   (a long name never runs under the logo);
 * - free-text slots (services, slogan, «Card de fidelitate») take what the
 *   customer wrote (`texts`, by `front:<slot>` / `back:<slot>`);
 * - an empty photo spot (photo templates) takes `photo`.
 */

export interface CardDesignInput {
  front: StudioTemplate;
  /** The back template, null = one-sided card. */
  back: StudioTemplate | null;
  fields: StudioFields;
  lang: ShopLang;
  specs: readonly StudioSurfaceSpec[];
  /** Free-text slots the customer rewrote, `front:<slot>` / `back:<slot>`. */
  texts?: Readonly<Record<string, string>>;
  photo?: StudioImageSrc | null;
  measure?: MeasureText;
}

/** Below this contrast a text on a band takes white / the dark ink. */
const CARD_MIN_CONTRAST = 2.6;

/** The back that goes with a front (its own pick, else the logo back). */
export function matchingBack(front: StudioTemplate): StudioTemplate | null {
  return studioTemplateById(front.back ?? "card-back-logo") ?? studioTemplateById("card-back-logo");
}

/** Slot id of a text layer (`slot:<id>` name), if it is one. */
export function cardSlotOf(l: StudioLayer): string | null {
  return l.kind === "text" && l.name?.startsWith("slot:") ? l.name.slice(5) : null;
}

/** Readable ink for a text over `under`: the customer's dark ink when it reads, else navy / white. */
function inkOn(under: string, fields: StudioFields): string {
  const dark: string = fields.brandColor3 ?? INK_DARK;
  const darkOk: boolean = (contrastRatio(dark, under) ?? 21) >= 4.5;
  const light: number = contrastRatio(INK_LIGHT, under) ?? 0;
  const navy: number = contrastRatio(INK_DARK, under) ?? 0;
  if (light > navy) return INK_LIGHT;
  return darkOk ? dark : INK_DARK;
}

/** The worst contrast of a colour over what lies under a box (3 points along its middle). */
function worstUnder(surface: StudioSurface, index: number, l: StudioLayer, color: string): { ratio: number; under: string | null } {
  let worst = { ratio: 21, under: null as string | null };
  for (const f of [0.12, 0.5, 0.88]) {
    const under: string | null = studioColorBelow(surface, index, l.x + l.w * f, l.y + l.h / 2);
    if (!under) continue;
    const r: number = contrastRatio(color, under) ?? 21;
    if (r < worst.ratio) worst = { ratio: r, under };
  }
  return worst;
}

/** Texts and contact icons that would not read on their band take a readable ink. */
export function cardReadableColors(surface: StudioSurface, fields: StudioFields): StudioSurface {
  let changed = false;
  const layers: StudioLayer[] = surface.layers.map((l, i) => {
    if (l.kind === "text") {
      const w = worstUnder(surface, i, l, l.color);
      if (w.under && w.ratio < CARD_MIN_CONTRAST) {
        changed = true;
        const { bindColor: _drop, ...rest } = l;
        void _drop;
        return { ...rest, color: inkOn(w.under, fields) };
      }
      return l;
    }
    if (l.kind === "shape" && l.shape.startsWith("icon") && l.fill) {
      const w = worstUnder(surface, i, l, l.fill);
      if (w.under && w.ratio < 2) {
        changed = true;
        const { bindColor: _drop, ...rest } = l;
        void _drop;
        return { ...rest, fill: inkOn(w.under, fields) };
      }
    }
    return l;
  });
  return changed ? { ...surface, layers } : surface;
}

/** Bound and sample texts shrunk to the width the template gave them (and the safe zone). */
export function cardFitTexts(surface: StudioSurface, measure: MeasureText): StudioSurface {
  const layers: StudioLayer[] = surface.layers.map((l) => {
    if (l.kind !== "text") return l;
    const room: number | null = textBandWidth(l, surface, "card");
    const band: number = Math.min(l.w, room ?? l.w);
    const fitted: StudioTextLayer = fitTextLayer(l, measure, band);
    if (fitted.w <= band + 0.01 || l.text.includes("\n")) return fitted;
    // Too long even at the smallest size: two lines, broken at the space nearest the middle.
    const spaces: number[] = [...l.text.matchAll(/ /g)].map((m) => m.index ?? 0);
    if (spaces.length === 0) return fitted;
    const mid: number = l.text.length / 2;
    const at: number = spaces.reduce((a, c) => (Math.abs(c - mid) < Math.abs(a - mid) ? c : a), spaces[0]!);
    const two: StudioTextLayer = { ...l, text: `${l.text.slice(0, at)}\n${l.text.slice(at + 1)}` };
    return fitTextLayer(two, measure, band);
  });
  return { ...surface, layers };
}

function withSlots(surface: StudioSurface, side: "front" | "back", texts: Readonly<Record<string, string>>, photo: StudioImageSrc | null | undefined): StudioSurface {
  const layers: StudioLayer[] = surface.layers.map((l) => {
    const slot: string | null = cardSlotOf(l);
    if (slot != null) {
      const v: string | undefined = texts[`${side}:${slot}`];
      if (v != null && v.trim() !== "") return { ...(l as StudioTextLayer), text: v.slice(0, 400), placeholder: false };
      return l;
    }
    if (photo && l.kind === "image" && l.bind !== "logo" && !l.src) return { ...l, src: photo };
    return l;
  });
  return { ...surface, layers };
}

/** The whole card (front, and the back when chosen) for the gallery and the short edit. */
export function buildCardDoc(input: CardDesignInput): StudioDoc {
  const { front, back, fields, lang, specs } = input;
  let doc: StudioDoc = instantiateStudioTemplate(front, "card", specs, lang, fields);
  if (back) doc = addCardBack(doc, specs, { kind: "template", template: back }, lang, fields);
  const texts = input.texts ?? {};
  const surfaces: StudioSurface[] = doc.surfaces.map((s) => {
    const side: "front" | "back" = s.id === CARD_BACK_ID ? "back" : "front";
    let out: StudioSurface = withSlots(s, side, texts, input.photo);
    if (input.measure) out = cardFitTexts(out, input.measure);
    return cardReadableColors(out, fields);
  });
  return { ...doc, templateId: front.id, surfaces: surfaces.sort((a, b) => (a.id === CARD_FRONT_ID ? -1 : b.id === CARD_FRONT_ID ? 1 : 0)) };
}

/** The text slots of a template side, for the short-edit form: bound fields first, then the free texts. */
export interface CardSlotInfo {
  key: string;
  kind: "field" | "text" | "photo";
  /** Field key (name, phone…) or `front:<slot>` / `back:<slot>`. */
  id: string;
  sample: string;
}

/** What the short edit offers to fill on a side (drawn with the samples, so collapsed lines are listed too). */
export function cardSideSlots(tpl: StudioTemplate, side: "front" | "back", lang: ShopLang, specs: readonly StudioSurfaceSpec[]): CardSlotInfo[] {
  const doc: StudioDoc = instantiateStudioTemplate(tpl, "card", specs, lang, {});
  const out: CardSlotInfo[] = [];
  const seen = new Set<string>();
  for (const l of doc.surfaces[0]!.layers) {
    if (l.kind === "text" && l.bind && !seen.has(l.bind)) {
      seen.add(l.bind);
      out.push({ key: `f:${l.bind}`, kind: "field", id: l.bind, sample: l.text });
    } else if (l.kind === "text" && cardSlotOf(l)) {
      const id = `${side}:${cardSlotOf(l)}`;
      if (!seen.has(id)) {
        seen.add(id);
        out.push({ key: `t:${id}`, kind: "text", id, sample: l.text });
      }
    } else if (l.kind === "image" && l.bind !== "logo" && !seen.has("photo")) {
      seen.add("photo");
      out.push({ key: "photo", kind: "photo", id: "photo", sample: "" });
    } else if (l.kind === "qr" && l.bind === "vcard" && !seen.has("vcard")) {
      seen.add("vcard");
    }
  }
  return out;
}
