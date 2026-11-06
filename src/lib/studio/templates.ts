import type { ShopLang } from "@/lib/storefront/i18n";
import {
  STUDIO_DOC_VERSION,
  STUDIO_SAMPLE_SHAPE,
  mmToPt,
  ptToMm,
  studioId,
  type SmartTextKey,
  type StudioDoc,
  type StudioImageLayer,
  type StudioKind,
  type StudioLayer,
  type StudioQrLayer,
  type StudioShapeLayer,
  type StudioTextLayer,
} from "./document";
import { recolorForProduct } from "./adapt";
import { isNearWhite } from "./contrast";
import type { StudioLocalized } from "./i18n";
import { applyStudioFields, type StudioColorFieldKey, type StudioFields } from "./smartFields";
import { surfaceBase, type StudioSurfaceSpec } from "./surfaces";
import { CARD_TEMPLATES } from "./cardTemplates";
import { expandStack, logoOrFallback, type TplStack } from "./cardTemplates/stack";

/**
 * Studio templates by occasion and industry, drawn with shapes and text (no
 * stock photos): empty photo / logo spots and QR codes are placeholders the
 * customer fills. Coordinates are shares of the print area, so one layout
 * fits every size of a product family:
 *
 * - `landscape` — mug wrap (~210 × 96 mm): content stays between the handle
 *   strips (x 0.09…0.91) and inside the safe zone;
 * - `portrait` — notebook cover (~140 × 214 mm);
 * - `strip` — pen barrel (~40 × 15 mm): one or two lines, maybe a logo;
 * - `card` — business card file (94 × 54 mm with 2 mm bleed, `cardTemplates/`):
 *   shares of the whole file, content inside the 6 mm safe band.
 *
 * Text size is a share of the area's shorter side. Texts bound to «Datele
 * mele» (`bind`) show a localized sample until the customer's value fills it.
 */

export type StudioOrientation = "landscape" | "portrait" | "strip" | "card";
export const KIND_ORIENTATION: Record<StudioKind, StudioOrientation> = { mug: "landscape", notebook: "portrait", pen: "strip", card: "card" };

export const STUDIO_OCCASIONS = ["xmas", "corporate", "birthday", "love", "wedding", "business", "school"] as const;
export type StudioOccasion = (typeof STUDIO_OCCASIONS)[number];
export const STUDIO_INDUSTRIES = ["cafe", "beauty", "it", "construction", "medical", "auto", "education", "realty"] as const;
/** Business-card gallery: the Moldovan trades the card templates cover. */
export const CARD_INDUSTRIES = [
  "beauty",
  "auto",
  "construction",
  "legal",
  "medical",
  "realty",
  "cafe",
  "agro",
  "it",
  "retail",
  "transport",
  "education",
  "events",
] as const;
export type StudioIndustry = (typeof STUDIO_INDUSTRIES)[number] | (typeof CARD_INDUSTRIES)[number];
/** Business-card styles (gallery chips). */
export const CARD_STYLES = ["minimal", "corporate", "bold", "elegant", "photo"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];
export const CARD_STYLE_LABELS: Record<CardStyle, StudioLocalized> = {
  minimal: { ro: "Minimal", ru: "Минимализм", en: "Minimal" },
  corporate: { ro: "Corporativ", ru: "Корпоративный", en: "Corporate" },
  bold: { ro: "Culoare", ru: "Яркий", en: "Bold" },
  elegant: { ro: "Elegant", ru: "Элегантный", en: "Elegant" },
  photo: { ro: "Cu fotografie", ru: "С фото", en: "Photo" },
};

export const STUDIO_OCCASION_LABELS: Record<StudioOccasion, StudioLocalized> = {
  xmas: { ro: "Crăciun și Anul Nou", ru: "Рождество и Новый год", en: "Christmas & New Year" },
  corporate: { ro: "Corporativ", ru: "Корпоратив", en: "Corporate" },
  birthday: { ro: "Zi de naștere", ru: "День рождения", en: "Birthday" },
  love: { ro: "Dragoste", ru: "Любовь", en: "Love" },
  wedding: { ro: "Nuntă", ru: "Свадьба", en: "Wedding" },
  business: { ro: "Afaceri", ru: "Бизнес", en: "Business" },
  school: { ro: "Școală", ru: "Школа", en: "School" },
};
export const STUDIO_INDUSTRY_LABELS: Record<StudioIndustry, StudioLocalized> = {
  cafe: { ro: "Cafenea / restaurant", ru: "Кафе / ресторан", en: "Café / restaurant" },
  beauty: { ro: "Salon de frumusețe", ru: "Салон красоты", en: "Beauty salon" },
  it: { ro: "IT", ru: "IT", en: "IT" },
  construction: { ro: "Construcții", ru: "Строительство", en: "Construction" },
  medical: { ro: "Medicină", ru: "Медицина", en: "Medical" },
  auto: { ro: "Auto", ru: "Авто", en: "Auto" },
  education: { ro: "Educație", ru: "Образование", en: "Education" },
  realty: { ro: "Imobiliare", ru: "Недвижимость", en: "Real estate" },
  legal: { ro: "Juridic / contabil", ru: "Юрист / бухгалтер", en: "Legal / accounting" },
  agro: { ro: "Agricultură / vin", ru: "Агро / вино", en: "Farming / wine" },
  retail: { ro: "Magazin", ru: "Магазин", en: "Shop" },
  transport: { ro: "Taxi / transport", ru: "Такси / транспорт", en: "Taxi / transport" },
  events: { ro: "Foto / evenimente / flori", ru: "Фото / события / цветы", en: "Photo / events / florist" },
};

/** Fonts with Cyrillic and Romanian ș/ț (the subsets registered in `editorNextFonts`). */
export const STUDIO_TEMPLATE_FONTS = [
  "Roboto",
  "Open Sans",
  "Montserrat",
  "Oswald",
  "Comfortaa",
  "Playfair Display",
  "Merriweather",
  "Cormorant Garamond",
  "Lobster",
  "Caveat",
] as const;
export type StudioTemplateFont = (typeof STUDIO_TEMPLATE_FONTS)[number];
type Font = StudioTemplateFont;

// ─── Template data ────────────────────────────────────────────────────────

/** [centre x, centre y, side] — side as a share of the shorter side of the area. */
export type Sq = readonly [number, number, number];

export type TplText = {
  k: "text";
  /** Centre x / y and box width as shares of the area. */
  cx: number;
  cy: number;
  w: number;
  /** Font size, share of the shorter side. */
  size: number;
  font: Font;
  color: string;
  text: StudioLocalized;
  bind?: SmartTextKey;
  /** Personal sample text (not bound) the customer should replace. */
  ph?: boolean;
  align?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
  arc?: number;
  /** Explicit box height (share of the area height), for arc text. */
  h?: number;
  ls?: number;
  stroke?: { color: string; mm: number };
  shadow?: boolean;
  lh?: number;
  /** Brand colour the text takes (business cards: logo colours). */
  bindColor?: StudioColorFieldKey;
  /** Free-text slot the business-card short edit rewrites (`slot:<id>` layer name). */
  slot?: string;
  /** Business cards: the initials of the company / name (a monogram in place of a missing logo). */
  initials?: boolean;
};
export type TplShape = {
  k: "shape";
  shape: StudioShapeLayer["shape"];
  /** Box [x, y, w, h] in shares of the area, or a square. */
  box?: readonly [number, number, number, number];
  sq?: Sq;
  fill: string | null;
  stroke?: string;
  strokeMm?: number;
  opacity?: number;
  rot?: number;
  bindColor?: StudioColorFieldKey;
  /** A picture hint shown in the gallery and the editor, never printed (e.g. the «photo here» glyph). */
  sample?: boolean;
};
export type TplPhoto = {
  k: "photo";
  box?: readonly [number, number, number, number];
  sq?: Sq;
  mask: StudioImageLayer["mask"];
  frame?: { color: string; mm: number };
  rot?: number;
  logo?: boolean;
  /** Business cards: drawn instead of an empty logo spot once the customer typed details without a logo. */
  fallback?: TplLayer[];
};
/** `vcard`: a contact card filled from «Datele mele» (business-card back). */
export type TplQr = { k: "qr"; sq: Sq; color: string; background: string | null; vcard?: boolean };
export type TplLayer = TplText | TplShape | TplPhoto | TplQr | TplStack;

