import catalogJson from "./gorFactoryCatalog.json";
import { gorFactoryModelColor } from "./gorFactory";
import { parsePrintMethods, PrintMethod } from "@/lib/stock/unified/printMethods";

/**
 * «Разобрать по моделям»: turns the unlinked lines of a Gor Factory import into
 * proposed stock items — category from the article prefix, Russian / Romanian
 * names from the English description, print methods from the category with the
 * supplier's catalogue as a check (a mug the supplier can't sublimate → UV).
 *
 * Stamina goods: one item per colour (single variant), like the existing mugs
 * and notebooks. ROLY apparel: one item per model + colour, sizes as variants.
 * Pure; the admin edits every field before anything is created.
 */

/** Model («TZ1615») → [model name, print flags]: s = sublimation, d = digital (UV), t = transfer. Built from MaestroArticulos. */
const CATALOG = catalogJson as unknown as Record<string, [string] | [string, string]>;

/** Article prefix → stock category code (codes from the migrations). */
const CATEGORY_BY_PREFIX: Readonly<Record<string, string>> = {
  TZ: "mugs",
  MD: "mugs",
  JR: "mugs",
  BI: "bottles",
  TE: "bottles",
  BO: "bags",
  MO: "bags",
  NE: "bags",
  TB: "bags",
  RN: "bags",
  NB: "notebooks",
  AG: "notebooks",
  BL: "pens",
  FT: "plush_toys",
  JU: "board_games",
  XM: "christmas",
  KO: "keychains",
  AL: "mouse_pads",
  CA: "tshirts",
  BD: "bodysuits",
  CE: "socks",
};

/** ROLY garment prefixes (code = model + size + colour); anything not mapped above goes to «Одежда». */
const APPAREL_PREFIXES: ReadonlySet<string> = new Set([
  "BA", "BE", "BM", "BN", "CA", "CB", "CC", "CE", "CG", "CH", "CJ", "CM", "CQ", "CV", "DE", "FA", "FR", "HV", "JE",
  "LG", "PA", "PC", "PK", "PO", "RA", "RD", "RI", "SM", "SS", "SU", "BD",
]);

export const FALLBACK_CATEGORY_CODE = "misc_goods";
export const APPAREL_CATEGORY_CODE = "apparel";

type RuGender = "m" | "f" | "n" | "p";
type RoGender = "m" | "f";

interface TypeWord {
  en: string[];
  ru: string;
  ruGender: RuGender;
  ro: string;
  roGender: RoGender;
  enName: string;
}

