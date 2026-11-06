import type { SmartTextKey } from "../document";
import type { StudioLocalized } from "../i18n";
import type { StudioColorFieldKey, StudioFields } from "../smartFields";
import type { StudioTemplateFont, TplLayer, TplPhoto, TplShape, TplText } from "../templates";

/**
 * Business-card «stacks»: a column of lines (name, title, contacts) laid out
 * from the customer's details. A line whose field the customer left empty is
 * dropped and the others close up — no gap where the site or the address
 * would be. Before the customer typed anything every line shows its sample.
 * Pure data in, template layers out (expanded when the template is drawn).
 */

export type CardIcon = "iconPhone" | "iconMail" | "iconWeb" | "iconPin";

export interface TplStackRow {
  /** «Datele mele» field the line shows. */
  bind?: SmartTextKey;
  /** Own text (a slot the customer can rewrite in the short edit); its sample when bound. */
  text?: StudioLocalized;
  /** Name of a free-text slot (`slot:<id>`), rewritten in the short edit. */
  slot?: string;
  /** Font size, share of the card's short side. */
  size: number;
  font: StudioTemplateFont;
  color: string;
  bindColor?: StudioColorFieldKey;
  bold?: boolean;
  italic?: boolean;
  ls?: number;
  icon?: CardIcon;
  /** Extra space above the line, share of the card height. */
  gap?: number;
}

export interface TplStack {
  k: "stack";
  /** Left edge (align left), middle (center) or right edge (right), share of the width. */
  x: number;
  /** Top / middle / bottom of the column (by `anchor`), share of the height. */
  y: number;
  /** Width of the lines, share of the width. */
  w: number;
  align?: "left" | "center" | "right";
  anchor?: "top" | "middle" | "bottom";
  /** Line height (× size). */
  lh?: number;
  iconColor?: string;
  iconBindColor?: StudioColorFieldKey;
  rows: TplStackRow[];
}

export const CARD_SAMPLES: Record<SmartTextKey, StudioLocalized> = {
  name: { ro: "Numele Prenumele", ru: "Имя Фамилия", en: "Full Name" },
  title: { ro: "Funcția", ru: "Должность", en: "Job title" },
  company: { ro: "Compania", ru: "Компания", en: "Company" },
  phone: { ro: "+373 60 000 000", ru: "+373 60 000 000", en: "+373 60 000 000" },
  email: { ro: "email@companie.md", ru: "email@kompania.md", en: "email@company.md" },
  site: { ro: "www.companie.md", ru: "www.kompania.md", en: "www.company.md" },
  address: { ro: "Str. Exemplu 1, Chișinău", ru: "ул. Примерная 1, Кишинёв", en: "1 Example St, Chișinău" },
  // Flyers (the message typed on «Datele tale»).
  headline: { ro: "Titlul flyerului", ru: "Заголовок листовки", en: "Flyer headline" },
  subheadline: { ro: "Un rând scurt despre ofertă", ru: "Коротко о предложении", en: "A short line about the offer" },
  body: {
    ro: "Câteva cuvinte despre ce oferiți și de ce merită să veniți la voi.",
    ru: "Пара слов о том, что вы предлагаете и почему стоит прийти именно к вам.",
    en: "A few words about what you offer and why people should come to you.",
  },
  bullets: { ro: "Primul avantaj\nAl doilea avantaj\nAl treilea avantaj", ru: "Первое преимущество\nВторое преимущество\nТретье преимущество", en: "First benefit\nSecond benefit\nThird benefit" },
  offer: { ro: "−20%", ru: "−20%", en: "−20%" },
  date: { ro: "1–31 decembrie", ru: "1–31 декабря", en: "1–31 December" },
};

const TEXT_KEYS: readonly SmartTextKey[] = ["name", "title", "company", "phone", "email", "site", "address", "headline", "subheadline", "body", "bullets", "offer", "date"];

/** The customer typed at least one detail (empty lines then close up). */
export function cardHasData(fields: StudioFields): boolean {
  return TEXT_KEYS.some((k) => (fields[k]?.trim() ?? "") !== "");
}

/** Legal forms left out of a monogram («SRL Dor de Cafea» → DC, «ООО «Аудит Эксперт»» → АЭ). */
const LEGAL_FORMS: ReadonlySet<string> = new Set(["srl", "sa", "ii", "îi", "îm", "im", "ong", "ao", "sc", "ooo", "ооо", "оао", "зао", "ао", "ип", "ltd", "llc", "inc", "gmbh"]);

const LINK_WORDS: ReadonlySet<string> = new Set(["de", "din", "la", "și", "si", "cu", "pe", "și", "и", "в", "на", "для", "of", "the", "and", "&"]);