export interface StudioTemplate {
  id: string;
  occasion: StudioOccasion;
  industries?: StudioIndustry[];
  name: StudioLocalized;
  background: string | null;
  layouts: Partial<Record<StudioOrientation, TplLayer[]>>;
  /** Pen layout for a thin print area (below {@link PEN_THIN_MM} high), where stacked lines would be too small. */
  stripThin?: TplLayer[];
  /** Business cards: a back («Verso») design, offered by «Adaugă verso», not in the front gallery. */
  side?: "front" | "back";
  /** Business-card front: the back that goes with it (id), offered first by «Adaugă verso». */
  back?: string;
  /** Business-card style (gallery chips). */
  style?: CardStyle;
}

/** A pen print area lower than this (mm) takes the template's `stripThin` layout. */
export const PEN_THIN_MM = 12;

const L = (ro: string, ru: string, en: string): StudioLocalized => ({ ro, ru, en });

const NAVY = "#14213d";
const GOLD = "#c9a227";
const CREAM = "#f6eee3";
const TERRA = "#b5532f";
const BROWN = "#3b2a20";
const WHITE = "#ffffff";

const S_NAME = L("Numele tău", "Ваше имя", "Your name");
const S_COMPANY = L("Compania ta", "Ваша компания", "Your company");
const S_TITLE = L("Funcția", "Должность", "Job title");
const S_PHONE = L("+373 60 000 000", "+373 60 000 000", "+373 60 000 000");
const S_EMAIL = L("email@companie.md", "email@kompania.md", "email@company.md");
const S_SITE = L("site-ul-tau.md", "vash-sait.md", "your-site.md");
const S_ADDRESS = L("Str. Exemplu 1, Chișinău", "ул. Примерная 1, Кишинёв", "1 Example St, Chișinău");

const snow = (cx: number, cy: number, s: number, fill = WHITE, opacity = 0.9): TplShape => ({ k: "shape", shape: "snowflake", sq: [cx, cy, s], fill, opacity });
const star = (cx: number, cy: number, s: number, fill = GOLD): TplShape => ({ k: "shape", shape: "star", sq: [cx, cy, s], fill });
const heart = (cx: number, cy: number, s: number, fill: string, rot = 0): TplShape => ({ k: "shape", shape: "heart", sq: [cx, cy, s], fill, rot });