/** Longest English phrases first; matched as whole words anywhere in the description. */
const TYPE_WORDS: readonly TypeWord[] = [
  { en: ["SUBLIMATION MUG"], ru: "Кружка", ruGender: "f", ro: "Cană", roGender: "f", enName: "Mug" },
  { en: ["TOILET BAG"], ru: "Косметичка", ruGender: "f", ro: "Trusă cosmetică", roGender: "f", enName: "Toilet bag" },
  { en: ["FLUSH TOY", "PLUSH TOY"], ru: "Мягкая игрушка", ruGender: "f", ro: "Jucărie de pluș", roGender: "f", enName: "Plush toy" },
  { en: ["TEDDY BEAR"], ru: "Мишка", ruGender: "m", ro: "Ursuleț", roGender: "m", enName: "Teddy bear" },
  { en: ["GAMES SET", "GAME SET"], ru: "Набор игр", ruGender: "m", ro: "Set de jocuri", roGender: "m", enName: "Game set" },
  { en: ["TIC-TAC-TOE"], ru: "Крестики-нолики", ruGender: "p", ro: "X și 0", roGender: "m", enName: "Tic-tac-toe" },
  { en: ["MEASURING TAPE"], ru: "Рулетка", ruGender: "f", ro: "Ruletă", roGender: "f", enName: "Measuring tape" },
  { en: ["CHRISTMAS MAGNET"], ru: "Новогодний магнит", ruGender: "m", ro: "Magnet de Crăciun", roGender: "m", enName: "Christmas magnet" },
  { en: ["ORNAMENT PHOTO FRAME"], ru: "Ёлочная фоторамка", ruGender: "f", ro: "Ramă foto de brad", roGender: "f", enName: "Ornament photo frame" },
  { en: ["PHOTO FRAME"], ru: "Фоторамка", ruGender: "f", ro: "Ramă foto", roGender: "f", enName: "Photo frame" },
  { en: ["WOMAN SWEATSHIRT"], ru: "Женский свитшот", ruGender: "m", ro: "Hanorac damă", roGender: "m", enName: "Women's sweatshirt" },
  { en: ["SPORT SET"], ru: "Спортивный костюм", ruGender: "m", ro: "Set sport", roGender: "m", enName: "Sport set" },
  { en: ["POLO SHIRT"], ru: "Поло", ruGender: "n", ro: "Tricou polo", roGender: "m", enName: "Polo shirt" },
  { en: ["T-SHIRT"], ru: "Футболка", ruGender: "f", ro: "Tricou", roGender: "m", enName: "T-shirt" },
  { en: ["SWEATSHIRT"], ru: "Свитшот", ruGender: "m", ro: "Hanorac", roGender: "m", enName: "Sweatshirt" },
  { en: ["SHORTS"], ru: "Шорты", ruGender: "p", ro: "Pantaloni scurți", roGender: "m", enName: "Shorts" },
  { en: ["NOTEBOOK"], ru: "Блокнот", ruGender: "m", ro: "Blocnotes", roGender: "m", enName: "Notebook" },
  { en: ["BOTTLE"], ru: "Бутылка", ruGender: "f", ro: "Sticlă", roGender: "f", enName: "Bottle" },
  { en: ["MUG"], ru: "Кружка", ruGender: "f", ro: "Cană", roGender: "f", enName: "Mug" },
  { en: ["BAG"], ru: "Сумка", ruGender: "f", ro: "Geantă", roGender: "f", enName: "Bag" },
  { en: ["CARDS"], ru: "Игральные карты", ruGender: "p", ro: "Cărți de joc", roGender: "f", enName: "Playing cards" },
  { en: ["GAME"], ru: "Игра", ruGender: "f", ro: "Joc", roGender: "m", enName: "Game" },
];

interface ColorWord {
  en: string;
  /** Masculine form; other genders are inflected, unless `ruFixed`. */
  ru: string;
  ruFixed?: boolean;
  roM: string;
  roF: string;
}

