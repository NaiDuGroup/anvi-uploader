/**
 * «Подсказка типа» in the staff / dealer order wizard. Staff often log anything
 * unclear as «Печать на бумаге» (`paper_print`) and describe the real product
 * in the order comment or the file name — DTF T-shirts, sticker sheets,
 * business cards, invitations, Oracal… This module reads that text and says
 * which product type the line most likely is, plus what can safely be
 * prefilled after switching (quantity, sticker shape/size, postcard size,
 * paper weight). Pure: the wizard and the tests share it; it never switches a
 * line by itself.
 *
 * Tuned on 11 397 prod `paper_print` lines (2026-03…11) to favour precision:
 * only distinctive words count, document-printing words silence the hint, and
 * the file name of the row outranks the order comment (which is shared by
 * every row of the order).
 */

/** Line types a hint can point at; `set` = pen + notebook + mug gift set (text only). */
export type TypeHintTarget =
  | "dtf_apparel"
  | "sticker_sheet"
  | "uv_dtf"
  | "uv_print"
  | "large_format_print"
  | "business_card"
  | "flyer"
  | "postcard"
  | "mug"
  | "notebook"
  | "pen"
  | "set";

export interface TypeHint {
  target: TypeHintTarget;
  /** Higher = more sure; file-name matches weigh more than the order comment. */
  score: number;
  /** Where the words were found. */
  source: "file" | "notes";
}

export interface TypeHintInput {
  /** Order comment (shared by every row of the order). */
  notes?: string | null;
  /** File name(s) / link of this row. */
  fileNames?: readonly (string | null | undefined)[];
}

export type PostcardHintPurpose = "postcard" | "invitation" | "diploma" | "certificate" | "voucher" | "card" | "bookmark";

/** What the switched line can start with. Every field is optional — only what the text says. */
export interface TypeHintPrefill {
  quantity?: number;
  /** Paper weight (g/m²) for sheet products. */
  gsm?: number;
  /** Sticker sheets. */
  stickerShape?: "circle" | "rect" | "contour";
  stickerWidthMm?: number;
  stickerHeightMm?: number;
  /** Postcards. */
  postcardPurpose?: PostcardHintPurpose;
  /** Postcard preset id (`pc_a6`, `pc_a5`, …). */
  postcardPresetId?: string;
  /** Free finished size (cm) when no preset fits. */
  trimWidthCm?: number;
  trimHeightCm?: number;
  creaseLines?: number;
  twoSided?: boolean;
  /** Large format print size (cm). */
  lfWidthCm?: number;
  lfHeightCm?: number;
}

/** Lowercase, Romanian diacritics and ё folded, file separators → spaces. */
export function normalizeHintText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[șş]/g, "s")
    .replace(/[țţ]/g, "t")
    .replace(/[ăâ]/g, "a")
    .replace(/î/g, "i")
    .replace(/[_+]/g, " ")
    // Cyrillic «А4» / «А2» typed on a Russian keyboard → Latin.
    .replace(/(^|[^a-zа-я])а(?=\s?[0-6](?![0-9]))/g, "$1a")
    .replace(/\s+/g, " ")
    .trim();
}

// Word start / end for mixed Cyrillic + Latin text (`\b` is ASCII-only in JS).
const B = "(?<![a-zа-я0-9])";
const E = "(?![a-zа-я0-9])";

const UV_DTF = new RegExp(`${B}(uv[ .-]?dtf|uvdtf|уф[ .-]?дтф|ув[ .-]?дтф|uv[ .-]?дтф)`);

/** Garments and textile items (DTF without the word «DTF»). */
const APPAREL_WORDS =
  `футболк|майк|шорт[ыа]|худи|hoodie|свитшот|sweatshirt|tricou|tricour|maiou|maieu|hanorac|термоперенос|polyflex|polifleks|кепк|sapc[ai]|sapca|шопер|шоппер|ecobag|eco bag|rucsac|рюкзак|носк|sosete|боди${E}|bodi${E}|body${E}`;
const APPAREL = new RegExp(`${B}(${APPAREL_WORDS})`);

/**
 * Keyword sets per target. Stems are matched from a word start; `E` closes
 * short Latin words that would otherwise hit longer ones (pix → pixel).
 */
