import type { ShopLang } from "@/lib/storefront/i18n";
import type { StudioLocalized } from "./i18n";
import { contrastRatio, INK_DARK, INK_LIGHT } from "./contrast";
import { addCardBack } from "./cardLine";
import { studioId, type StudioDoc, type StudioImageLayer, type StudioImageSrc, type StudioLayer, type StudioShapeLayer, type StudioSurface, type StudioTextLayer } from "./document";
import { colorDistance, type LogoLook } from "./palette";
import { orientedSize } from "./photoEdit";
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
  /** The logo's colours / own background (from its pixels; unknown = no white plate). */
  logo?: LogoLook | null;
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

/** Below this a name / title / company goes to two lines (when the template has a space for it) instead of shrinking further; 7 pt stays the floor. */
const CARD_PREFER_TWO_LINES_PT = 9;
const CARD_TWO_LINE_BINDS: ReadonlySet<string> = new Set(["name", "title", "company"]);

/** Bound and sample texts shrunk to the width the template gave them (and the safe zone). */
export function cardFitTexts(surface: StudioSurface, measure: MeasureText): StudioSurface {
  const layers: StudioLayer[] = [...surface.layers];
  for (let i = 0; i < layers.length; i++) {
    const l: StudioLayer = layers[i]!;
    if (l.kind !== "text") continue;
    const room: number | null = textBandWidth(l, surface, "card");
    const band: number = Math.min(l.w, room ?? l.w);
    const fitted: StudioTextLayer = fitTextLayer(l, measure, band);
    layers[i] = fitted;
    if (l.text.includes("\n")) continue;
    // A name / title / company that had to shrink below ~9 pt reads better on two lines at a bigger size.
    const tooSmall: boolean = !!l.bind && CARD_TWO_LINE_BINDS.has(l.bind) && fitted.sizePt < CARD_PREFER_TWO_LINES_PT && l.sizePt > CARD_PREFER_TWO_LINES_PT;
    if (fitted.w <= band + 0.01 && !tooSmall) continue;
    // Two lines, broken at the space (or hyphen) nearest the middle.
    const breaks: { at: number; hyphen: boolean }[] = [...l.text.matchAll(/[ -]/g)].map((m) => ({ at: m.index ?? 0, hyphen: m[0] === "-" }));
    if (breaks.length === 0) continue;
    const mid: number = l.text.length / 2;
    const br = breaks.reduce((a, c) => (Math.abs(c.at - mid) < Math.abs(a.at - mid) ? c : a), breaks[0]!);
    const split: string = br.hyphen ? `${l.text.slice(0, br.at + 1)}\n${l.text.slice(br.at + 1)}` : `${l.text.slice(0, br.at)}\n${l.text.slice(br.at + 1)}`;
    const two: StudioTextLayer = fitTextLayer({ ...l, text: split }, measure, band);
    // Only when it is really bigger (or the one line does not fit at all).
    if (fitted.w <= band + 0.01 && two.sizePt < fitted.sizePt + 0.5) continue;
    // It grows: its column moves apart to make room — up and down, else only upwards, else only downwards
    // (the first that keeps the column inside the safe zone; a forced break takes the even split anyway).
    const grow: number = Math.max(0, two.h - fitted.h);
    const top: number = fitted.y;
    const bottom: number = fitted.y + fitted.h;
    const x0: number = Math.min(fitted.x, two.x);
    const x1: number = Math.max(fitted.x + fitted.w, two.x + two.w);
    const safe: number = surface.safeMm;
    const variant = (up: number): { next: StudioLayer[]; outside: boolean } => {
      const down: number = grow - up;
      const next: StudioLayer[] = [...layers];
      next[i] = { ...two, y: fitted.y - up };
      const moved: number[] = [i];
      if (grow > 0) {
        for (let j = 0; j < next.length; j++) {
          const o: StudioLayer = next[j]!;
          if (j === i || o.kind === "image" || (o.kind === "shape" && !o.shape.startsWith("icon") && (o.w > surface.widthMm * 0.5 || o.h > surface.heightMm * 0.5))) continue;
          if (o.x + o.w < x0 - 6 || o.x > x1) continue;
          if (o.y >= bottom - 0.2 && down > 0) next[j] = { ...o, y: o.y + down };
          else if (o.y + o.h <= top + 0.2 && up > 0) next[j] = { ...o, y: o.y - up };
          else continue;
          moved.push(j);
        }
      }
      const hits = (p: StudioLayer, q: StudioLayer): boolean =>
        p.x < q.x + q.w - 0.3 && q.x < p.x + p.w - 0.3 && p.y < q.y + q.h - 0.3 && q.y < p.y + p.h - 0.3;
      const name: StudioLayer = next[i]!;
      // Nor into the logo, a QR or a text that stayed where it was.
      const bumps: boolean = next.some((o, j) => !moved.includes(j) && (o.kind === "text" || o.kind === "image" || o.kind === "qr") && hits(name, o));
      const outside: boolean = bumps || moved.some((j) => next[j]!.y < safe - 0.05 || next[j]!.y + next[j]!.h > surface.heightMm - safe + 0.05);
      return { next, outside };
    };
    const tries = [variant(grow / 2), variant(grow), variant(0)];
    const ok = tries.find((t) => !t.outside);
    // By choice (it did fit on one line): only when the column stays inside the safe zone.
    if (!ok && fitted.w <= band + 0.01) continue;
    layers.splice(0, layers.length, ...(ok ?? tries[0]!).next);
  }
  return { ...surface, layers };
}