const COLOR_WORDS: readonly ColorWord[] = [
  { en: "LIGHT ROYAL BLUE", ru: "голубой", roM: "albastru deschis", roF: "albastră deschis" },
  { en: "ROYAL BLUE", ru: "синий", roM: "albastru", roF: "albastră" },
  { en: "NAVY BLUE", ru: "тёмно-синий", roM: "bleumarin", roF: "bleumarin" },
  { en: "FERN GREEN", ru: "зелёный", roM: "verde", roF: "verde" },
  { en: "OASIS GREEN", ru: "бирюзовый", roM: "turcoaz", roF: "turcoaz" },
  { en: "BLACK", ru: "чёрный", roM: "negru", roF: "neagră" },
  { en: "WHITE", ru: "белый", roM: "alb", roF: "albă" },
  { en: "RED", ru: "красный", roM: "roșu", roF: "roșie" },
  { en: "YELLOW", ru: "жёлтый", roM: "galben", roF: "galbenă" },
  { en: "BLUE", ru: "синий", roM: "albastru", roF: "albastră" },
  { en: "GREEN", ru: "зелёный", roM: "verde", roF: "verde" },
  { en: "ORANGE", ru: "оранжевый", roM: "portocaliu", roF: "portocalie" },
  { en: "PINK", ru: "розовый", roM: "roz", roF: "roz" },
  { en: "SILVER", ru: "серебристый", roM: "argintiu", roF: "argintie" },
  { en: "GOLD", ru: "золотой", roM: "auriu", roF: "aurie" },
  { en: "NATURAL", ru: "натуральный", roM: "natural", roF: "naturală" },
  { en: "GREIGE", ru: "серо-бежевый", roM: "greige", roF: "greige" },
  { en: "BEIGE", ru: "бежевый", roM: "bej", roF: "bej" },
  { en: "GREY", ru: "серый", roM: "gri", roF: "gri" },
  { en: "CHERRY", ru: "вишнёвый", roM: "vișiniu", roF: "vișinie" },
  { en: "OLIVE", ru: "оливковый", roM: "oliv", roF: "oliv" },
  { en: "COFFEE", ru: "кофейный", roM: "cafeniu", roF: "cafenie" },
  { en: "ALMOND", ru: "миндальный", roM: "migdală", roF: "migdală" },
  { en: "BROWN", ru: "коричневый", roM: "maro", roF: "maro" },
  { en: "PURPLE", ru: "фиолетовый", roM: "mov", roF: "mov" },
  { en: "TRANSPARENT", ru: "прозрачный", roM: "transparent", roF: "transparentă" },
  { en: "KHAKI", ru: "хаки", ruFixed: true, roM: "kaki", roF: "kaki" },
  // Shapes / figures used as the «colour» of some Stamina models.
  { en: "STAR", ru: "звезда", ruFixed: true, roM: "stea", roF: "stea" },
  { en: "TREE", ru: "ёлка", ruFixed: true, roM: "brad", roF: "brad" },
  { en: "BOOT", ru: "сапожок", ruFixed: true, roM: "cizmă", roF: "cizmă" },
  { en: "LION", ru: "лев", ruFixed: true, roM: "leu", roF: "leu" },
  { en: "PIG", ru: "свинка", ruFixed: true, roM: "porc", roF: "porc" },
  { en: "ELEPHANT", ru: "слон", ruFixed: true, roM: "elefant", roF: "elefant" },
  { en: "COW", ru: "корова", ruFixed: true, roM: "vacă", roF: "vacă" },
  { en: "PANDA", ru: "панда", ruFixed: true, roM: "panda", roF: "panda" },
  { en: "GIRAFFE", ru: "жираф", ruFixed: true, roM: "girafă", roF: "girafă" },
];

/** «чёрный» → «чёрная» / «чёрное» / «чёрные»; each part of «тёмно-синий» is left as is but the last. */
export function inflectRuAdjective(masculine: string, gender: RuGender): string {
  if (gender === "m") return masculine;
  const m = /^(.*?)(ый|ий|ой)$/.exec(masculine);
  if (!m) return masculine;
  const [, stem, ending] = m as unknown as [string, string, string];
  // After г/к/х/ж/ш/ч/щ the soft forms use «и».
  const soft: boolean = ending === "ий" && !/[гкхжшчщ]$/.test(stem);
  const forms: Record<Exclude<RuGender, "m">, string> = soft
    ? { f: "яя", n: "ее", p: "ие" }
    : { f: "ая", n: /[жшчщ]$/.test(stem) && ending !== "ой" ? "ее" : "ое", p: /[гкхжшчщ]$/.test(stem) ? "ие" : "ые" };
  return stem + forms[gender];
}

function hasPhrase(words: string[], phrase: string[]): number {
  for (let i = 0; i + phrase.length <= words.length; i++) {
    if (phrase.every((p, j) => words[i + j] === p)) return i;
  }
  return -1;
}

export interface ParsedDescription {
  type: TypeWord | null;
  model: string;
  /** Colour words in description order («WHITE/BLACK» → two). */
  colors: ColorWord[];
  /** ROLY size after «S/» («M», «XXL»), else null. */
  size: string | null;
  /** Raw colour text («WHITE/BLACK»), for the variant label fallback. */
  colorText: string;
}