const RULES: readonly { target: Exclude<TypeHintTarget, "set">; re: RegExp }[] = [
  { target: "uv_dtf", re: UV_DTF },
  {
    target: "dtf_apparel",
    re: new RegExp(
      `${B}(dtf|дтф|${APPAREL_WORDS})`,
    ),
  },
  {
    target: "sticker_sheet",
    re: new RegExp(
      `${B}(накле[йи]к|стикер|sticker|stiker|stichere|stickere|autocolant|самоклей|samoklei|naklei[kc])`,
    ),
  },
  {
    target: "large_format_print",
    re: new RegExp(
      `${B}(ватман|vatman|oracal|orakal|оракал|баннер|banner|холст|canvas|panza|roll ?up|ролл ?ап|a[012]${E}|ф[ао]рмат a[012]${E}|экосольв|ecosolv)`,
    ),
  },
  { target: "business_card", re: new RegExp(`${B}(визитк|визиток|vizitk|vizitok|carti de vizita|cartile de vizita|business ?cards?${E})`) },
  { target: "flyer", re: new RegExp(`${B}(флаер|флайер|листовк|flyer|flayer|flaier|fluturas)`) },
  {
    target: "postcard",
    re: new RegExp(
      `${B}(открытк|otkrytk|приглашени|приглашалк|invitati|invitatii|диплом(?!н)|diplom[ae]${E}|diplomele|грамот|сертификат|ваучер|voucher|закладк|semn de carte|bookmark|биговк|бигов|беговк|begovk|bigovk|felicitar[ei]|card postal|carte postala|postcard)`,
    ),
  },
  { target: "uv_print", re: new RegExp(`${B}(оргстекл|орг ?стекл|orgstekl|orgstecl|org ?stekl|ork ?stekl|plexi|плекси|акрил|acril|dibond|dibont|дибонд|дибонт|табличк|tablit|tablick|tablichk|(?:plastic|пластик[а-я]*)(?: de)? ?\\d ?(?:mm|мм)|uv pe |imprimare pe album|pe album|rama de lemn|уф печат|уф-печат|uv печат|imprimare uv|печать uv|печать уф|sticla organica)`) },
  { target: "mug", re: new RegExp(`${B}(кружк|чашк|cana${E}|cani${E}|cane${E}|cana cu|mugs?${E}|halb[ae]${E})`) },
  { target: "notebook", re: new RegExp(`${B}(блокнот|ежедневник|carnet|carnete|notebook|agend[ae]${E}|planner|planificator)`) },
  { target: "pen", re: new RegExp(`${B}(ручк|pi+x+${E}|pixuri|pixul|pixurile)`) },
];

/** Words of plain document printing / binding: the line really is paper print. */
const DOC_WORDS = new RegExp(
  `${B}(документ|паспорт|ксерокс|ксерокоп|скан|договор|contract|buletin|pasaport|xerox|copie|scan|курсов|дипломн|реферат|teza|teze|licenta|lucrare de|proiect de diploma|diploma de|certificat de|переплет|spiral|пружин|copertare|referat|календар|calendar)`,
);

/**
 * Contour cutting alone: stickers — unless a paper weight is named, then it is
 * a figured-cut card («300 гр с резкой по контуру» → «Открытки и карточки»).
 */
const CONTOUR_CUT = new RegExp(
  `${B}(decupat[ea]? pe contur|taiere pe contur|taiat[ea]? pe contur|tairea? pe contur|cu taiere|по контуру|контурн[а-я]* резк|плотерн[а-я]* резк|высечк)`,
);

/** A mug's «ручка» is its handle: with a mug in the text, ручк is not a pen. */
const RUCHKA = new RegExp(`${B}ручк`);

function matchTargets(text: string): Set<Exclude<TypeHintTarget, "set">> {
  const out = new Set<Exclude<TypeHintTarget, "set">>();
  if (!text || DOC_WORDS.test(text)) return out;
  const hasUvDtf = new RegExp(UV_DTF.source).test(text);
  // «UV-DTF наклейки» is UV-DTF; take it out before looking for DTF / stickers.
  const rest = hasUvDtf ? text.replace(new RegExp(UV_DTF.source, "g"), " ") : text;
  if (hasUvDtf) out.add("uv_dtf");
  for (const { target, re } of RULES) {
    if (target === "uv_dtf") continue;
    if (re.test(rest)) out.add(target);
  }
  if (!out.has("sticker_sheet") && CONTOUR_CUT.test(rest) && parseGsm(rest) == null) out.add("sticker_sheet");
  if (out.has("mug") && out.has("pen") && RUCHKA.test(rest) && !new RegExp(`${B}(pix|pixuri|pixul)`).test(rest)) {
    out.delete("pen");
  }
  // Oracal / window film / UV-DTF «stickers» are not sheet stickers.
  if (out.has("sticker_sheet") && (out.has("large_format_print") || out.has("uv_dtf"))) out.delete("sticker_sheet");
  if (out.has("dtf_apparel") && out.has("uv_dtf")) out.delete("dtf_apparel");
  return out;
}