const BASE_TEMPLATES: readonly StudioTemplate[] = [
  // ── Crăciun / Anul Nou ──
  {
    id: "xmas-snow",
    occasion: "xmas",
    name: L("Crăciun cu zăpadă", "Рождество со снегом", "Snowy Christmas"),
    background: NAVY,
    layouts: {
      landscape: [
        snow(0.16, 0.25, 0.16),
        snow(0.84, 0.3, 0.2),
        snow(0.22, 0.78, 0.1, WHITE, 0.6),
        snow(0.79, 0.8, 0.12, WHITE, 0.6),
        { k: "text", cx: 0.5, cy: 0.4, w: 0.6, size: 0.17, font: "Playfair Display", color: GOLD, text: L("Crăciun fericit!", "Счастливого Рождества!", "Merry Christmas!"), italic: true },
        { k: "text", cx: 0.5, cy: 0.68, w: 0.5, size: 0.09, font: "Montserrat", color: WHITE, bind: "name", text: L("Familia Popescu", "Семья Поповых", "The Smith family"), ls: 0.08 },
      ],
      portrait: [
        snow(0.2, 0.15, 0.2),
        snow(0.8, 0.22, 0.26),
        snow(0.3, 0.86, 0.14, WHITE, 0.6),
        snow(0.78, 0.82, 0.16, WHITE, 0.6),
        { k: "text", cx: 0.5, cy: 0.45, w: 0.86, size: 0.14, font: "Playfair Display", color: GOLD, text: L("Crăciun\nfericit!", "Счастливого\nРождества!", "Merry\nChristmas!"), italic: true },
        { k: "text", cx: 0.5, cy: 0.64, w: 0.8, size: 0.07, font: "Montserrat", color: WHITE, bind: "name", text: L("Familia Popescu", "Семья Поповых", "The Smith family") },
      ],
    },
  },
  {
    id: "ny-gold",
    occasion: "xmas",
    name: L("Anul Nou auriu", "Золотой Новый год", "Golden New Year"),
    background: "#0f1a30",
    layouts: {
      landscape: [
        star(0.2, 0.3, 0.12),
        star(0.8, 0.28, 0.1),
        star(0.27, 0.72, 0.07),
        star(0.74, 0.75, 0.08),
        { k: "text", cx: 0.5, cy: 0.38, w: 0.56, size: 0.14, font: "Montserrat", color: GOLD, text: L("LA MULȚI ANI", "С НОВЫМ ГОДОМ", "HAPPY NEW YEAR"), ls: 0.12, arc: 40, h: 0.34 },
        { k: "text", cx: 0.5, cy: 0.66, w: 0.3, size: 0.2, font: "Playfair Display", color: WHITE, text: L("2027", "2027", "2027") },
      ],
      portrait: [
        star(0.18, 0.12, 0.14),
        star(0.84, 0.18, 0.1),
        star(0.2, 0.86, 0.1),
        star(0.8, 0.84, 0.14),
        { k: "text", cx: 0.5, cy: 0.38, w: 0.88, size: 0.1, font: "Montserrat", color: GOLD, text: L("LA MULȚI ANI", "С НОВЫМ ГОДОМ", "HAPPY NEW YEAR"), ls: 0.1 },
        { k: "text", cx: 0.5, cy: 0.55, w: 0.7, size: 0.3, font: "Playfair Display", color: WHITE, text: L("2027", "2027", "2027") },
      ],
      strip: [{ k: "text", cx: 0.5, cy: 0.5, w: 0.92, size: 0.3, font: "Montserrat", color: GOLD, text: L("La mulți ani 2027", "С Новым 2027!", "Happy 2027") }],
    },
  },
  {
    id: "xmas-tree-photo",
    occasion: "xmas",
    name: L("Brad și fotografie", "Ёлка и фото", "Tree & photo"),
    background: CREAM,
    layouts: {
      landscape: [
        { k: "photo", sq: [0.3, 0.5, 0.72], mask: "circle", frame: { color: GOLD, mm: 1.5 } },
        { k: "shape", shape: "tree", sq: [0.82, 0.5, 0.4], fill: "#1f6b3a" },
        { k: "text", cx: 0.57, cy: 0.38, w: 0.3, size: 0.12, font: "Lobster", color: "#b3202a", text: L("Sărbători\nfericite!", "С праздником!", "Happy\nholidays!") },
        { k: "text", cx: 0.57, cy: 0.72, w: 0.3, size: 0.07, font: "Montserrat", color: BROWN, bind: "name", text: S_NAME },
      ],
      portrait: [
        { k: "photo", sq: [0.5, 0.36, 0.7], mask: "circle", frame: { color: GOLD, mm: 2 } },
        { k: "shape", shape: "tree", sq: [0.16, 0.86, 0.18], fill: "#1f6b3a" },
        { k: "shape", shape: "tree", sq: [0.84, 0.86, 0.18], fill: "#1f6b3a" },
        { k: "text", cx: 0.5, cy: 0.7, w: 0.86, size: 0.11, font: "Lobster", color: "#b3202a", text: L("Sărbători fericite!", "С праздником!", "Happy holidays!") },
        { k: "text", cx: 0.5, cy: 0.8, w: 0.6, size: 0.06, font: "Montserrat", color: BROWN, bind: "name", text: S_NAME },
      ],
    },
  },
  {
    id: "xmas-red-classic",
    occasion: "xmas",
    name: L("Crăciun clasic roșu", "Классическое красное Рождество", "Classic red Christmas"),
    background: "#b3202a",
    layouts: {
      landscape: [
        snow(0.17, 0.5, 0.3),
        snow(0.83, 0.5, 0.3),
        { k: "text", cx: 0.5, cy: 0.42, w: 0.52, size: 0.19, font: "Lobster", color: WHITE, text: L("Crăciun fericit", "С Рождеством", "Merry Christmas") },
        { k: "text", cx: 0.5, cy: 0.7, w: 0.5, size: 0.08, font: "Montserrat", color: "#ffe9a8", bind: "name", text: S_NAME },
      ],
      portrait: [
        snow(0.5, 0.2, 0.36),
        { k: "text", cx: 0.5, cy: 0.52, w: 0.88, size: 0.15, font: "Lobster", color: WHITE, text: L("Crăciun\nfericit", "С Рождеством", "Merry\nChristmas") },
        { k: "text", cx: 0.5, cy: 0.74, w: 0.7, size: 0.07, font: "Montserrat", color: "#ffe9a8", bind: "name", text: S_NAME },
      ],
    },
  },
  {
    id: "ny-corporate",
    occasion: "xmas",
    industries: ["it", "realty"],
    name: L("Felicitare corporativă de Anul Nou", "Корпоративное поздравление с Новым годом", "Corporate New Year greeting"),
    background: WHITE,
    layouts: {
      landscape: [
        { k: "shape", shape: "rect", box: [0, 0.82, 1, 0.18], fill: NAVY, bindColor: "brandColor1" },
        { k: "photo", sq: [0.22, 0.42, 0.42], mask: "rect", logo: true },
        { k: "text", cx: 0.6, cy: 0.32, w: 0.5, size: 0.11, font: "Montserrat", color: NAVY, text: L("Un an nou cu succes!", "Успешного нового года!", "To a successful new year!") },
        { k: "text", cx: 0.6, cy: 0.56, w: 0.5, size: 0.08, font: "Montserrat", color: GOLD, bind: "company", text: S_COMPANY },
      ],
      portrait: [
        { k: "shape", shape: "rect", box: [0, 0.88, 1, 0.12], fill: NAVY, bindColor: "brandColor1" },
        { k: "photo", sq: [0.5, 0.26, 0.4], mask: "rect", logo: true },
        { k: "text", cx: 0.5, cy: 0.52, w: 0.86, size: 0.09, font: "Montserrat", color: NAVY, text: L("Un an nou\ncu succes!", "Успешного\nнового года!", "To a successful\nnew year!") },
        { k: "text", cx: 0.5, cy: 0.7, w: 0.8, size: 0.06, font: "Montserrat", color: GOLD, bind: "company", text: S_COMPANY },
      ],
      strip: [
        { k: "photo", sq: [0.17, 0.5, 0.64], mask: "rect", logo: true },
        { k: "text", cx: 0.62, cy: 0.5, w: 0.66, size: 0.26, font: "Montserrat", color: NAVY, bind: "company", text: S_COMPANY },
      ],
    },
  },
  // ── Corporativ ──
  {
    id: "corp-logo-band",
    occasion: "corporate",
    industries: ["it", "realty", "auto"],
    name: L("Logo și bandă de brand", "Логотип и фирменная полоса", "Logo & brand band"),
    background: WHITE,
    layouts: {
      landscape: [
        { k: "shape", shape: "rect", box: [0, 0, 1, 0.22], fill: NAVY, bindColor: "brandColor1" },
        { k: "shape", shape: "rect", box: [0, 0.22, 1, 0.03], fill: GOLD, bindColor: "brandColor2" },
        { k: "photo", sq: [0.5, 0.5, 0.36], mask: "rect", logo: true },
        { k: "text", cx: 0.5, cy: 0.77, w: 0.6, size: 0.1, font: "Montserrat", color: NAVY, bind: "company", text: S_COMPANY },
        { k: "text", cx: 0.5, cy: 0.89, w: 0.5, size: 0.06, font: "Open Sans", color: "#5b6880", bind: "site", text: S_SITE },
      ],
      portrait: [
        { k: "shape", shape: "rect", box: [0, 0, 1, 0.16], fill: NAVY, bindColor: "brandColor1" },
        { k: "shape", shape: "rect", box: [0, 0.16, 1, 0.02], fill: GOLD, bindColor: "brandColor2" },
        { k: "photo", sq: [0.5, 0.42, 0.5], mask: "rect", logo: true },
        { k: "text", cx: 0.5, cy: 0.7, w: 0.86, size: 0.09, font: "Montserrat", color: NAVY, bind: "company", text: S_COMPANY },
        { k: "text", cx: 0.5, cy: 0.79, w: 0.8, size: 0.05, font: "Open Sans", color: "#5b6880", bind: "site", text: S_SITE },
      ],
      strip: [
        { k: "photo", sq: [0.17, 0.5, 0.64], mask: "rect", logo: true },
        { k: "text", cx: 0.62, cy: 0.5, w: 0.66, size: 0.28, font: "Montserrat", color: NAVY, bind: "company", text: S_COMPANY },
      ],
    },
  },
  {
    id: "corp-minimal",
    occasion: "corporate",
    industries: ["realty", "it"],
    name: L("Minimalist", "Минимализм", "Minimal"),
    background: WHITE,
    layouts: {
      landscape: [
        { k: "text", cx: 0.5, cy: 0.38, w: 0.66, size: 0.16, font: "Playfair Display", color: NAVY, bind: "company", text: S_COMPANY },
        { k: "shape", shape: "rect", box: [0.4, 0.56, 0.2, 0.015], fill: GOLD, bindColor: "brandColor1" },
        { k: "text", cx: 0.5, cy: 0.7, w: 0.6, size: 0.07, font: "Montserrat", color: "#5b6880", bind: "site", text: S_SITE, ls: 0.1 },
      ],
      portrait: [
        { k: "text", cx: 0.5, cy: 0.42, w: 0.88, size: 0.12, font: "Playfair Display", color: NAVY, bind: "company", text: S_COMPANY },
        { k: "shape", shape: "rect", box: [0.38, 0.5, 0.24, 0.006], fill: GOLD, bindColor: "brandColor1" },
        { k: "text", cx: 0.5, cy: 0.56, w: 0.8, size: 0.05, font: "Montserrat", color: "#5b6880", bind: "site", text: S_SITE, ls: 0.1 },
      ],
      strip: [{ k: "text", cx: 0.5, cy: 0.5, w: 0.92, size: 0.32, font: "Playfair Display", color: NAVY, bind: "company", text: S_COMPANY }],
    },
  },
  {
    id: "corp-contact-qr",
    occasion: "corporate",
    industries: ["realty", "it", "auto"],
    name: L("Contact cu cod QR", "Контакты с QR-кодом", "Contact with QR"),
    background: WHITE,
    layouts: {
      landscape: [
        { k: "shape", shape: "rect", box: [0.1, 0.12, 0.012, 0.76], fill: GOLD, bindColor: "brandColor1" },
        { k: "text", cx: 0.36, cy: 0.24, w: 0.44, size: 0.12, font: "Montserrat", color: NAVY, bind: "name", text: S_NAME, align: "left" },
        { k: "text", cx: 0.36, cy: 0.39, w: 0.44, size: 0.07, font: "Open Sans", color: "#5b6880", bind: "title", text: S_TITLE, align: "left" },
        { k: "text", cx: 0.36, cy: 0.58, w: 0.44, size: 0.065, font: "Open Sans", color: NAVY, bind: "phone", text: S_PHONE, align: "left" },
        { k: "text", cx: 0.36, cy: 0.7, w: 0.44, size: 0.065, font: "Open Sans", color: NAVY, bind: "email", text: S_EMAIL, align: "left" },
        { k: "text", cx: 0.36, cy: 0.82, w: 0.44, size: 0.065, font: "Open Sans", color: NAVY, bind: "company", text: S_COMPANY, align: "left" },
        { k: "qr", sq: [0.76, 0.5, 0.56], color: NAVY, background: WHITE },
      ],
      portrait: [
        { k: "text", cx: 0.5, cy: 0.14, w: 0.88, size: 0.09, font: "Montserrat", color: NAVY, bind: "name", text: S_NAME },
        { k: "text", cx: 0.5, cy: 0.21, w: 0.8, size: 0.05, font: "Open Sans", color: "#5b6880", bind: "title", text: S_TITLE },
        { k: "qr", sq: [0.5, 0.48, 0.5], color: NAVY, background: WHITE },
        { k: "text", cx: 0.5, cy: 0.74, w: 0.86, size: 0.05, font: "Open Sans", color: NAVY, bind: "phone", text: S_PHONE },
        { k: "text", cx: 0.5, cy: 0.8, w: 0.86, size: 0.05, font: "Open Sans", color: NAVY, bind: "email", text: S_EMAIL },
        { k: "text", cx: 0.5, cy: 0.88, w: 0.86, size: 0.06, font: "Montserrat", color: GOLD, bind: "company", text: S_COMPANY },
      ],
    },
  },
  {
    id: "corp-thanks",
    occasion: "corporate",
    name: L("Mulțumim pentru colaborare", "Спасибо за сотрудничество", "Thank you for working with us"),
    background: NAVY,
    layouts: {
      landscape: [
        { k: "text", cx: 0.5, cy: 0.32, w: 0.66, size: 0.13, font: "Playfair Display", color: GOLD, text: L("Mulțumim", "Спасибо", "Thank you"), italic: true },
        { k: "text", cx: 0.5, cy: 0.52, w: 0.66, size: 0.07, font: "Montserrat", color: WHITE, text: L("pentru colaborare", "за сотрудничество", "for working with us") },
        { k: "text", cx: 0.5, cy: 0.76, w: 0.5, size: 0.08, font: "Montserrat", color: GOLD, bind: "company", text: S_COMPANY, ls: 0.06 },
      ],
      portrait: [
        { k: "text", cx: 0.5, cy: 0.38, w: 0.88, size: 0.13, font: "Playfair Display", color: GOLD, text: L("Mulțumim", "Спасибо", "Thank you"), italic: true },
        { k: "text", cx: 0.5, cy: 0.5, w: 0.88, size: 0.06, font: "Montserrat", color: WHITE, text: L("pentru colaborare", "за сотрудничество", "for working with us") },
        { k: "text", cx: 0.5, cy: 0.76, w: 0.8, size: 0.07, font: "Montserrat", color: GOLD, bind: "company", text: S_COMPANY },
      ],
    },
  },
  // ── Zi de naștere ──
  {
    id: "bday-balloons",
    occasion: "birthday",
    name: L("Baloane", "Воздушные шары", "Balloons"),
    background: "#fff7e8",
    layouts: {
      landscape: [
        { k: "shape", shape: "balloon", box: [0.12, 0.14, 0.09, 0.5], fill: "#e5484d" },
        { k: "shape", shape: "balloon", box: [0.2, 0.3, 0.08, 0.48], fill: "#2f6fed" },
        { k: "shape", shape: "balloon", box: [0.72, 0.12, 0.09, 0.5], fill: GOLD },
        { k: "shape", shape: "balloon", box: [0.8, 0.3, 0.08, 0.48], fill: "#1f8a4c" },
        { k: "text", cx: 0.47, cy: 0.38, w: 0.42, size: 0.15, font: "Lobster", color: "#b0204f", text: L("La mulți ani,", "С днём рождения,", "Happy birthday,") },
        { k: "text", cx: 0.47, cy: 0.66, w: 0.42, size: 0.15, font: "Lobster", color: NAVY, bind: "name", text: S_NAME },
      ],
      portrait: [
        { k: "shape", shape: "balloon", box: [0.12, 0.06, 0.18, 0.24], fill: "#e5484d" },
        { k: "shape", shape: "balloon", box: [0.36, 0.1, 0.16, 0.22], fill: "#2f6fed" },
        { k: "shape", shape: "balloon", box: [0.52, 0.05, 0.18, 0.24], fill: GOLD },
        { k: "shape", shape: "balloon", box: [0.72, 0.1, 0.16, 0.22], fill: "#1f8a4c" },
        { k: "text", cx: 0.5, cy: 0.52, w: 0.9, size: 0.12, font: "Lobster", color: "#b0204f", text: L("La mulți ani,", "С днём рождения,", "Happy birthday,") },
        { k: "text", cx: 0.5, cy: 0.66, w: 0.88, size: 0.13, font: "Lobster", color: NAVY, bind: "name", text: S_NAME },
      ],
    },
  },
  {
    id: "bday-photo",
    occasion: "birthday",
    name: L("Fotografie și vârstă", "Фото и возраст", "Photo & age"),
    background: WHITE,
    layouts: {
      landscape: [
        { k: "photo", box: [0.1, 0.1, 0.38, 0.8], mask: "rounded" },
        { k: "text", cx: 0.69, cy: 0.3, w: 0.36, size: 0.36, font: "Playfair Display", color: GOLD, text: L("30", "30", "30"), ph: true },
        { k: "text", cx: 0.69, cy: 0.62, w: 0.36, size: 0.11, font: "Lobster", color: "#b0204f", text: L("La mulți ani!", "С днём рождения!", "Happy birthday!") },
        { k: "text", cx: 0.69, cy: 0.8, w: 0.36, size: 0.07, font: "Montserrat", color: NAVY, bind: "name", text: S_NAME },
      ],
      portrait: [
        { k: "photo", box: [0.1, 0.08, 0.8, 0.5], mask: "rounded" },
        { k: "text", cx: 0.5, cy: 0.68, w: 0.6, size: 0.24, font: "Playfair Display", color: GOLD, text: L("30", "30", "30"), ph: true },
        { k: "text", cx: 0.5, cy: 0.81, w: 0.88, size: 0.09, font: "Lobster", color: "#b0204f", text: L("La mulți ani!", "С днём рождения!", "Happy birthday!") },
        { k: "text", cx: 0.5, cy: 0.89, w: 0.8, size: 0.05, font: "Montserrat", color: NAVY, bind: "name", text: S_NAME },
      ],
    },
  },
  {
    id: "bday-kids-stars",
    occasion: "birthday",
    name: L("Stele pentru cei mici", "Звёзды для малышей", "Stars for kids"),
    background: "#ffe27a",
    layouts: {
      landscape: [
        star(0.16, 0.3, 0.2, "#e5484d"),
        star(0.84, 0.32, 0.22, "#2f6fed"),
        star(0.24, 0.76, 0.12, "#1f8a4c"),
        star(0.78, 0.78, 0.14, "#b0204f"),
        { k: "text", cx: 0.5, cy: 0.36, w: 0.5, size: 0.2, font: "Comfortaa", color: NAVY, bind: "name", text: L("Maria", "Мария", "Mary"), arc: 50, h: 0.42 },
        { k: "text", cx: 0.5, cy: 0.74, w: 0.44, size: 0.09, font: "Comfortaa", color: "#b0204f", text: L("are 5 anișori!", "5 годиков!", "is 5 today!"), ph: true },
      ],
      portrait: [
        star(0.2, 0.14, 0.22, "#e5484d"),
        star(0.8, 0.16, 0.24, "#2f6fed"),
        star(0.22, 0.86, 0.16, "#1f8a4c"),
        star(0.8, 0.84, 0.18, "#b0204f"),
        { k: "text", cx: 0.5, cy: 0.44, w: 0.88, size: 0.16, font: "Comfortaa", color: NAVY, bind: "name", text: L("Maria", "Мария", "Mary") },
        { k: "text", cx: 0.5, cy: 0.58, w: 0.86, size: 0.08, font: "Comfortaa", color: "#b0204f", text: L("are 5 anișori!", "5 годиков!", "is 5 today!"), ph: true },
      ],
    },
  },
  // ── Dragoste / nuntă ──
  {
    id: "love-hearts",
    occasion: "love",
    name: L("Inimioare", "Сердечки", "Little hearts"),
    background: "#fde4ec",
    layouts: {
      landscape: [
        { k: "photo", sq: [0.3, 0.5, 0.78], mask: "heart" },
        heart(0.6, 0.22, 0.12, "#e5484d", -12),
        heart(0.86, 0.76, 0.1, "#b0204f", 15),
        { k: "text", cx: 0.69, cy: 0.46, w: 0.38, size: 0.17, font: "Lobster", color: "#b0204f", text: L("Te iubesc", "Люблю тебя", "I love you") },
        { k: "text", cx: 0.69, cy: 0.68, w: 0.34, size: 0.08, font: "Caveat", color: NAVY, text: L("Ana & Ion", "Аня и Ваня", "Anna & John"), ph: true },
      ],
      portrait: [
        { k: "photo", sq: [0.5, 0.36, 0.76], mask: "heart" },
        heart(0.16, 0.08, 0.12, "#e5484d", -12),
        heart(0.86, 0.66, 0.1, "#b0204f", 15),
        { k: "text", cx: 0.5, cy: 0.72, w: 0.88, size: 0.13, font: "Lobster", color: "#b0204f", text: L("Te iubesc", "Люблю тебя", "I love you") },
        { k: "text", cx: 0.5, cy: 0.83, w: 0.7, size: 0.07, font: "Caveat", color: NAVY, text: L("Ana & Ion", "Аня и Ваня", "Anna & John"), ph: true },
      ],
    },
  },
  {
    id: "love-two-photos",
    occasion: "love",
    name: L("Noi doi", "Мы вдвоём", "The two of us"),
    background: WHITE,
    layouts: {
      landscape: [
        { k: "photo", sq: [0.24, 0.45, 0.62], mask: "circle", frame: { color: "#e5484d", mm: 1 } },
        { k: "photo", sq: [0.76, 0.45, 0.62], mask: "circle", frame: { color: "#e5484d", mm: 1 } },
        heart(0.5, 0.36, 0.2, "#e5484d"),
        { k: "text", cx: 0.5, cy: 0.62, w: 0.22, size: 0.1, font: "Caveat", color: NAVY, text: L("Noi doi", "Мы", "Us two") },
        { k: "text", cx: 0.5, cy: 0.88, w: 0.4, size: 0.07, font: "Montserrat", color: "#5b6880", text: L("14.02.2027", "14.02.2027", "14.02.2027"), ph: true },
      ],
      portrait: [
        { k: "photo", sq: [0.32, 0.3, 0.52], mask: "circle", frame: { color: "#e5484d", mm: 1.2 } },
        { k: "photo", sq: [0.68, 0.56, 0.52], mask: "circle", frame: { color: "#e5484d", mm: 1.2 } },
        heart(0.76, 0.24, 0.16, "#e5484d"),
        { k: "text", cx: 0.5, cy: 0.8, w: 0.8, size: 0.12, font: "Caveat", color: NAVY, text: L("Noi doi", "Мы вдвоём", "The two of us") },
        { k: "text", cx: 0.5, cy: 0.89, w: 0.6, size: 0.05, font: "Montserrat", color: "#5b6880", text: L("14.02.2027", "14.02.2027", "14.02.2027"), ph: true },
      ],
    },
  },
  {
    id: "wedding-gold",
    occasion: "wedding",
    name: L("Nuntă aurie", "Золотая свадьба", "Golden wedding"),
    background: CREAM,
    layouts: {
      landscape: [
        { k: "shape", shape: "rect", box: [0.3, 0.2, 0.4, 0.008], fill: GOLD },
        { k: "shape", shape: "rect", box: [0.3, 0.8, 0.4, 0.008], fill: GOLD },
        { k: "text", cx: 0.5, cy: 0.45, w: 0.66, size: 0.2, font: "Cormorant Garamond", color: BROWN, text: L("Ana & Ion", "Анна и Иван", "Anna & John"), italic: true, ph: true },
        { k: "text", cx: 0.5, cy: 0.67, w: 0.5, size: 0.07, font: "Montserrat", color: "#8a6d1a", text: L("12 · 09 · 2027", "12 · 09 · 2027", "12 · 09 · 2027"), ls: 0.15, ph: true },
      ],
      portrait: [
        { k: "shape", shape: "ellipse", sq: [0.5, 0.42, 0.7], fill: null, stroke: GOLD, strokeMm: 1 },
        { k: "text", cx: 0.5, cy: 0.4, w: 0.66, size: 0.12, font: "Cormorant Garamond", color: BROWN, text: L("Ana\n&\nIon", "Анна\nи\nИван", "Anna\n&\nJohn"), italic: true, ph: true, lh: 1 },
        { k: "text", cx: 0.5, cy: 0.78, w: 0.8, size: 0.06, font: "Montserrat", color: "#8a6d1a", text: L("12 · 09 · 2027", "12 · 09 · 2027", "12 · 09 · 2027"), ls: 0.15, ph: true },
      ],
    },
  },
  // ── Cafenea / afaceri ──
  {
    id: "cafe-morning",
    occasion: "business",
    industries: ["cafe"],
    name: L("Bună dimineața", "Доброе утро", "Good morning"),
    background: CREAM,
    layouts: {
      landscape: [
        { k: "shape", shape: "rect", box: [0, 0.84, 1, 0.16], fill: TERRA, bindColor: "brandColor1" },
        { k: "photo", sq: [0.2, 0.42, 0.5], mask: "circle", logo: true },
        { k: "text", cx: 0.58, cy: 0.26, w: 0.56, size: 0.13, font: "Playfair Display", color: BROWN, text: L("Bună dimineața,", "Доброе утро,", "Good morning,"), italic: true },
        { k: "text", cx: 0.58, cy: 0.48, w: 0.5, size: 0.15, font: "Playfair Display", color: TERRA, bind: "name", text: L("Ana!", "Аня!", "Anna!") },
        { k: "text", cx: 0.58, cy: 0.7, w: 0.56, size: 0.05, font: "Montserrat", color: BROWN, bind: "address", text: S_ADDRESS, ls: 0.1 },
      ],
      portrait: [
        { k: "shape", shape: "rect", box: [0, 0.9, 1, 0.1], fill: TERRA, bindColor: "brandColor1" },
        { k: "photo", sq: [0.5, 0.22, 0.4], mask: "circle", logo: true },
        { k: "text", cx: 0.5, cy: 0.46, w: 0.88, size: 0.1, font: "Playfair Display", color: BROWN, text: L("Bună dimineața,", "Доброе утро,", "Good morning,"), italic: true },
        { k: "text", cx: 0.5, cy: 0.57, w: 0.8, size: 0.12, font: "Playfair Display", color: TERRA, bind: "name", text: L("Ana!", "Аня!", "Anna!") },
        { k: "text", cx: 0.5, cy: 0.74, w: 0.88, size: 0.045, font: "Montserrat", color: BROWN, bind: "address", text: S_ADDRESS },
      ],
      strip: [
        { k: "photo", sq: [0.17, 0.5, 0.64], mask: "circle", logo: true },
        { k: "text", cx: 0.62, cy: 0.5, w: 0.66, size: 0.28, font: "Playfair Display", color: BROWN, bind: "company", text: L("Cafeneaua ta", "Ваше кафе", "Your café") },
      ],
    },
  },
  {
    id: "cafe-beans-qr",
    occasion: "business",
    industries: ["cafe"],
    name: L("Boabe de cafea și QR", "Кофейные зёрна и QR", "Coffee beans & QR"),
    background: BROWN,
    layouts: {
      landscape: [
        { k: "shape", shape: "ellipse", box: [0.12, 0.16, 0.035, 0.12], fill: "#6b3f2a", rot: 25 },
        { k: "shape", shape: "ellipse", box: [0.2, 0.66, 0.035, 0.12], fill: "#6b3f2a", rot: -30 },
        { k: "shape", shape: "ellipse", box: [0.6, 0.12, 0.035, 0.12], fill: "#6b3f2a", rot: 60 },
        { k: "text", cx: 0.4, cy: 0.32, w: 0.5, size: 0.13, font: "Playfair Display", color: CREAM, bind: "company", text: L("Dor de Cafea", "Кофейня", "Coffee House") },
        { k: "text", cx: 0.4, cy: 0.54, w: 0.5, size: 0.07, font: "Montserrat", color: GOLD, text: L("Cafeaua ta preferată", "Ваш любимый кофе", "Your favourite coffee") },
        { k: "text", cx: 0.4, cy: 0.74, w: 0.5, size: 0.06, font: "Montserrat", color: CREAM, bind: "site", text: S_SITE },
        { k: "qr", sq: [0.78, 0.5, 0.5], color: BROWN, background: CREAM },
      ],
      portrait: [
        { k: "shape", shape: "ellipse", box: [0.1, 0.06, 0.06, 0.06], fill: "#6b3f2a", rot: 25 },
        { k: "shape", shape: "ellipse", box: [0.82, 0.1, 0.06, 0.06], fill: "#6b3f2a", rot: -30 },
        { k: "text", cx: 0.5, cy: 0.2, w: 0.88, size: 0.11, font: "Playfair Display", color: CREAM, bind: "company", text: L("Dor de Cafea", "Кофейня", "Coffee House") },
        { k: "text", cx: 0.5, cy: 0.29, w: 0.88, size: 0.055, font: "Montserrat", color: GOLD, text: L("Cafeaua ta preferată", "Ваш любимый кофе", "Your favourite coffee") },
        { k: "qr", sq: [0.5, 0.56, 0.5], color: BROWN, background: CREAM },
        { k: "text", cx: 0.5, cy: 0.84, w: 0.86, size: 0.05, font: "Montserrat", color: CREAM, bind: "site", text: S_SITE },
      ],
    },
  },
  {
    id: "business-card",
    occasion: "business",
    industries: ["realty", "auto", "construction"],
    name: L("Ca o carte de vizită", "Как визитка", "Business card style"),
    background: WHITE,
    layouts: {
      landscape: [
        { k: "photo", sq: [0.2, 0.5, 0.42], mask: "rect", logo: true },
        { k: "shape", shape: "rect", box: [0.34, 0.16, 0.006, 0.68], fill: NAVY, bindColor: "brandColor1" },
        { k: "text", cx: 0.6, cy: 0.22, w: 0.46, size: 0.11, font: "Montserrat", color: NAVY, bind: "name", text: S_NAME, align: "left" },
        { k: "text", cx: 0.6, cy: 0.36, w: 0.46, size: 0.065, font: "Open Sans", color: "#5b6880", bind: "title", text: S_TITLE, align: "left" },
        { k: "text", cx: 0.6, cy: 0.54, w: 0.46, size: 0.065, font: "Open Sans", color: NAVY, bind: "phone", text: S_PHONE, align: "left" },
        { k: "text", cx: 0.6, cy: 0.66, w: 0.46, size: 0.065, font: "Open Sans", color: NAVY, bind: "email", text: S_EMAIL, align: "left" },
        { k: "text", cx: 0.6, cy: 0.78, w: 0.46, size: 0.065, font: "Open Sans", color: NAVY, bind: "site", text: S_SITE, align: "left" },
      ],
      portrait: [
        { k: "photo", sq: [0.5, 0.22, 0.36], mask: "rect", logo: true },
        { k: "text", cx: 0.5, cy: 0.46, w: 0.88, size: 0.09, font: "Montserrat", color: NAVY, bind: "name", text: S_NAME },
        { k: "text", cx: 0.5, cy: 0.53, w: 0.8, size: 0.05, font: "Open Sans", color: "#5b6880", bind: "title", text: S_TITLE },
        { k: "shape", shape: "rect", box: [0.4, 0.59, 0.2, 0.005], fill: NAVY, bindColor: "brandColor1" },
        { k: "text", cx: 0.5, cy: 0.67, w: 0.86, size: 0.05, font: "Open Sans", color: NAVY, bind: "phone", text: S_PHONE },
        { k: "text", cx: 0.5, cy: 0.73, w: 0.86, size: 0.05, font: "Open Sans", color: NAVY, bind: "email", text: S_EMAIL },
        { k: "text", cx: 0.5, cy: 0.79, w: 0.86, size: 0.05, font: "Open Sans", color: NAVY, bind: "site", text: S_SITE },
      ],
      strip: [
        { k: "text", cx: 0.5, cy: 0.32, w: 0.92, size: 0.26, font: "Montserrat", color: NAVY, bind: "name", text: S_NAME },
        { k: "text", cx: 0.5, cy: 0.7, w: 0.92, size: 0.22, font: "Open Sans", color: NAVY, bind: "phone", text: S_PHONE },
      ],
    },
    // One line, side by side: a real pen prints ~6 mm high, two stacked lines would be below 7 pt.
    stripThin: [
      { k: "text", cx: 0.25, cy: 0.5, w: 0.44, size: 0.22, font: "Montserrat", color: NAVY, bind: "name", text: S_NAME },
      { k: "text", cx: 0.72, cy: 0.5, w: 0.5, size: 0.2, font: "Open Sans", color: NAVY, bind: "phone", text: S_PHONE },
    ],
  },
  // ── Domenii ──
  {
    id: "beauty-salon",
    occasion: "business",
    industries: ["beauty"],
    name: L("Salon de frumusețe", "Салон красоты", "Beauty salon"),
    background: "#f7e6e1",
    layouts: {
      landscape: [
        { k: "shape", shape: "ellipse", sq: [0.5, 0.48, 0.84], fill: null, stroke: GOLD, strokeMm: 0.8 },
        { k: "text", cx: 0.5, cy: 0.4, w: 0.5, size: 0.14, font: "Cormorant Garamond", color: "#6d2e46", bind: "company", text: L("Salon Bella", "Салон Белла", "Bella Salon"), italic: true },
        { k: "text", cx: 0.5, cy: 0.58, w: 0.34, size: 0.06, font: "Montserrat", color: "#8a6d1a", bind: "phone", text: S_PHONE, ls: 0.08 },
      ],
      portrait: [
        { k: "shape", shape: "ellipse", sq: [0.5, 0.42, 0.8], fill: null, stroke: GOLD, strokeMm: 1 },
        { k: "text", cx: 0.5, cy: 0.4, w: 0.7, size: 0.12, font: "Cormorant Garamond", color: "#6d2e46", bind: "company", text: L("Salon Bella", "Салон Белла", "Bella Salon"), italic: true },
        { k: "text", cx: 0.5, cy: 0.5, w: 0.7, size: 0.05, font: "Montserrat", color: "#8a6d1a", bind: "phone", text: S_PHONE },
        { k: "text", cx: 0.5, cy: 0.8, w: 0.86, size: 0.05, font: "Montserrat", color: "#6d2e46", bind: "site", text: S_SITE, ls: 0.1 },
      ],
      strip: [{ k: "text", cx: 0.5, cy: 0.5, w: 0.92, size: 0.34, font: "Cormorant Garamond", color: "#6d2e46", bind: "company", text: L("Salon Bella", "Салон Белла", "Bella Salon"), italic: true }],
    },
  },
  {
    id: "it-code",
    occasion: "business",
    industries: ["it"],
    name: L("Pentru programatori", "Для программистов", "For developers"),
    background: "#0d1117",
    layouts: {
      landscape: [
        { k: "text", cx: 0.5, cy: 0.36, w: 0.7, size: 0.13, font: "Roboto", color: "#3fb950", text: L("<Hello, world />", "<Привет, мир />", "<Hello, world />") },
        { k: "text", cx: 0.5, cy: 0.6, w: 0.6, size: 0.08, font: "Roboto", color: "#e6edf3", bind: "company", text: S_COMPANY },
        { k: "shape", shape: "rect", box: [0.44, 0.74, 0.12, 0.02], fill: "#3fb950", bindColor: "brandColor1" },
      ],
      portrait: [
        { k: "text", cx: 0.5, cy: 0.4, w: 0.9, size: 0.09, font: "Roboto", color: "#3fb950", text: L("<Hello,\nworld />", "<Привет,\nмир />", "<Hello,\nworld />") },
        { k: "text", cx: 0.5, cy: 0.6, w: 0.86, size: 0.06, font: "Roboto", color: "#e6edf3", bind: "company", text: S_COMPANY },
      ],
      strip: [{ k: "text", cx: 0.5, cy: 0.5, w: 0.92, size: 0.3, font: "Roboto", color: "#3fb950", bind: "company", text: S_COMPANY }],
    },
  },
  {
    id: "construction-stripes",
    occasion: "business",
    industries: ["construction", "auto"],
    name: L("Construcții și auto", "Стройка и авто", "Construction & auto"),
    background: "#ffc629",
    layouts: {
      landscape: [
        { k: "shape", shape: "rect", box: [0, 0.82, 1, 0.18], fill: "#1d1d1f" },
        { k: "text", cx: 0.5, cy: 0.34, w: 0.7, size: 0.16, font: "Oswald", color: "#1d1d1f", bind: "company", text: L("CONSTRUCT PRO", "СТРОЙ ПРО", "BUILD PRO") },
        { k: "text", cx: 0.5, cy: 0.58, w: 0.6, size: 0.08, font: "Oswald", color: "#1d1d1f", bind: "phone", text: S_PHONE, ls: 0.08 },
      ],
      portrait: [
        { k: "shape", shape: "rect", box: [0, 0.88, 1, 0.12], fill: "#1d1d1f" },
        { k: "text", cx: 0.5, cy: 0.42, w: 0.9, size: 0.13, font: "Oswald", color: "#1d1d1f", bind: "company", text: L("CONSTRUCT PRO", "СТРОЙ ПРО", "BUILD PRO") },
        { k: "text", cx: 0.5, cy: 0.54, w: 0.8, size: 0.06, font: "Oswald", color: "#1d1d1f", bind: "phone", text: S_PHONE },
      ],
      strip: [{ k: "text", cx: 0.5, cy: 0.5, w: 0.92, size: 0.34, font: "Oswald", color: "#1d1d1f", bind: "company", text: L("CONSTRUCT PRO", "СТРОЙ ПРО", "BUILD PRO") }],
    },
  },
  {
    id: "medical-cross",
    occasion: "business",
    industries: ["medical"],
    name: L("Clinică", "Клиника", "Clinic"),
    background: WHITE,
    layouts: {
      landscape: [
        { k: "shape", shape: "rect", box: [0.17, 0.3, 0.04, 0.4], fill: "#0f8b8d", bindColor: "brandColor1" },
        { k: "shape", shape: "rect", box: [0.1, 0.41, 0.18, 0.18], fill: "#0f8b8d", bindColor: "brandColor1" },
        { k: "text", cx: 0.58, cy: 0.38, w: 0.56, size: 0.12, font: "Montserrat", color: "#0b4f6c", bind: "company", text: L("Clinica Sănătate", "Клиника Здоровье", "Health Clinic") },
        { k: "text", cx: 0.58, cy: 0.6, w: 0.5, size: 0.07, font: "Open Sans", color: "#0b4f6c", bind: "phone", text: S_PHONE },
      ],
      portrait: [
        { k: "shape", shape: "rect", box: [0.44, 0.16, 0.12, 0.2], fill: "#0f8b8d", bindColor: "brandColor1" },
        { k: "shape", shape: "rect", box: [0.37, 0.2, 0.26, 0.12], fill: "#0f8b8d", bindColor: "brandColor1" },
        { k: "text", cx: 0.5, cy: 0.5, w: 0.9, size: 0.09, font: "Montserrat", color: "#0b4f6c", bind: "company", text: L("Clinica Sănătate", "Клиника Здоровье", "Health Clinic") },
        { k: "text", cx: 0.5, cy: 0.6, w: 0.8, size: 0.05, font: "Open Sans", color: "#0b4f6c", bind: "phone", text: S_PHONE },
      ],
      strip: [{ k: "text", cx: 0.5, cy: 0.5, w: 0.92, size: 0.3, font: "Montserrat", color: "#0b4f6c", bind: "company", text: L("Clinica Sănătate", "Клиника Здоровье", "Health Clinic") }],
    },
  },
  {
    id: "school-notebook",
    occasion: "school",
    industries: ["education"],
    name: L("Caietul meu", "Моя тетрадь", "My notebook"),
    background: "#e8f1ff",
    layouts: {
      landscape: [
        star(0.2, 0.3, 0.16, GOLD),
        { k: "shape", shape: "rounded", box: [0.3, 0.3, 0.4, 0.4], fill: WHITE, stroke: "#2f6fed", strokeMm: 0.8 },
        { k: "text", cx: 0.5, cy: 0.5, w: 0.36, size: 0.12, font: "Comfortaa", color: "#1d4fbf", bind: "name", text: L("Maria", "Мария", "Mary") },
        star(0.8, 0.72, 0.12, "#e5484d"),
      ],
      portrait: [
        { k: "shape", shape: "rounded", box: [0.12, 0.3, 0.76, 0.24], fill: WHITE, stroke: "#2f6fed", strokeMm: 1 },
        { k: "text", cx: 0.5, cy: 0.37, w: 0.7, size: 0.06, font: "Comfortaa", color: "#5b6880", text: L("Caietul lui / al ei", "Тетрадь", "This notebook belongs to") },
        { k: "text", cx: 0.5, cy: 0.46, w: 0.7, size: 0.1, font: "Comfortaa", color: "#1d4fbf", bind: "name", text: L("Maria", "Мария", "Mary") },
        star(0.2, 0.12, 0.16, GOLD),
        star(0.8, 0.8, 0.2, "#e5484d"),
      ],
      strip: [{ k: "text", cx: 0.5, cy: 0.5, w: 0.92, size: 0.34, font: "Comfortaa", color: "#1d4fbf", bind: "name", text: L("Maria", "Мария", "Mary") }],
    },
  },
];