/** Initials for a monogram: the company's, else the name's (at most 2 letters). */
export function cardInitials(fields: StudioFields): string {
  const src: string = (fields.company?.trim() || fields.name?.trim() || "").replace(/["«»„”'.,&]/g, " ");
  const all: string[] = src.split(/[\s-]+/).filter((w) => /\p{L}/u.test(w));
  // Without legal forms and small linking words («de», «și», «и», «of»): «Dor de Cafea» → DC.
  const named: string[] = all.filter((w) => !LEGAL_FORMS.has(w.toLocaleLowerCase()) && !LINK_WORDS.has(w));
  const words: string[] = named.length > 0 ? named : all;
  return words
    .slice(0, 2)
    .map((w) => [...w].find((ch) => /\p{L}/u.test(ch)) ?? "")
    .join("")
    .toLocaleUpperCase();
}

/** Lines that show: empty optional fields dropped once the customer typed something. */
export function stackRowsShown(rows: readonly TplStackRow[], fields: StudioFields): TplStackRow[] {
  if (!cardHasData(fields)) return [...rows];
  return rows.filter((r) => !r.bind || r.bind === "name" || (fields[r.bind]?.trim() ?? "") !== "");
}

/**
 * The column as text (and icon) layers. `W`, `H`: the file in mm (shares are
 * converted with them so an icon is square and the lines keep their size).
 */
export function expandStack(st: TplStack, fields: StudioFields, W: number, H: number): TplLayer[] {
  const m: number = Math.min(W, H);
  const lh: number = st.lh ?? 1.42;
  const align = st.align ?? "left";
  const rows: TplStackRow[] = stackRowsShown(st.rows, fields);
  // Heights in mm: the line box (size × line height) and the gap above it.
  const heights: number[] = rows.map((r, i) => r.size * m * lh + (i > 0 ? (r.gap ?? 0) * H : 0));
  const total: number = heights.reduce((a, b) => a + b, 0);
  const anchor = st.anchor ?? "top";
  let y: number = st.y * H - (anchor === "middle" ? total / 2 : anchor === "bottom" ? total : 0);
  const out: TplLayer[] = [];
  rows.forEach((r, i) => {
    if (i > 0) y += (r.gap ?? 0) * H;
    const sizeMm: number = r.size * m;
    const lineH: number = sizeMm * lh;
    const cyMm: number = y + lineH / 2;
    const iconMm: number = r.icon ? sizeMm * 1.05 : 0;
    const indent: number = r.icon ? iconMm + sizeMm * 0.6 : 0;
    const wMm: number = st.w * W - indent;
    const xLeft: number = align === "left" ? st.x * W + indent : align === "right" ? st.x * W - st.w * W : st.x * W - (st.w * W) / 2;
    const cx: number = (xLeft + wMm / 2) / W;
    const t: TplText = {
      k: "text",
      cx,
      cy: cyMm / H,
      w: wMm / W,
      size: r.size,
      font: r.font,
      color: r.color,
      text: r.text ?? (r.bind ? CARD_SAMPLES[r.bind] : { ro: "", ru: "", en: "" }),
      align,
      bold: r.bold ?? false,
      lh: 1.2,
      ...(r.bind ? { bind: r.bind } : {}),
      ...(r.italic ? { italic: true } : {}),
      ...(r.ls ? { ls: r.ls } : {}),
      ...(r.bindColor ? { bindColor: r.bindColor } : {}),
      ...(r.slot ? { slot: r.slot } : {}),
    };
    if (r.icon) {
      const ix: number = align === "right" ? st.x * W - iconMm : st.x * W;
      const icon: TplShape = {
        k: "shape",
        shape: r.icon,
        box: [ix / W, (cyMm - iconMm / 2) / H, iconMm / W, iconMm / H],
        fill: st.iconColor ?? r.color,
        ...(st.iconBindColor ? { bindColor: st.iconBindColor } : {}),
      };
      if (align === "right") t.cx = (st.x * W - indent - wMm / 2) / W;
      out.push(icon);
    }
    out.push(t);
    y += lineH;
  });
  return out;
}

/** The logo spot, or its stand-in once the customer typed details but has no logo. */
export function logoOrFallback(l: TplPhoto, fields: StudioFields): TplLayer[] {
  if (fields.logo || !l.fallback || !cardHasData(fields)) return [l];
  // A monogram without letters (no company, no name) would be an empty coloured disc: nothing instead.
  const ini0: string = cardInitials(fields);
  if (!ini0 && l.fallback.some((f) => f.k === "text" && f.initials)) return [];
  return l.fallback.flatMap((f) => {
    if (f.k !== "text" || !f.initials) return [f];
    const ini: string = cardInitials(fields);
    return ini ? [{ ...f, text: { ro: ini, ru: ini, en: ini } }] : [];
  });
}