/** «MUG NEVEX BLACK», «AKEBIA MUG WHITE/YELLOW», «DOGO PREMIUM T-SHIRT S/XL WHITE». */
export function parseGorDescription(description: string, modelName: string | null): ParsedDescription {
  let rest: string = description.toUpperCase().replace(/\s+/g, " ").trim();
  let size: string | null = null;
  const sizeMatch = /(?:^| )S\/(\S+)(?= |$)/.exec(rest);
  if (sizeMatch) {
    size = sizeMatch[1]!;
    rest = (rest.slice(0, sizeMatch.index) + " " + rest.slice(sizeMatch.index + sizeMatch[0].length)).trim();
  }
  let words: string[] = rest.split(" ").filter(Boolean);

  let type: TypeWord | null = null;
  outer: for (const t of TYPE_WORDS) {
    for (const phrase of t.en) {
      const p: string[] = phrase.split(" ");
      const at: number = hasPhrase(words, p);
      if (at >= 0) {
        type = t;
        words = [...words.slice(0, at), ...words.slice(at + p.length)];
        break outer;
      }
    }
  }

  // Colour: the trailing words; «WHITE/BLACK» splits on «/».
  const colors: ColorWord[] = [];
  let colorText = "";
  const tail: string[] = [];
  while (words.length > 0) {
    let matched = false;
    for (let n = Math.min(3, words.length); n >= 1; n--) {
      const phrase: string = words.slice(words.length - n).join(" ");
      const parts: string[] = phrase.split("/");
      const found: (ColorWord | undefined)[] = parts.map((part) => COLOR_WORDS.find((c) => c.en === part));
      if (found.every((f): f is ColorWord => f != null)) {
        colors.unshift(...found);
        tail.unshift(phrase);
        words = words.slice(0, words.length - n);
        matched = true;
        break;
      }
    }
    if (!matched) break;
  }
  colorText = tail.join(" ");

  let model: string = words.join(" ").trim();
  if (modelName && modelName.trim()) {
    const known: string = modelName.trim().toUpperCase();
    if (model.includes(known)) model = known;
  }
  return { type, model, colors, size, colorText };
}

function ruColor(colors: ColorWord[], gender: RuGender): string {
  return colors.map((c) => (c.ruFixed ? c.ru : inflectRuAdjective(c.ru, gender))).join("/");
}