/** Every template: the occasion / industry ones and the business-card families (`cardTemplates/`). */
export const STUDIO_TEMPLATES: readonly StudioTemplate[] = [...BASE_TEMPLATES, ...CARD_TEMPLATES];

// ─── Instantiation ────────────────────────────────────────────────────────

const TEXT_PAD = 0.08;
/** Smallest text a template opens with: the quality check warns below 7 pt. */
export const TEMPLATE_MIN_PT = 7;

export function templateKinds(tpl: StudioTemplate): StudioKind[] {
  return (["mug", "notebook", "pen", "card"] as const).filter((k) => tpl.layouts[KIND_ORIENTATION[k]] != null);
}

export interface StudioTemplateFilter {
  occasion?: StudioOccasion | null;
  industry?: StudioIndustry | null;
}

/** Templates for a product, optionally filtered by occasion / industry (seasonal ones first). */
export function studioTemplatesFor(kind: StudioKind, filter: StudioTemplateFilter = {}): StudioTemplate[] {
  return STUDIO_TEMPLATES.filter(
    (t) =>
      t.layouts[KIND_ORIENTATION[kind]] != null &&
      t.side !== "back" &&
      (!filter.occasion || t.occasion === filter.occasion) &&
      (!filter.industry || (t.industries ?? []).includes(filter.industry)),
  );
}

