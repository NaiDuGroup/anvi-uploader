/**
 * Fills a mug's 3D look (colours, finish, bottom gradient, shape) from what we
 * already know about it, so 44+ catalog rows don't have to be set by hand:
 *
 * - Supplier catalog (Gor Factory: Stamina / ROLY): exact height, diameter and
 *   the colour's HEX («#FFFFFF/#000000» for two-tone articles).
 * - Supplier description: where the colour goes («Colour base», «Interior and
 *   handle in colour», «Glitter-effect»…).
 * - Our own names (ru / ro / en): «с голубой внутренней частью и ручкой-сердечком»,
 *   «Розовая матовая», «с фиолетовым ободком», «450ml», «термос»…
 *
 * Photos are not used: a white mug on a white studio background can't be told
 * apart reliably. The result is a suggestion: the admin checks the 3D preview
 * and saves.
 *
 * Browser-safe and pure (the API route supplies the supplier data).
 */
import type { MugFinish } from "./mugSurface";
import { MUG_SHAPE_DEFAULTS, MUG_SHAPE_PRESETS, type MugHandleStyle, type MugShape } from "./mugShape";

export type MugAutofillInput = {
  names: string[];
  /** Supplier / item descriptions in any language. */
  descriptions?: string[];
  sku?: string;
  supplier?: MugSupplierFacts | null;
};

export type MugSupplierFacts = {
  heightCm: number | null;
  diameterCm: number | null;
  /** Catalog HEX: «#DC002E» or two-tone «#FFFFFF/#000000» (base / accent). */
  colorHex: string | null;
};

export type MugAutofillFields = {
  bodyColorHex: string;
  handleColorHex: string;
  innerColorHex: string | null;
  rimColorHex: string | null;
  finish: MugFinish;
  gradientColorHex: string | null;
  gradientHeightPct: number;
} & MugShape;

/** What the suggestion is based on and what it can't show, for the admin. */
export type MugAutofillNote =
  | "supplier_size"
  | "supplier_color"
  | "name_color"
  | "no_color"
  | "spoon"
  | "marble"
  | "decor";

export type MugAutofillResult = { fields: MugAutofillFields; notes: MugAutofillNote[] };

const WHITE = "#ffffff";
const GRADIENT_HEIGHT_PCT = 30;

/**
 * Colour words → HEX. Order matters: «серебр» before «сер», «голуб» before «син»,
 * multi-word phrases before single words.
 */
const COLOR_WORDS: readonly [RegExp, string][] = [
  [/серебр|silver|argint/, "#c4c6c8"],
  [/золот|gold|aur/, "#c9a33a"],
  [/бирюз|turquoise|turcoaz/, "#2bb5b0"],
  [/голуб|light blue|sky blue|bleu|albastr\S* deschis/, "#6cb4e4"],
  [/(?:^|[^а-яё])син|navy|blue|albastr/, "#1f4fa3"],
  [/фиолет|сирен|purple|violet|\bmov/, "#7b4fa0"],
  [/розов|pink|\broz/, "#f2a7bb"],
  [/красн|\bred\b|roș|ros[iu]/, "#c8102e"],
  [/оранж|orange|portocal/, "#f08927"],
  [/жёлт|желт|yellow|galben/, "#f2c200"],
  [/салатов|лайм|lime/, "#a5c95a"],
  [/зел[её]н|green|verde/, "#2e9b4a"],
  [/коричн|brown|maro/, "#6b4226"],
  [/(?:^|[^а-яё])сер(?:ый|ая|ой|ого|ую|ое)|grey|gray|\bgri/, "#8a8a8a"],
  [/ч[её]рн|black|negr/, "#1c1c1c"],
  [/(?:^|[^а-яё])бел|white|\balb/, WHITE],
];

function colorWord(text: string): string | null {
  for (const [re, hex] of COLOR_WORDS) if (re.test(text)) return hex;
  return null;
}