function roColor(colors: ColorWord[], gender: RoGender): string {
  return colors.map((c) => (gender === "f" ? c.roF : c.roM)).join("/");
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

export interface ProposedNames {
  nameRu: string;
  nameRo: string;
  nameEn: string;
  /** Variant colour in Russian (masculine, as stock options keep it), or null. */
  colorRu: string | null;
}

export function proposeNames(parsed: ParsedDescription, fallback: string): ProposedNames {
  const colorRu: string | null = parsed.colors.length > 0 ? ruColor(parsed.colors, "m") : null;
  if (!parsed.type || !parsed.model) {
    return { nameRu: fallback, nameRo: fallback, nameEn: fallback, colorRu };
  }
  const t: TypeWord = parsed.type;
  const ru: string = [t.ru, parsed.model, parsed.colors.length ? ruColor(parsed.colors, t.ruGender) : ""].filter(Boolean).join(" ");
  const ro: string = [t.ro, parsed.model, parsed.colors.length ? roColor(parsed.colors, t.roGender) : ""].filter(Boolean).join(" ");
  const en: string = [t.enName, parsed.model, parsed.colorText ? titleCase(parsed.colorText) : ""].filter(Boolean).join(" ");
  return { nameRu: ru, nameRo: ro, nameEn: en, colorRu };
}

export interface ProposalLine {
  id: string;
  supplierCode: string;
  description: string;
}

export interface ProposalCategory {
  id: string;
  code: string;
  printMethods: readonly string[];
}

export interface ProposedVariant {
  lineId: string;
  sku: string;
  supplierCode: string;
  label: string | null;
  options: { color?: string; size?: string };
}

export interface ItemProposal {
  /** Stable key: item SKU. */
  key: string;
  categoryId: string | null;
  categoryCode: string;
  sku: string;
  nameRu: string;
  nameRo: string;
  nameEn: string;
  /** Own print methods; [] = the category's. */
  printMethods: PrintMethod[];
  /** Why the methods differ from the category, for the admin («поставщик: нет сублимации»). */
  printNote: "no_sublimation" | null;
  /** Article whose photo the item takes. */
  photoCode: string;
  variants: ProposedVariant[];
}

function prefixOf(code: string): string {
  return code.trim().toUpperCase().slice(0, 2);
}

/** Model key in the catalogue: prefix + 4 digits («TZ1615»). */
export function gorModelKey(code: string): string | null {
  const m = /^([A-Z]{2}\d{4})/.exec(code.trim().toUpperCase());
  return m ? m[1]! : null;
}

export function categoryCodeForGorCode(code: string): string {
  const prefix: string = prefixOf(code);
  return CATEGORY_BY_PREFIX[prefix] ?? (APPAREL_PREFIXES.has(prefix) ? APPAREL_CATEGORY_CODE : FALLBACK_CATEGORY_CODE);
}

function isApparel(code: string): boolean {
  return APPAREL_PREFIXES.has(prefixOf(code));
}

/**
 * Own print methods for an item: the category's, except that a sublimation
 * category gets UV instead when the supplier's catalogue lists the model
 * without sublimation (coloured / pad-printed mugs).
 */
export function proposePrintMethods(
  categoryMethods: readonly string[],
  catalogFlags: string | null,
): { methods: PrintMethod[]; note: ItemProposal["printNote"] } {
  const base: PrintMethod[] = parsePrintMethods(categoryMethods);
  if (catalogFlags == null || !base.includes(PrintMethod.Sublimation) || catalogFlags.includes("s")) {
    return { methods: [], note: null };
  }
  const replaced: PrintMethod[] = parsePrintMethods([...base.filter((m) => m !== PrintMethod.Sublimation), PrintMethod.Uv]);
  return { methods: replaced, note: "no_sublimation" };
}

/** One proposal per Stamina line; ROLY lines of one model + colour share an item with size variants. */
export function proposeImportItems(
  lines: readonly ProposalLine[],
  categories: readonly ProposalCategory[],
): ItemProposal[] {
  const byCode = new Map<string, ProposalCategory>(categories.map((c) => [c.code, c]));
  const out: ItemProposal[] = [];
  const apparelByKey = new Map<string, ItemProposal>();

  for (const line of lines) {
    const code: string = line.supplierCode.trim().toUpperCase();
    const modelKey: string | null = gorModelKey(code);
    const entry = modelKey ? CATALOG[modelKey] : undefined;
    const parsed: ParsedDescription = parseGorDescription(line.description, entry?.[0] ?? null);
    const names: ProposedNames = proposeNames(parsed, line.description.trim());
    const categoryCode: string = categoryCodeForGorCode(code);
    const category: ProposalCategory | undefined = byCode.get(categoryCode);
    // No flags in the file = «no print listed», which is still known; a model missing from the file is unknown.
    const flags: string | null = entry ? (entry[1] ?? "") : null;
    const print = proposePrintMethods(category?.printMethods ?? [], flags);

    if (isApparel(code)) {
      const mc = gorFactoryModelColor(code);
      const itemSku: string = mc && modelKey ? `${modelKey}-${mc.color}` : code;
      const size: string | null = parsed.size;
      const variant: ProposedVariant = {
        lineId: line.id,
        sku: code,
        supplierCode: code,
        label: [names.colorRu, size].filter(Boolean).join(" / ") || null,
        options: { ...(names.colorRu ? { color: names.colorRu } : {}), ...(size ? { size } : {}) },
      };
      const existing: ItemProposal | undefined = apparelByKey.get(itemSku);
      if (existing) {
        existing.variants.push(variant);
        continue;
      }
      const proposal: ItemProposal = {
        key: itemSku,
        categoryId: category?.id ?? null,
        categoryCode,
        sku: itemSku,
        nameRu: names.nameRu,
        nameRo: names.nameRo,
        nameEn: names.nameEn,
        printMethods: print.methods,
        printNote: print.note,
        photoCode: code,
        variants: [variant],
      };
      apparelByKey.set(itemSku, proposal);
      out.push(proposal);
      continue;
    }

    out.push({
      key: code,
      categoryId: category?.id ?? null,
      categoryCode,
      sku: code,
      nameRu: names.nameRu,
      nameRo: names.nameRo,
      nameEn: names.nameEn,
      printMethods: print.methods,
      printNote: print.note,
      photoCode: code,
      variants: [{ lineId: line.id, sku: code, supplierCode: code, label: null, options: {} }],
    });
  }
  return out;
}