export function studioTemplateById(id: string | null | undefined): StudioTemplate | null {
  return STUDIO_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Business-card backs («Adaugă verso» → «Șablon»). */
export function studioCardBackTemplates(): StudioTemplate[] {
  return STUDIO_TEMPLATES.filter((t) => t.side === "back" && t.layouts.card != null);
}

function sqBox(sq: Sq, W: number, H: number): { x: number; y: number; w: number; h: number } {
  const s: number = sq[2] * Math.min(W, H);
  return { x: sq[0] * W - s / 2, y: sq[1] * H - s / 2, w: s, h: s };
}

function relBox(b: readonly [number, number, number, number], W: number, H: number) {
  return { x: b[0] * W, y: b[1] * H, w: b[2] * W, h: b[3] * H };
}

function buildLayer(l: TplLayer, W: number, H: number, lang: ShopLang): StudioLayer {
  const m: number = Math.min(W, H);
  switch (l.k) {
    case "text": {
      // Sizes are a share of the area, but never below the print minimum (a real pen is ~6 mm high).
      const sizeMm: number = Math.max(l.size * m, ptToMm(TEMPLATE_MIN_PT));
      const lines: number = l.text[lang].split("\n").length;
      const lh: number = l.lh ?? 1.2;
      const h: number = l.h != null ? l.h * H : lines * sizeMm * lh + sizeMm * TEXT_PAD * 2;
      const w: number = l.w * W;
      const t: StudioTextLayer = {
        id: studioId(),
        kind: "text",
        x: l.cx * W - w / 2,
        y: l.cy * H - h / 2,
        w,
        h,
        rotation: 0,
        text: l.text[lang],
        fontFamily: l.font,
        bold: l.bold ?? true,
        ...(l.italic ? { italic: true } : {}),
        sizePt: Math.max(TEMPLATE_MIN_PT, Math.round(mmToPt(sizeMm) * 10) / 10),
        color: l.color,
        align: l.align ?? "center",
        lineHeight: lh,
        ...(l.ls ? { letterSpacingEm: l.ls } : {}),
        ...(l.arc ? { arcDeg: l.arc } : {}),
        ...(l.stroke ? { stroke: { color: l.stroke.color, widthMm: l.stroke.mm } } : {}),
        ...(l.shadow ? { shadow: { color: "#000000", blurMm: 0.8, dxMm: 0.4, dyMm: 0.4 } } : {}),
        ...(l.bind ? { bind: l.bind } : {}),
        ...(l.bind || l.ph ? { placeholder: true } : {}),
        ...(l.bindColor ? { bindColor: l.bindColor } : {}),
        ...(l.slot ? { name: `slot:${l.slot}` } : {}),
      };
      return t;
    }
    case "shape": {
      const b = l.sq ? sqBox(l.sq, W, H) : relBox(l.box!, W, H);
      return {
        id: studioId(),
        kind: "shape",
        shape: l.shape,
        ...b,
        rotation: l.rot ?? 0,
        fill: l.fill,
        ...(l.stroke ? { stroke: l.stroke, strokeMm: l.strokeMm ?? 0.5 } : {}),
        ...(l.opacity != null ? { opacity: l.opacity } : {}),
        ...(l.bindColor ? { bindColor: l.bindColor } : {}),
        ...(l.sample ? { name: STUDIO_SAMPLE_SHAPE } : {}),
      };
    }
    case "photo": {
      const b = l.sq ? sqBox(l.sq, W, H) : relBox(l.box!, W, H);
      return {
        id: studioId(),
        kind: "image",
        ...b,
        rotation: l.rot ?? 0,
        src: null,
        mask: l.mask,
        crop: { zoom: 1, ox: 0, oy: 0 },
        ...(l.frame ? { frame: { color: l.frame.color, widthMm: l.frame.mm } } : {}),
        ...(l.logo ? { bind: "logo" as const, name: "logo" } : {}),
      };
    }
    case "stack":
      throw new Error("stack layers are expanded by templateSurface");
    case "qr": {
      const b = sqBox(l.sq, W, H);
      const q: StudioQrLayer = l.vcard
        ? { id: studioId(), kind: "qr", ...b, rotation: 0, qr: { type: "vcard", data: {} }, color: l.color, background: l.background, bind: "vcard" }
        : { id: studioId(), kind: "qr", ...b, rotation: 0, qr: { type: "url", data: { url: "" } }, color: l.color, background: l.background };
      return q;
    }
  }
}

/**
 * A new document from a template for a product (its print area), in the
 * customer's language, filled with «Datele mele». The QR codes take the
 * customer's site when there is one.
 */
export function instantiateStudioTemplate(
  tpl: StudioTemplate,
  kind: StudioKind,
  specs: readonly StudioSurfaceSpec[],
  lang: ShopLang,
  fields: StudioFields = {},
  productColorHex?: string | null,
): StudioDoc {
  const spec: StudioSurfaceSpec = specs[0]!;
  const doc: StudioDoc = {
    v: STUDIO_DOC_VERSION,
    id: studioId("d"),
    kind,
    templateId: tpl.id,
    // Optional surfaces (a business card's back) are added by the customer, not by the template.
    surfaces: [templateSurface(tpl, kind, spec, lang, fields, productColorHex), ...specs.slice(1).filter((s) => !s.optional).map((s) => ({ ...surfaceBase(s), layers: [] }))],
    updatedAt: 0,
  };
  const filled: StudioDoc = applyStudioFields(doc, fields);
  if (kind !== "pen" && !isColouredMug(kind, productColorHex)) return filled;
  // On a pen / a coloured mug the body colour shows: texts that would vanish on it take white / navy.
  return { ...filled, surfaces: filled.surfaces.map((s) => recolorForProduct(s, productColorHex ?? "#ffffff")) };
}

/**
 * One surface drawn from a template (no «Datele mele» yet: callers apply
 * them): the front of a new document, or a business card's back.
 */
export function templateSurface(
  tpl: StudioTemplate,
  kind: StudioKind,
  spec: StudioSurfaceSpec,
  lang: ShopLang,
  fields: StudioFields = {},
  productColorHex?: string | null,
): StudioDoc["surfaces"][number] {
  const W: number = spec.widthMm;
  const H: number = spec.heightMm;
  const thin: TplLayer[] | undefined = kind === "pen" && H < PEN_THIN_MM ? tpl.stripThin : undefined;
  const layout: TplLayer[] = thin ?? tpl.layouts[KIND_ORIENTATION[kind]] ?? tpl.layouts.landscape ?? tpl.layouts.portrait ?? [];
  const site: string = fields.site?.trim() ?? "";
  // Business cards: columns laid out from the details, a monogram for a missing logo.
  const flat: TplLayer[] = layout.flatMap((l) => (l.k === "stack" ? expandStack(l, fields, W, H) : l.k === "photo" && l.logo ? logoOrFallback(l, fields) : [l]));
  const layers: StudioLayer[] = flat.map((l) => {
    const built: StudioLayer = buildLayer(l, W, H, lang);
    return built.kind === "qr" && site && !built.bind ? { ...built, qr: { type: "url", data: { url: site } } } : built;
  });
  return { ...surfaceBase(spec), background: templateBackground(kind, tpl.background, productColorHex), layers };
}

/** A mug whose body is not white (BUKS black / navy / red / green…): UV prints on the body colour. */
export function isColouredMug(kind: StudioKind, productColorHex: string | null | undefined): boolean {
  return kind === "mug" && !!productColorHex && !isNearWhite(productColorHex);
}

/**
 * The template background on this product. A white / cream background is «no
 * background» on a white mug, but on a pen it would print a white band over
 * the body colour: dropped there. On a coloured mug (UV on the body colour)
 * every template background is dropped — an opaque full wrap would turn a
 * black mug white or navy; the design sits on the real body colour.
 */
export function templateBackground(kind: StudioKind, background: string | null, productColorHex?: string | null): string | null {
  if (isColouredMug(kind, productColorHex)) return null;
  return kind === "pen" && isNearWhite(background) ? null : background;
}