/** First colour word that is not white (the accent); falls back to white. */
export function accentColor(text: string): string | null {
  const nonWhite = COLOR_WORDS.filter(([, hex]) => hex !== WHITE);
  let best: { at: number; hex: string } | null = null;
  for (const [re, hex] of nonWhite) {
    const m = re.exec(text);
    if (m && (best == null || m.index < best.at)) best = { at: m.index, hex };
  }
  return best?.hex ?? colorWord(text);
}

function lighten(hex: string, share: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const c = (n >> shift) & 255;
    return Math.round(c + (255 - c) * share)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

function normaliseHex(hex: string): string | null {
  const h = hex.trim();
  return /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : null;
}

/** «#FFFFFF/#000000» → base white + accent black; «#DC002E» → accent only. */
function splitSupplierHex(raw: string | null | undefined): { base: string | null; accent: string | null } {
  if (!raw) return { base: null, accent: null };
  const parts = raw
    .split("/")
    .map(normaliseHex)
    .filter((h): h is string => h != null);
  if (parts.length >= 2) return { base: parts[0]!, accent: parts[1]! };
  return { base: null, accent: parts[0] ?? null };
}

function volumeMl(text: string, sku: string): number | null {
  const m = /(\d{2,3})\s*(?:мл|ml)(?![a-zа-яё])/.exec(text) ?? /-(\d{2,3})$/.exec(sku);
  return m ? Number(m[1]) : null;
}

function shapeFor(text: string, sku: string, supplier: MugSupplierFacts | null | undefined): {
  shape: Omit<MugShape, "handleStyle">;
  fromSupplier: boolean;
} {
  const preset = (key: string) => MUG_SHAPE_PRESETS.find((p) => p.key === key)!.shape;
  if (supplier?.heightCm && supplier.diameterCm) {
    return {
      shape: { bodyHeightCm: supplier.heightCm, topDiameterCm: supplier.diameterCm, bottomDiameterCm: supplier.diameterCm },
      fromSupplier: true,
    };
  }
  const pick = (s: MugShape) => ({
    shape: { bodyHeightCm: s.bodyHeightCm, topDiameterCm: s.topDiameterCm, bottomDiameterCm: s.bottomDiameterCm },
    fromSupplier: false,
  });
  if (/термос|thermos|termos|tumbler/.test(text)) return pick(preset("tumbler"));
  if (/металлическ|эмал|enamel|emailat|metal mug|cană metalic/.test(text)) return pick(preset("enamel"));
  if (/конус|conical|latte|conic/.test(text)) return pick(preset("conical"));
  const ml = volumeMl(text, sku);
  if (ml != null && ml <= 150) return pick({ ...MUG_SHAPE_DEFAULTS, bodyHeightCm: 6, topDiameterCm: 6, bottomDiameterCm: 6 });
  if (ml != null && ml >= 480) return pick({ ...MUG_SHAPE_DEFAULTS, bodyHeightCm: 13, topDiameterCm: 9, bottomDiameterCm: 9 });
  if ((ml != null && ml >= 400) || /больш|large|mare\b/.test(text)) return pick(preset("tall450"));
  return pick(MUG_SHAPE_DEFAULTS);
}

function handleStyleFor(text: string): MugHandleStyle {
  if (/термос|thermos|termos|tumbler/.test(text)) return "none";
  if (/сердеч|heart|inim/.test(text)) return "heart";
  return "classic";
}

function finishFor(text: string): MugFinish {
  if (/бл[её]ст|glitter|sclipic|sparkl|brokat/.test(text)) return "glitter";
  if (/серебр|золот|silver|gold|argint|aur|mirror|metallic|металлик|термос|thermos/.test(text)) return "metallic";
  if (/матов|(?:^|[^а-яё])мат(?:[^а-яё]|$)|\bmatt?e?\b|\bmat[ăa](?![a-z])|magic|магик/.test(text)) return "matte";
  return "glossy";
}

/** Guess the 3D look of a mug from supplier facts and names. */
export function autofillMug(input: MugAutofillInput): MugAutofillResult {
  const names = input.names.map((n) => n.toLowerCase()).join(" | ");
  const desc = (input.descriptions ?? []).map((d) => d.toLowerCase()).join(" | ");
  const text = `${names} | ${desc}`;
  const sku = (input.sku ?? "").trim().toUpperCase();
  const notes: MugAutofillNote[] = [];

  const { shape, fromSupplier } = shapeFor(text, sku, input.supplier);
  if (fromSupplier) notes.push("supplier_size");
  const handleStyle = handleStyleFor(text);
  const finish = finishFor(text);

  // The mug's own colour: supplier HEX first, then a colour word in the names.
  const supplierHex = splitSupplierHex(input.supplier?.colorHex);
  const nameAccent = accentColor(names);
  // Without a colour word: thermo-magic mugs are black, steel thermoses silver.
  const implied: string | null = /magic|магик/.test(text)
    ? "#1c1c1c"
    : /термос|thermos|termos/.test(text)
      ? "#c4c6c8"
      : null;
  const accent: string | null = supplierHex.accent ?? nameAccent ?? implied;
  if (supplierHex.accent) notes.push("supplier_color");
  else if (nameAccent) notes.push("name_color");
  else if (!implied) notes.push("no_color");
  const base: string = supplierHex.base ?? WHITE;
  const c: string = accent ?? WHITE;

  // «matte outside … with a matching colour interior» (Buks): the whole mug is in the colour.
  const all = /полностью|fully|complet|all[- ]over|matching colou?r interior|соответствующ\S* цвет\S* интерьер/.test(text);
  const gradient = /цветн\S* (?:основани|низ|дно)|colou?r(?:ed)? base|gradient|градиент|baz[ăa] colorat/.test(text);
  const inside = /внутр|интерьер|interior|inside/.test(text);
  const handleToo =
    /(?:внутр\S*(?: част\S*)?|interior|inside)\s+(?:и|and|și|si)\s+(?:ручк|handle|mâner|maner)/.test(text) ||
    /handle in colou?r|ручк\S* в цвет/.test(text);
  const rim = /ободк|ободок|кант|\brim\b|margine|buz/.test(text);
  const shiny = finish === "metallic" || finish === "glitter";

  let bodyColorHex = base;
  let handleColorHex = base;
  let innerColorHex: string | null = null;
  let rimColorHex: string | null = null;
  let gradientColorHex: string | null = null;

  if (all) {
    bodyColorHex = handleColorHex = c;
    innerColorHex = c;
  } else if (gradient && accent) {
    gradientColorHex = c;
  } else if ((inside || rim) && accent) {
    if (inside) innerColorHex = c;
    if (rim) rimColorHex = c;
    if (handleToo) handleColorHex = c;
  } else if (accent && supplierHex.base) {
    // Two-tone supplier article without a hint where the accent goes: on
    // these mugs it is the inside (Akebia).
    innerColorHex = c;
  } else if (accent) {
    // Plain coloured mug: body and handle in the colour. Metallic and glitter
    // coatings are outside only — the inside stays white ceramic.
    bodyColorHex = handleColorHex = c;
    innerColorHex = shiny ? WHITE : null;
  }

  if (/мрамор|marble|marmur/.test(text)) {
    notes.push("marble");
    // Marble is mostly white with coloured veins: a pale tint reads closer than the full colour.
    if (accent && bodyColorHex === c) bodyColorHex = handleColorHex = lighten(c, 0.65);
  }
  if (/ложк|spoon|lingur/.test(text)) notes.push("spoon");
  if (/футбол|football|happy birthday|love|мяч/.test(text)) notes.push("decor");

  return {
    fields: {
      bodyColorHex,
      handleColorHex,
      innerColorHex,
      rimColorHex,
      finish,
      gradientColorHex,
      gradientHeightPct: GRADIENT_HEIGHT_PCT,
      ...shape,
      handleStyle,
    },
    notes,
  };
}