/** Heavy paper with a cut size / run: a «Открытки и карточки» job even without a product word. */
function heavyCutPaper(text: string): boolean {
  if (DOC_WORDS.test(text)) return false;
  const gsm = parseGsm(text);
  if (gsm == null || gsm < 200) return false;
  return /\d\s*(шт|buc|штук|bucati)|(?<![a-zа-я0-9])(a5|a6|dl|10 ?x ?15|\d+(?:[.,]\d+)? ?(?:x|х|\*) ?\d+)|резк|порез|taiat|taiere|decupa/.test(text);
}

const DESIGNER: readonly TypeHintTarget[] = ["mug", "notebook", "pen"];

/** Tie order when two targets score the same (more specific first). */
const PRIORITY: readonly TypeHintTarget[] = [
  "uv_dtf",
  "dtf_apparel",
  "business_card",
  "sticker_sheet",
  "large_format_print",
  "postcard",
  "flyer",
  "uv_print",
  "pen",
  "notebook",
  "mug",
  "set",
];

/**
 * Best type suggestions for a `paper_print` row, best first (at most two).
 * Empty when nothing distinctive is written.
 */
export function suggestLineTypes(input: TypeHintInput): TypeHint[] {
  const fileText = normalizeHintText((input.fileNames ?? []).filter(Boolean).join(" ; "))
    // Drop the extension and Google-Drive style noise.
    .replace(/\.(pdf|png|jpe?g|tiff?|psd|ai|cdr|eps|svg|docx?|zip|rar|7z|heic|webp)(?![a-z])/g, " ");
  const notesText = normalizeHintText(input.notes ?? "");
  const fromFile = matchTargets(fileText);
  const fromNotes = matchTargets(notesText);
  // UV-DTF / Oracal named anywhere: the «stickers» of the row are those, not sheet stickers.
  for (const other of [fromFile, fromNotes]) {
    if (other.has("uv_dtf") || other.has("large_format_print")) {
      fromFile.delete("sticker_sheet");
      fromNotes.delete("sticker_sheet");
    }
  }
  // «dtf nacleika» next to «UV-DTF»: the same UV-DTF sticker, not a garment.
  if ((fromFile.has("uv_dtf") || fromNotes.has("uv_dtf")) && !APPAREL.test(`${fileText} ${notesText}`)) {
    fromFile.delete("dtf_apparel");
    fromNotes.delete("dtf_apparel");
  }
  if (fromFile.size === 0 && fromNotes.size === 0) {
    if (DOC_WORDS.test(notesText)) return [];
    for (const [text, source] of [[notesText, "notes"], [fileText, "file"]] as const) {
      if (!heavyCutPaper(text)) continue;
      // 9 × 5 / 8,5 × 5,5 on heavy paper is a business card run.
      const pair = parsePairMm(text);
      const bc = pair && isBusinessCardSizeMm(pair.w, pair.h);
      // Larger than A3 (42 × 60 photo paper…) goes on the roll.
      const big = pair && Math.max(pair.w, pair.h) > 450;
      return [{ target: bc ? "business_card" : big ? "large_format_print" : "postcard", score: 1, source }];
    }
    return [];
  }

  const scores = new Map<TypeHintTarget, TypeHint>();
  const add = (target: TypeHintTarget, score: number, source: TypeHint["source"]): void => {
    const cur = scores.get(target);
    if (!cur) scores.set(target, { target, score, source });
    else scores.set(target, { target, score: cur.score + score, source: cur.source === "file" ? "file" : source });
  };
  for (const t of fromFile) add(t, 3, "file");
  for (const t of fromNotes) add(t, 2, "notes");

  // A gift set: the comment names two of pen / notebook / mug and the file does not pick one.
  const designerInNotes = DESIGNER.filter((t) => fromNotes.has(t as Exclude<TypeHintTarget, "set">));
  const designerInFile = DESIGNER.filter((t) => fromFile.has(t as Exclude<TypeHintTarget, "set">));
  if (designerInNotes.length >= 2 && designerInFile.length !== 1) {
    for (const t of designerInNotes) scores.delete(t);
    add("set", 2, "notes");
  }

  const ranked = [...scores.values()].sort(
    (a, b) => b.score - a.score || PRIORITY.indexOf(a.target) - PRIORITY.indexOf(b.target),
  );
  return ranked.slice(0, 2);
}