/** Colours this close to the band count as «the same» (the logo would melt into it). */
const LOGO_CLASH = 70;
/** White plate around a logo that would not show on its band (mm of white around the picture). */
const PLATE_PAD_MM = 1.3;

const isLightColor = (hex: string): boolean => (contrastRatio(hex, "#ffffff") ?? 21) < 1.35;

/**
 * Logo spots: the picture is shown whole (a wide or tall logo is fitted into
 * the spot, not cropped to it), kept to the spot's side when the spot sits
 * left or right; and a logo that would melt into the band under it (its own
 * colour, or a logo on its own white rectangle) gets a white rounded plate.
 */
export function cardFitLogos(surface: StudioSurface, look: LogoLook | null | undefined): StudioSurface {
  const out: StudioLayer[] = [];
  surface.layers.forEach((l, i) => {
    if (l.kind !== "image" || l.bind !== "logo" || !l.src) {
      out.push(l);
      return;
    }
    const n = orientedSize(l.src);
    const a: number = n.w / n.h;
    let fitted: StudioImageLayer = l;
    if (Math.abs(a - l.w / l.h) > 0.02 && l.crop.zoom <= 1) {
      const w: number = a > l.w / l.h ? l.w : l.h * a;
      const h: number = a > l.w / l.h ? l.w / a : l.h;
      const cx: number = (l.x + l.w / 2) / surface.widthMm;
      const x: number = cx > 0.6 ? l.x + l.w - w : cx < 0.4 ? l.x : l.x + (l.w - w) / 2;
      fitted = { ...l, x, y: l.y + (l.h - h) / 2, w, h, crop: { zoom: 1, ox: 0, oy: 0 } };
    }
    if (look) {
      const pts: [number, number][] = [
        [0.5, 0.5],
        [0.05, 0.05],
        [0.95, 0.05],
        [0.05, 0.95],
        [0.95, 0.95],
      ];
      const under: string[] = pts
        .map(([fx, fy]) => studioColorBelow(surface, i, fitted.x + fitted.w * fx, fitted.y + fitted.h * fy))
        .filter((c): c is string => c != null && !isLightColor(c));
      const clash: boolean = under.some((u) => look.ownBackground || look.colors.slice(0, 2).some((c) => colorDistance(c, u) < LOGO_CLASH));
      if (clash) {
        const plate: StudioShapeLayer = {
          id: studioId(),
          kind: "shape",
          shape: "rounded",
          x: fitted.x - PLATE_PAD_MM,
          y: fitted.y - PLATE_PAD_MM,
          w: fitted.w + PLATE_PAD_MM * 2,
          h: fitted.h + PLATE_PAD_MM * 2,
          rotation: 0,
          fill: "#ffffff",
          name: "logo-plate",
        };
        out.push(plate);
      }
    }
    out.push(fitted);
  });
  return out.length === surface.layers.length && out.every((l, i) => l === surface.layers[i]) ? surface : { ...surface, layers: out };
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
    let out: StudioSurface = cardFitLogos(withSlots(s, side, texts, input.photo), input.logo);
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
  /** Label of a free-text slot in the form («Slogan», «Serviciul 1»…); absent for fields and photos. */
  label?: string;
}

const SL = (ro: string, ru: string, en: string): StudioLocalized => ({ ro, ru, en });

/** Names of the free-text slots in the short-edit form: per template first, then by slot id. */
const SLOT_LABELS: Readonly<Record<string, StudioLocalized>> = {
  "card-back-services:heading": SL("Titlul listei", "Заголовок списка", "List heading"),
  "card-back-loyalty:heading": SL("Titlul cardului", "Заголовок карты", "Card heading"),
  "card-back-appointment:heading": SL("Titlul programării", "Заголовок записи", "Appointment heading"),
  heading: SL("Titlu", "Заголовок", "Heading"),
  offer: SL("Oferta", "Предложение", "Offer"),
  slogan: SL("Slogan", "Слоган", "Slogan"),
  s1: SL("Serviciul 1", "Услуга 1", "Service 1"),
  s2: SL("Serviciul 2", "Услуга 2", "Service 2"),
  s3: SL("Serviciul 3", "Услуга 3", "Service 3"),
  s4: SL("Serviciul 4", "Услуга 4", "Service 4"),
  s5: SL("Serviciul 5", "Услуга 5", "Service 5"),
};

/** Form label of a free-text slot of a template (null: no name known, the form numbers it). */
export function cardSlotLabel(templateId: string, slot: string, lang: ShopLang): string | null {
  const l: StudioLocalized | undefined = SLOT_LABELS[`${templateId}:${slot}`] ?? SLOT_LABELS[slot];
  return l ? l[lang] : null;
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
      const slot: string = cardSlotOf(l)!;
      const id = `${side}:${slot}`;
      if (!seen.has(id)) {
        seen.add(id);
        const label: string | null = cardSlotLabel(tpl.id, slot, lang);
        out.push({ key: `t:${id}`, kind: "text", id, sample: l.text, ...(label ? { label } : {}) });
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