/** «300 гр», «300g», «300 gsm», «300 грамм» → 300 (100–400). */
export function parseGsm(text: string): number | null {
  const m = /(?<![0-9])([1-4]\d{2})\s?(?:гр|г\/м|г(?![a-zа-я])|грамм|gr|g\/m|gsm|g(?![a-zа-я])|grame?)/.exec(text);
  if (!m) return null;
  const v = Number(m[1]);
  return v >= 100 && v <= 400 ? v : null;
}

/** «20 шт», «200 buc», «100 штук», «x50», «тираж 100» → run. */
export function parseQuantity(text: string): number | null {
  const m =
    /(?<![0-9.,])(\d{1,5})\s?(?:шт|штук|buc|bucati|pcs|exemplar|экз)/.exec(text) ??
    /(?:тираж|tiraj|кол-во|количество|cantitate)\s?:?\s?(\d{1,5})(?![0-9])/.exec(text);
  if (!m) return null;
  const v = Number(m[1]);
  return v >= 1 && v <= 20000 ? v : null;
}

const NUM = "(\\d+(?:[.,]\\d+)?)";

function num(s: string): number {
  return Number(s.replace(",", "."));
}

/** First «W x H» with a unit (cm default when the numbers are small, mm when large). */
function parsePairMm(text: string): { w: number; h: number } | null {
  const m = new RegExp(`(?<![0-9a-zа-я])${NUM} ?(?:x|х|\\*|×| на ) ?${NUM} ?(мм|mm|см|cm)?`).exec(text);
  if (!m) return null;
  const a = num(m[1]!);
  const b = num(m[2]!);
  const unit = m[3];
  const mm = unit === "мм" || unit === "mm" || (!unit && Math.max(a, b) > 50);
  return { w: mm ? a : a * 10, h: mm ? b : b * 10 };
}

/** Standard business card sizes (9 × 5, 8,5 × 5,5, 9 × 5,5 cm), either orientation. */
function isBusinessCardSizeMm(w: number, h: number): boolean {
  const [a, b] = w >= h ? [w, h] : [h, w];
  return (a === 90 && (b === 50 || b === 55)) || (a === 85 && b === 55);
}

/** One size with a unit: «6,5 см», «65 мм», «d 50». */
function parseSingleMm(text: string): number | null {
  const m = new RegExp(`(?<![0-9a-zа-я.,])${NUM} ?(мм|mm|см|cm)(?![a-zа-я])`).exec(text);
  if (!m) return null;
  const v = num(m[1]!);
  return m[2] === "мм" || m[2] === "mm" ? v : v * 10;
}

const ROUND = new RegExp(`${B}(кругл|круг${E}|rotund|cerc|diametr|диаметр|circle|round)`);
const CONTOUR = new RegExp(`${B}(контур|contur|высечк|фигурн)`);

const PAPER_SIZES: readonly { re: RegExp; preset: string; w: number; h: number }[] = [
  { re: new RegExp(`${B}a6${E}`), preset: "pc_a6", w: 10.5, h: 14.8 },
  { re: new RegExp(`${B}a5${E}`), preset: "pc_a5", w: 14.8, h: 21 },
  { re: new RegExp(`${B}dl${E}`), preset: "pc_dl", w: 9.9, h: 21 },
  { re: new RegExp(`${B}a4${E}`), preset: "pc_a4", w: 21, h: 29.7 },
  { re: new RegExp(`${B}a3${E}`), preset: "pc_a3", w: 29.7, h: 42 },
];

/** Postcard presets that are a plain W × H (cm), either orientation. */
const POSTCARD_PAIR_PRESETS: readonly { preset: string; w: number; h: number }[] = [
  { preset: "pc_10x15", w: 10, h: 15 },
  { preset: "pc_75x10", w: 7.5, h: 10 },
  { preset: "pc_13x18", w: 13, h: 18 },
  { preset: "pc_12x12", w: 12, h: 12 },
  { preset: "pc_14x14", w: 14, h: 14 },
  { preset: "pc_bookmark", w: 5, h: 15 },
];

const LF_SIZES: readonly { re: RegExp; w: number; h: number }[] = [
  { re: new RegExp(`${B}a0${E}`), w: 84.1, h: 118.9 },
  { re: new RegExp(`${B}a1${E}`), w: 59.4, h: 84.1 },
  { re: new RegExp(`${B}a2${E}`), w: 42, h: 59.4 },
  { re: new RegExp(`${B}(ватман|vatman)`), w: 59.4, h: 84.1 },
];

const PURPOSES: readonly { re: RegExp; purpose: PostcardHintPurpose }[] = [
  { re: new RegExp(`${B}(приглашени|приглашалк|invitati)`), purpose: "invitation" },
  { re: new RegExp(`${B}(диплом(?!н)|diplom[ae]${E}|diplomele|грамот)`), purpose: "diploma" },
  { re: new RegExp(`${B}(сертификат)`), purpose: "certificate" },
  { re: new RegExp(`${B}(ваучер|voucher)`), purpose: "voucher" },
  { re: new RegExp(`${B}(закладк|semn de carte|bookmark)`), purpose: "bookmark" },
  { re: new RegExp(`${B}(открытк|otkrytk|felicitar|card postal|carte postala|postcard)`), purpose: "postcard" },
  { re: new RegExp(`${B}(карточк|cartonas)`), purpose: "card" },
];

/** What the line can start with after switching to `target`, read from the same text. */
export function parseHintPrefill(target: TypeHintTarget, input: TypeHintInput): TypeHintPrefill {
  const text = normalizeHintText([input.notes ?? "", ...(input.fileNames ?? []).filter(Boolean)].join(" ; "));
  const out: TypeHintPrefill = {};
  const quantity = parseQuantity(text);
  if (quantity != null && target !== "dtf_apparel" && target !== "set") out.quantity = quantity;
  const gsm = parseGsm(text);
  if (gsm != null && (target === "postcard" || target === "business_card" || target === "flyer")) out.gsm = gsm;
  if (
    (target === "business_card" || target === "postcard" || target === "flyer") &&
    new RegExp(`${B}(двусторон|2 сторон|две сторон|двухсторон|двух сторон|2-х сторон|ambele parti|ambele fete|fata[ -]verso|2 fete|doua fete|recto[ -]verso)`).test(text)
  ) {
    out.twoSided = true;
  }

  if (target === "sticker_sheet") {
    const pair = parsePairMm(text);
    const single = parseSingleMm(text);
    if (CONTOUR.test(text)) out.stickerShape = "contour";
    if (ROUND.test(text)) out.stickerShape = "circle";
    if (pair && pair.w >= 10 && pair.h >= 10) {
      out.stickerWidthMm = pair.w;
      out.stickerHeightMm = pair.h;
      if (!out.stickerShape) out.stickerShape = "rect";
      if (out.stickerShape === "circle" && pair.w !== pair.h) out.stickerShape = "rect";
    } else if (single != null && single >= 10) {
      out.stickerWidthMm = single;
      out.stickerHeightMm = single;
      if (!out.stickerShape) out.stickerShape = "circle";
    }
  }

  if (target === "postcard") {
    const purpose = PURPOSES.find((p) => p.re.test(text));
    if (purpose) out.postcardPurpose = purpose.purpose;
    const named = PAPER_SIZES.map((s) => ({ s, at: text.search(s.re) }))
      .filter((x) => x.at >= 0)
      .sort((a, b) => a.at - b.at)[0]?.s;
    const pair = parsePairMm(text);
    if (named) {
      out.postcardPresetId = named.preset;
    } else if (pair) {
      const w = pair.w / 10;
      const h = pair.h / 10;
      const preset = POSTCARD_PAIR_PRESETS.find(
        (p) => (p.w === w && p.h === h) || (p.w === h && p.h === w),
      );
      if (preset) out.postcardPresetId = preset.preset;
      else if (Math.min(w, h) >= 3 && Math.max(w, h) <= 42) {
        out.trimWidthCm = w;
        out.trimHeightCm = h;
      }
    }
    if (new RegExp(`${B}(биговк|бигов|беговк|begovk|bigovk|сложит|сложен|pliat|pliere)`).test(text)) out.creaseLines = 1;
  }

  if (target === "large_format_print") {
    const named = LF_SIZES.find((s) => s.re.test(text));
    if (named) {
      out.lfWidthCm = named.w;
      out.lfHeightCm = named.h;
    }
  }
  return out;
}
