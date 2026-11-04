import { dtfPrintFitsItem } from "@/lib/dtf/dtfLineCalc";
import { parseGarmentPriceTiers } from "@/lib/dtf/garmentPriceTiers";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { PEN_DEFAULT_PRINT } from "@/lib/printDimensions";
import { stockItemPrintArea } from "@/lib/uv/stockItems";
import { parseUvPrintNorms } from "@/lib/uv/uvPrintNorms";
import { printUnitPrice } from "./dtfPrint";
import { pickLocalized, type Localized, type ShopLang } from "./i18n";
import { colorInStock, inStock, wholeStock } from "./stock";
import type {
  ShopCategory,
  ShopCategorySlug,
  ShopDtfColor,
  ShopDtfGarment,
  ShopDtfItemZone,
  ShopPriceTier,
  ShopPrintDiscount,
  ShopPrintOption,
  ShopProduct,
  ShopSimpleKind,
  ShopUvNorms,
  ShopVariant,
} from "./types";

/**
 * Pilot storefront catalog: which stock items (by SKU) each storefront
 * product sells, with the shop's own copy. Prices, photos and ids come live
 * from the database (see `catalog.ts`); this file is pure so the mapping is
 * unit-tested without Prisma.
 */

export interface ShopOptionConfig {
  sku: string;
  label: Localized;
  hex: string;
  /**
   * Photos of the item that show something we do not sell (the supplier's
   * gallery has every colour of the model): storage keys containing any of
   * these strings are left out of the product gallery.
   */
  hideImages?: string[];
  /**
   * Lifestyle photos that show the model in another colour: kept, but moved to
   * the end of the gallery and captioned «colour may differ». Storage keys
   * containing any of these strings.
   */
  lifestyleImages?: string[];
}

interface BaseProductConfig {
  slug: string;
  category: ShopCategorySlug;
  name: Localized;
  subtitle: Localized;
  description: Localized;
  badge?: Localized;
  options: ShopOptionConfig[];
}

export interface SimpleProductConfig extends BaseProductConfig {
  mode: "simple";
  kind: ShopSimpleKind;
  editorHref?: string;
  /** Artwork check size; a `uvItem` without it takes its item's print area (`printWidthCm/HeightCm`). */
  printAreaCm?: { widthCm: number; heightCm: number };
}

/** A print zone of a DTF `item` product (bag side, the toy's T-shirt). */
export interface DtfItemZoneConfig {
  side: "front" | "back";
  label: Localized;
  /** The zone's `placementNote` on the order (staff-facing, Russian, ≤ 80 chars). */
  note: string;
}

export interface DtfProductConfig extends BaseProductConfig {
  mode: "dtf";
  garment: ShopDtfGarment;
  /** `item` only: where it can be printed, the first is the default. */
  zones?: DtfItemZoneConfig[];
  /**
   * `item` only: largest print per zone while the stock item has no print area
   * (`printWidthCm/printHeightCm` in its attributes); the stock item's area,
   * once filled in, takes precedence. Formats that do not fit are not offered,
   * and the checkout refuses them (`dtf_zone_too_large_for_item`).
   */
  maxPrintCm?: { widthCm: number; heightCm: number };
}

export type ShopProductConfig = SimpleProductConfig | DtfProductConfig;

export const SHOP_CATEGORIES: { slug: ShopCategorySlug; name: Localized }[] = [
  { slug: "caiete", name: { ro: "Carnete", ru: "Блокноты", en: "Notebooks" } },
  { slug: "cani", name: { ro: "Căni", ru: "Кружки", en: "Mugs" } },
  { slug: "tricouri", name: { ro: "Tricouri și șepci", ru: "Футболки и кепки", en: "T-shirts and caps" } },
  { slug: "pixuri", name: { ro: "Pixuri", ru: "Ручки", en: "Pens" } },
  { slug: "genti", name: { ro: "Genți", ru: "Сумки", en: "Bags" } },
  { slug: "jucarii", name: { ro: "Jucării", ru: "Игрушки", en: "Toys" } },
];

/** Bag sides: front and back (`other` zones with a note, as the wizard saves bags). */
function bagZones(itemRu: string): DtfItemZoneConfig[] {
  return [
    { side: "front", label: { ro: "Față", ru: "Лицевая сторона", en: "Front" }, note: `${itemRu}: лицевая сторона` },
    { side: "back", label: { ro: "Spate", ru: "Обратная сторона", en: "Back" }, note: `${itemRu}: обратная сторона` },
  ];
}

const MUG_AREA = { widthCm: 20, heightCm: 9 };

/** Price-list A6 / A5 as fallback print limits of small items. */
const A6_PRINT = { widthCm: 10, heightCm: 15 };
const A5_PRINT = { widthCm: 15, heightCm: 21 };

export const SHOP_PRODUCTS: ShopProductConfig[] = [
  {
    slug: "carnet-a5",
    category: "caiete",
    mode: "simple",
    kind: "notebook",
    editorHref: "/notebook",
    printAreaCm: { widthCm: 14.8, heightCm: 21 },
    name: { ro: "Carnet A5 cu imprimarea ta", ru: "Блокнот A5 с вашей печатью", en: "A5 notebook with your print" },
    subtitle: { ro: "4 culori de copertă", ru: "4 цвета обложки", en: "4 cover colours" },
    description: {
      ro: "Copertă tare din piele ecologică, imprimare UV direct pe copertă. Potrivit pentru cadou, școală și merch corporativ.",
      ru: "Твёрдая обложка из экокожи, УФ-печать прямо на обложке. Подходит для подарка, школы и корпоративного мерча.",
      en: "Hard faux-leather cover with UV printing straight on the cover. Great as a gift, for school or as corporate merch.",
    },
    badge: { ro: "Hit", ru: "Хит", en: "Bestseller" },
    options: [
      { sku: "S3-KBL-A5", label: { ro: "Roșu", ru: "Красный", en: "Red" }, hex: "#b63935" },
      { sku: "S3-ZBL-A5", label: { ro: "Verde", ru: "Зелёный", en: "Green" }, hex: "#48844c" },
      { sku: "S3-SBL-A5", label: { ro: "Albastru", ru: "Синий", en: "Blue" }, hex: "#17579a" },
      { sku: "S3-CBL-A5", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#202020" },
    ],
  },
  {
    slug: "carnet-fruti",
    category: "caiete",
    mode: "simple",
    kind: "notebook",
    editorHref: "/notebook",
    printAreaCm: { widthCm: 14, heightCm: 21 },
    name: { ro: "Carnet eco FRUTI A5", ru: "Эко-блокнот FRUTI A5", en: "FRUTI eco notebook A5" },
    subtitle: { ro: "Copertă din coji de fructe · 6 culori", ru: "Обложка из фруктовых очистков · 6 цветов", en: "Fruit-scrap cover · 6 colours" },
    description: {
      ro: "Carnet A5 cu copertă tare din coji de fructe, semn de carte și elastic în aceeași culoare. 80 de file liniate. Imprimare UV pe copertă.",
      ru: "Блокнот A5 в твёрдой обложке из фруктовых очистков, закладка и резинка в тон. 80 листов в линейку. УФ-печать на обложке.",
      en: "A5 notebook with a hard cover made from fruit scraps, matching bookmark and elastic band. 80 lined sheets. UV print on the cover.",
    },
    badge: { ro: "Eco", ru: "Эко", en: "Eco" },
    options: [
      { sku: "NB1604S1901", label: { ro: "Vișiniu", ru: "Вишнёвый", en: "Cherry" }, hex: "#a6443e" },
      { sku: "NB1604S1902", label: { ro: "Citrice", ru: "Цитрусовый", en: "Citrus" }, hex: "#ece8dd" },
      { sku: "NB1604S1903", label: { ro: "Oliv", ru: "Оливковый", en: "Olive" }, hex: "#e8d1a6" },
      { sku: "NB1604S1904", label: { ro: "Cafeniu", ru: "Кофейный", en: "Coffee" }, hex: "#4d3f3c" },
      { sku: "NB1604S1905", label: { ro: "Migdală", ru: "Миндальный", en: "Almond" }, hex: "#d5baa7" },
      { sku: "NB1604S1988", label: { ro: "Grepfrut", ru: "Грейпфрутовый", en: "Grapefruit" }, hex: "#eae4e8" },
    ],
  },
  {
    slug: "carnet-mistrol",
    category: "caiete",
    mode: "simple",
    kind: "notebook",
    editorHref: "/notebook",
    printAreaCm: { widthCm: 13.8, heightCm: 21 },
    name: { ro: "Carnet cu spirală MISTROL A5", ru: "Блокнот на кольцах MISTROL A5", en: "MISTROL spiral notebook A5" },
    subtitle: { ro: "Din RPET reciclat · 7 culori", ru: "Из переработанного RPET · 7 цветов", en: "Recycled RPET · 7 colours" },
    description: {
      ro: "Carnet A5 cu inele flexibile și copertă rigidă din poliester reciclat RPET. 90 de file cu pătrățele. Imprimare UV pe copertă.",
      ru: "Блокнот A5 на гибких кольцах, жёсткая обложка из переработанного полиэстера RPET. 90 листов в клетку. УФ-печать на обложке.",
      en: "A5 notebook with flexible rings and a rigid cover made from recycled RPET polyester. 90 squared sheets. UV print on the cover.",
    },
    options: [
      { sku: "NB2011S101", label: { ro: "Alb", ru: "Белый", en: "White" }, hex: "#ffffff" },
      { sku: "NB2011S102", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#1b1b1f" },
      { sku: "NB2011S103", label: { ro: "Galben", ru: "Жёлтый", en: "Yellow" }, hex: "#ffe400" },
      { sku: "NB2011S105", label: { ro: "Albastru", ru: "Синий", en: "Blue" }, hex: "#2f3fc8" },
      { sku: "NB2011S1226", label: { ro: "Verde", ru: "Зелёный", en: "Green" }, hex: "#009a44" },
      { sku: "NB2011S131", label: { ro: "Portocaliu", ru: "Оранжевый", en: "Orange" }, hex: "#f08927" },
      { sku: "NB2011S160", label: { ro: "Roșu", ru: "Красный", en: "Red" }, hex: "#dc002e" },
    ],
  },
  {
    slug: "carnet-renat",
    category: "caiete",
    mode: "simple",
    kind: "notebook",
    editorHref: "/notebook",
    printAreaCm: { widthCm: 8, heightCm: 17.7 },
    name: { ro: "Carnet RENAT cu notițe adezive", ru: "Блокнот RENAT со стикерами", en: "RENAT notebook with sticky notes" },
    subtitle: { ro: "Carton reciclat și bambus", ru: "Переработанный картон и бамбук", en: "Recycled cardboard and bamboo" },
    description: {
      ro: "Carnet cu spirală și copertă tare din carton reciclat din cutii de lapte, cu detaliu din bambus. Prin fereastra copertei se văd notițele adezive colorate: 125 mini și 25 mari, plus 70 de file liniate. Imprimare UV pe copertă.",
      ru: "Блокнот на спирали, твёрдая обложка из переработанного картона от пакетов молока и бамбуковая вставка. Через окошко видны цветные стикеры: 125 мини и 25 больших, плюс 70 листов в линейку. УФ-печать на обложке.",
      en: "Spiral notebook with a hard cover made from recycled milk-carton board and a bamboo detail. The cover window shows the coloured sticky notes: 125 mini and 25 large, plus 70 lined sheets. UV print on the cover.",
    },
    options: [{ sku: "NB2068S129", label: { ro: "Natur", ru: "Натуральный", en: "Natural" }, hex: "#f3efe0" }],
  },
  {
    slug: "carnet-leynax",
    category: "caiete",
    mode: "simple",
    kind: "notebook",
    editorHref: "/notebook",
    printAreaCm: { widthCm: 13.8, heightCm: 18.2 },
    name: { ro: "Carnet LEYNAX cu pix", ru: "Блокнот LEYNAX с ручкой", en: "LEYNAX notebook with pen" },
    subtitle: { ro: "Pixul inclus · 6 culori", ru: "Ручка в комплекте · 6 цветов", en: "Pen included · 6 colours" },
    description: {
      ro: "Carnet cu spirală și copertă din carton reciclat, 70 de file. Pixul cu bilă vine în aceeași culoare. Imprimare UV pe copertă.",
      ru: "Блокнот на спирали с обложкой из переработанного картона, 70 листов. Шариковая ручка в тон обложки. УФ-печать на обложке.",
      en: "Spiral notebook with a recycled cardboard cover, 70 sheets. Comes with a ballpoint pen in the same colour. UV print on the cover.",
    },
    options: [
      { sku: "NB7994S102", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#1b1b1f" },
      { sku: "NB7994S103", label: { ro: "Galben", ru: "Жёлтый", en: "Yellow" }, hex: "#ffe400" },
      { sku: "NB7994S105", label: { ro: "Albastru", ru: "Синий", en: "Blue" }, hex: "#0060a9" },
      { sku: "NB7994S1226", label: { ro: "Verde", ru: "Зелёный", en: "Green" }, hex: "#009a44" },
      { sku: "NB7994S131", label: { ro: "Portocaliu", ru: "Оранжевый", en: "Orange" }, hex: "#f08927" },
      { sku: "NB7994S160", label: { ro: "Roșu", ru: "Красный", en: "Red" }, hex: "#dc002e" },
    ],
  },
  {
    slug: "carnet-coral",
    category: "caiete",
    mode: "simple",
    kind: "notebook",
    editorHref: "/notebook",
    printAreaCm: { widthCm: 9.3, heightCm: 14.3 },
    name: { ro: "Carnet mic CORAL A6", ru: "Мини-блокнот CORAL A6", en: "CORAL pocket notebook A6" },
    subtitle: { ro: "9,3×14,3 cm · 7 culori", ru: "9,3×14,3 см · 7 цветов", en: "9.3×14.3 cm · 7 colours" },
    description: {
      ro: "Carnet de buzunar A6 cu copertă tare din piele ecologică, semn de carte și elastic. Imprimare UV pe copertă — un cadou mic pentru evenimente și echipă.",
      ru: "Карманный блокнот A6 в твёрдой обложке из экокожи, с закладкой и резинкой. УФ-печать на обложке — небольшой подарок для мероприятий и команды.",
      en: "A6 pocket notebook with a hard faux-leather cover, bookmark and elastic band. UV print on the cover — a small gift for events and teams.",
    },
    options: [
      { sku: "NB8051S102", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#1b1b1f" },
      { sku: "NB8051S103", label: { ro: "Galben", ru: "Жёлтый", en: "Yellow" }, hex: "#ffe400" },
      { sku: "NB8051S105", label: { ro: "Albastru", ru: "Синий", en: "Blue" }, hex: "#0060a9" },
      { sku: "NB8051S131", label: { ro: "Portocaliu", ru: "Оранжевый", en: "Orange" }, hex: "#f08927" },
      { sku: "NB8051S140", label: { ro: "Fucsia", ru: "Фуксия", en: "Fuchsia" }, hex: "#eb1c60" },
      { sku: "NB8051S155", label: { ro: "Bleumarin", ru: "Тёмно-синий", en: "Navy" }, hex: "#001d43" },
      { sku: "NB8051S160", label: { ro: "Roșu", ru: "Красный", en: "Red" }, hex: "#dc002e" },
    ],
  },
  {
    slug: "carnet-iris",
    category: "caiete",
    mode: "simple",
    kind: "notebook",
    editorHref: "/notebook",
    printAreaCm: { widthCm: 9.3, heightCm: 7.2 },
    name: { ro: "Carnet mic IRIS cu plută", ru: "Мини-блокнот IRIS с пробкой", en: "IRIS pocket notebook with cork" },
    subtitle: { ro: "A6 · 5 culori", ru: "A6 · 5 цветов", en: "A6 · 5 colours" },
    description: {
      ro: "Carnet eco A6 cu copertă din piele ecologică și plută naturală, 80 de file, elastic și semn de carte. Imprimare UV pe partea colorată a copertei.",
      ru: "Эко-блокнот A6 с обложкой из экокожи и натуральной пробки, 80 листов, резинка и закладка. УФ-печать на цветной части обложки.",
      en: "A6 eco notebook with a cover in faux leather and natural cork, 80 sheets, elastic band and bookmark. UV print on the coloured part of the cover.",
    },
    options: [
      { sku: "NB8071S102", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#1b1b1f" },
      { sku: "NB8071S105", label: { ro: "Albastru", ru: "Синий", en: "Blue" }, hex: "#0060a9" },
      { sku: "NB8071S1226", label: { ro: "Verde", ru: "Зелёный", en: "Green" }, hex: "#1f8a3c" },
      { sku: "NB8071S131", label: { ro: "Portocaliu", ru: "Оранжевый", en: "Orange" }, hex: "#f08927" },
      { sku: "NB8071S160", label: { ro: "Roșu", ru: "Красный", en: "Red" }, hex: "#dc002e" },
    ],
  },
  {
    slug: "cana-interior-colorat",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană colorată în interior", ru: "Кружка цветная внутри", en: "Mug with coloured inside" },
    subtitle: { ro: "330 ml · 7 culori", ru: "330 мл · 7 цветов", en: "330 ml · 7 colours" },
    description: {
      ro: "Cană ceramică albă cu interior și mâner colorat. Imprimare prin sublimare, rezistă la mașina de spălat vase.",
      ru: "Белая керамическая кружка с цветными внутренней частью и ручкой. Сублимационная печать, выдерживает посудомойку.",
      en: "White ceramic mug with a coloured inside and handle. Sublimation print, dishwasher-safe.",
    },
    badge: { ro: "Editor 3D", ru: "3D-редактор", en: "3D editor" },
    options: [
      { sku: "S3-KSRS-320", label: { ro: "Albastru", ru: "Синий", en: "Blue" }, hex: "#2f6fd0" },
      { sku: "S3-KKRK-330", label: { ro: "Roșu", ru: "Красный", en: "Red" }, hex: "#d0262d" },
      { sku: "S3-KZRZ-330", label: { ro: "Verde", ru: "Зелёный", en: "Green" }, hex: "#2f9a4a" },
      { sku: "S3-KJRJ-320", label: { ro: "Galben", ru: "Жёлтый", en: "Yellow" }, hex: "#f2c230" },
      { sku: "S3-KORO-320", label: { ro: "Portocaliu", ru: "Оранжевый", en: "Orange" }, hex: "#f07a1f" },
      { sku: "S3-KRRR-320", label: { ro: "Roz", ru: "Розовый", en: "Pink" }, hex: "#f28bb5" },
      { sku: "S3-KCRC-330", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#1b1b1f" },
    ],
  },
  {
    slug: "cana-alba",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană albă cu imprimare", ru: "Белая кружка с печатью", en: "White mug with your print" },
    subtitle: { ro: "320 ml sau 450 ml", ru: "320 мл или 450 мл", en: "320 ml or 450 ml" },
    description: {
      ro: "Clasica cană ceramică albă. Imprimare prin sublimare pe toată suprafața, culori vii.",
      ru: "Классическая белая керамическая кружка. Сублимационная печать по всей поверхности, яркие цвета.",
      en: "The classic white ceramic mug. Sublimation print all around, vivid colours.",
    },
    options: [
      { sku: "S1-KB-320", label: { ro: "320 ml", ru: "320 мл", en: "320 ml" }, hex: "#ffffff" },
      { sku: "S3-KB-450", label: { ro: "450 ml", ru: "450 мл", en: "450 ml" }, hex: "#ffffff" },
    ],
  },
  {
    slug: "cana-magica",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană magică", ru: "Кружка-хамелеон", en: "Magic mug" },
    subtitle: { ro: "Imaginea apare cu băutura caldă", ru: "Рисунок проявляется от горячего", en: "The picture appears with a hot drink" },
    description: {
      ro: "Cană neagră mată: când torni o băutură caldă, culoarea dispare și apare imaginea ta. Un cadou cu efect.",
      ru: "Чёрная матовая кружка: от горячего напитка цвет исчезает и появляется ваш рисунок. Подарок с эффектом.",
      en: "Matte black mug: pour in a hot drink and the black fades to reveal your picture. A gift with a wow effect.",
    },
    badge: { ro: "Cadou", ru: "Подарок", en: "Gift" },
    options: [{ sku: "CTMM-320", label: { ro: "Neagră mată", ru: "Чёрная матовая", en: "Matte black" }, hex: "#1c1c1c" }],
  },
  {
    slug: "cana-aurie-argintie",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană aurie sau argintie", ru: "Кружка золотая или серебряная", en: "Gold or silver mug" },
    subtitle: { ro: "Acoperire tip oglindă", ru: "Зеркальное покрытие", en: "Mirror finish" },
    description: {
      ro: "Cană cu acoperire metalizată tip oglindă și imprimarea ta. Arată festiv — ideală pentru cadouri.",
      ru: "Кружка с зеркальным металлизированным покрытием и вашей печатью. Смотрится празднично — идеальна для подарка.",
      en: "Mug with a metallic mirror finish and your print. Looks festive — perfect as a gift.",
    },
    badge: { ro: "Cadou", ru: "Подарок", en: "Gift" },
    options: [
      { sku: "CAU-320", label: { ro: "Aurie", ru: "Золотая", en: "Gold" }, hex: "#c9a33a" },
      { sku: "CAG-320", label: { ro: "Argintie", ru: "Серебряная", en: "Silver" }, hex: "#c4c6c8" },
      { sku: "CAUL-320", label: { ro: "Aurie lucioasă", ru: "Золотая глянцевая", en: "Glossy gold" }, hex: "#d8b54a" },
    ],
  },
  {
    slug: "cana-marmorata",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană cu efect de marmură", ru: "Кружка с эффектом мрамора", en: "Marble-effect mug" },
    subtitle: { ro: "350 ml · 4 culori", ru: "350 мл · 4 цвета", en: "350 ml · 4 colours" },
    description: {
      ro: "Cană ceramică NORVAL cu finisaj tip marmură — fiecare arată puțin altfel. Imprimarea ta prin sublimare, în cutie albă de cadou.",
      ru: "Керамическая кружка NORVAL с отделкой под мрамор — рисунок у каждой немного свой. Ваша печать сублимацией, в белой подарочной коробке.",
      en: "NORVAL ceramic mug with a marble-effect finish — each one looks a little different. Your print by sublimation, in a white gift box.",
    },
    badge: { ro: "Nou", ru: "Новинка", en: "New" },
    options: [
      { sku: "TZ1132S102", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#8a8a8a" },
      { sku: "TZ1132S105", label: { ro: "Albastru", ru: "Синий", en: "Blue" }, hex: "#a6c7e1" },
      { sku: "TZ1132S1226", label: { ro: "Verde", ru: "Зелёный", en: "Green" }, hex: "#a6dcbe" },
      { sku: "TZ1132S160", label: { ro: "Roșu", ru: "Красный", en: "Red" }, hex: "#f3a6b6" },
    ],
  },
  {
    slug: "cana-nevex-gradient",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană cu bază colorată", ru: "Кружка с цветным градиентом", en: "Mug with a colour gradient" },
    subtitle: { ro: "350 ml · 5 culori", ru: "350 мл · 5 цветов", en: "350 ml · 5 colours" },
    description: {
      ro: "Cană ceramică albă NEVEX, făcută pentru sublimare, cu trecere lină de culoare spre bază. 350 ml, în cutie albă.",
      ru: "Белая керамическая кружка NEVEX для сублимации, с плавным переходом цвета к донышку. 350 мл, в белой коробке.",
      en: "White NEVEX ceramic mug made for sublimation, with a soft colour fade towards the base. 350 ml, in a white box.",
    },
    options: [
      { sku: "TZ1615S102", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#1b1b1f" },
      { sku: "TZ1615S103", label: { ro: "Galben", ru: "Жёлтый", en: "Yellow" }, hex: "#ffe400" },
      { sku: "TZ1615S1114", label: { ro: "Turcoaz", ru: "Бирюзовый", en: "Turquoise" }, hex: "#c1d784" },
      { sku: "TZ1615S1242", label: { ro: "Albastru deschis", ru: "Голубой", en: "Light blue" }, hex: "#0e97c6" },
      { sku: "TZ1615S160", label: { ro: "Roșu", ru: "Красный", en: "Red" }, hex: "#dc002e" },
    ],
  },
  {
    slug: "cana-fiona-sclipici",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană cu sclipici", ru: "Кружка с блёстками", en: "Glitter mug" },
    subtitle: { ro: "350 ml · 4 culori", ru: "350 мл · 4 цвета", en: "350 ml · 4 colours" },
    description: {
      ro: "Cană ceramică FIONA cu efect de sclipici, interior alb. Imprimare prin sublimare, în cutie albă — un cadou care strălucește.",
      ru: "Керамическая кружка FIONA с эффектом блёсток, белая внутри. Сублимационная печать, в белой коробке — подарок, который сияет.",
      en: "FIONA ceramic mug with a glitter effect and a white inside. Sublimation print, in a white box — a gift that sparkles.",
    },
    badge: { ro: "Cadou", ru: "Подарок", en: "Gift" },
    options: [
      { sku: "TZ1508S1242", label: { ro: "Albastru deschis", ru: "Голубая", en: "Light blue" }, hex: "#0e97c6" },
      { sku: "TZ1508S1251", label: { ro: "Argintie", ru: "Серебристая", en: "Silver" }, hex: "#bebebe" },
      { sku: "TZ1508S1260", label: { ro: "Aurie", ru: "Золотая", en: "Gold" }, hex: "#d4b13a" },
      { sku: "TZ1508S148", label: { ro: "Roz", ru: "Розовая", en: "Pink" }, hex: "#f8ccd5" },
    ],
  },
  {
    slug: "cana-mango-doua-culori",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană MANGO în două culori", ru: "Двухцветная кружка MANGO", en: "MANGO two-tone mug" },
    subtitle: { ro: "350 ml · 2 culori", ru: "350 мл · 2 цвета", en: "350 ml · 2 colours" },
    description: {
      ro: "Cană ceramică albă cu interior și mâner colorat, 350 ml. Imprimarea ta prin sublimare pe partea albă.",
      ru: "Белая керамическая кружка с цветными внутренней частью и ручкой, 350 мл. Ваша печать сублимацией на белой части.",
      en: "White ceramic mug with a coloured inside and handle, 350 ml. Your print by sublimation on the white body.",
    },
    options: [
      { sku: "MD4001S10102", label: { ro: "Alb / negru", ru: "Белая / чёрная", en: "White / black" }, hex: "#1b1b1f" },
      { sku: "MD4001S101226", label: { ro: "Alb / verde", ru: "Белая / зелёная", en: "White / green" }, hex: "#2f9a4a" },
    ],
  },
  {
    slug: "cana-maner-inima",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană cu mâner inimă", ru: "Кружка с ручкой-сердечком", en: "Heart-handle mug" },
    subtitle: { ro: "Interior albastru deschis", ru: "Голубая внутри", en: "Light blue inside" },
    description: {
      ro: "Cană ceramică albă cu interior colorat și mâner în formă de inimă. Imprimare prin sublimare — cadou pentru 14 februarie, 8 martie sau o zi de naștere.",
      ru: "Белая керамическая кружка с цветной внутренней частью и ручкой в форме сердца. Сублимационная печать — подарок к 14 февраля, 8 марта или дню рождения.",
      en: "White ceramic mug with a coloured inside and a heart-shaped handle. Sublimation print — a gift for Valentine's Day, Women's Day or a birthday.",
    },
    badge: { ro: "Cadou", ru: "Подарок", en: "Gift" },
    options: [
      { sku: "CAIMI-320", label: { ro: "Albastru deschis", ru: "Голубая", en: "Light blue" }, hex: "#6cb4e4" },
    ],
  },
  {
    slug: "cana-minge-fotbal",
    category: "cani",
    mode: "simple",
    kind: "mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană cu minge de fotbal", ru: "Кружка с футбольным мячом", en: "Football mug" },
    subtitle: { ro: "Mânerul ține o minge", ru: "Ручка с мячом", en: "A ball on the handle" },
    description: {
      ro: "Cană ceramică albă cu mâner în formă de mână care ține o minge de fotbal. Imprimarea ta prin sublimare — un cadou pentru un fan.",
      ru: "Белая керамическая кружка, ручка которой держит футбольный мяч. Ваша печать сублимацией — подарок болельщику.",
      en: "White ceramic mug whose handle holds a football. Your print by sublimation — a gift for a fan.",
    },
    badge: { ro: "Cadou", ru: "Подарок", en: "Gift" },
    options: [{ sku: "CAMF-320", label: { ro: "Albă", ru: "Белая", en: "White" }, hex: "#ffffff" }],
  },
  {
    slug: "cana-neagra",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană complet neagră", ru: "Полностью чёрная кружка", en: "All-black mug" },
    subtitle: { ro: "Lucioasă, neagră și în interior", ru: "Глянцевая, чёрная и внутри", en: "Glossy, black inside too" },
    description: {
      ro: "Cană ceramică neagră lucioasă — corp, interior și mâner. Imprimarea ta prin sublimare.",
      ru: "Глянцевая чёрная керамическая кружка — корпус, внутренняя часть и ручка. Ваша печать сублимацией.",
      en: "Glossy black ceramic mug — body, inside and handle. Your print by sublimation.",
    },
    options: [{ sku: "CNC-320", label: { ro: "Neagră", ru: "Чёрная", en: "Black" }, hex: "#1c1c1c" }],
  },
  {
    slug: "cana-margine-colorata",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană cu margine colorată", ru: "Кружка с цветным ободком", en: "Mug with a coloured rim" },
    subtitle: { ro: "Margine și mâner colorat · 3 culori", ru: "Цветные ободок и ручка · 3 цвета", en: "Coloured rim and handle · 3 colours" },
    description: {
      ro: "Cană ceramică albă cu margine și mâner colorat. Imprimarea ta prin sublimare pe toată partea albă.",
      ru: "Белая керамическая кружка с цветными ободком и ручкой. Ваша печать сублимацией по всей белой части.",
      en: "White ceramic mug with a coloured rim and handle. Your print by sublimation all over the white body.",
    },
    options: [
      { sku: "CMARM-320", label: { ro: "Mov", ru: "Фиолетовый", en: "Purple" }, hex: "#7b4fa0" },
      { sku: "CMARV-320", label: { ro: "Verde", ru: "Зелёный", en: "Green" }, hex: "#2e9b4a" },
      { sku: "CCMMN-320", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#1c1c1c" },
    ],
  },
  {
    slug: "cana-sclipici",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană termo cu sclipici", ru: "Термокружка с блёстками", en: "Glitter thermal mug" },
    subtitle: { ro: "Neagră cu sclipici", ru: "Чёрная с блёстками", en: "Black with glitter" },
    description: {
      ro: "Cană neagră cu sclipici și imprimarea ta prin sublimare.",
      ru: "Чёрная кружка с блёстками и вашей печатью сублимацией.",
      en: "Black glitter mug with your print by sublimation.",
    },
    badge: { ro: "Cadou", ru: "Подарок", en: "Gift" },
    options: [{ sku: "CTMS-320", label: { ro: "Neagră cu sclipici", ru: "Чёрная с блёстками", en: "Black glitter" }, hex: "#1c1c1c" }],
  },
  {
    slug: "cana-metalica",
    category: "cani",
    mode: "simple",
    kind: "mug",
    editorHref: "/mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană metalică cu margine albastră", ru: "Металлическая кружка с синим ободком", en: "Metal mug with a blue rim" },
    subtitle: { ro: "Margine și mâner albastru", ru: "Синие ободок и ручка", en: "Blue rim and handle" },
    description: {
      ro: "Cană metalică albă cu margine și mâner albastru. Imprimarea ta prin sublimare.",
      ru: "Белая металлическая кружка с синими ободком и ручкой. Ваша печать сублимацией.",
      en: "White metal mug with a blue rim and handle. Your print by sublimation.",
    },
    options: [{ sku: "CMMA", label: { ro: "Albă / albastru", ru: "Белая / синяя", en: "White / blue" }, hex: "#5aaee6" }],
  },
  {
    slug: "cana-happy-birthday",
    category: "cani",
    mode: "simple",
    kind: "mug",
    printAreaCm: MUG_AREA,
    name: { ro: "Cană Happy Birthday", ru: "Кружка Happy Birthday", en: "Happy Birthday mug" },
    subtitle: { ro: "Model festiv în interior", ru: "Праздничный рисунок внутри", en: "Party pattern inside" },
    description: {
      ro: "Cană ceramică albă cu model «Happy Birthday» în interior și pe mâner. Afară — imprimarea ta prin sublimare.",
      ru: "Белая керамическая кружка с рисунком «Happy Birthday» внутри и на ручке. Снаружи — ваша печать сублимацией.",
      en: "White ceramic mug with a «Happy Birthday» pattern inside and on the handle. Outside — your print by sublimation.",
    },
    badge: { ro: "Cadou", ru: "Подарок", en: "Gift" },
    options: [{ sku: "CHB", label: { ro: "Albă", ru: "Белая", en: "White" }, hex: "#ffffff" }],
  },
  // UV-printed mugs (kind `uvItem`): priced by the UV engine like the studio wizard (item price,
  // main print included); print area from the item card (21×9.6). The supplier gallery shows the
  // model in red / other colours and with sample prints, so only the main photo is shown
  // (production gallery keys «179338…» hidden; main photos are «17932…»).
  {
    slug: "cana-radek",
    category: "cani",
    mode: "simple",
    kind: "uvItem",
    name: { ro: "Cană RADEK colorată în interior", ru: "Кружка RADEK цветная внутри", en: "RADEK mug with coloured inside" },
    subtitle: { ro: "370 ml · 4 culori · imprimare UV", ru: "370 мл · 4 цвета · УФ-печать", en: "370 ml · 4 colours · UV print" },
    description: {
      ro: "Cană ceramică de 370 ml, albă la exterior, cu interior colorat. Vine în cutie albă. Imprimare UV cu designul tău.",
      ru: "Керамическая кружка 370 мл, белая снаружи, цветная внутри. Поставляется в белой коробке. УФ-печать вашего дизайна.",
      en: "370 ml ceramic mug, white outside with a coloured inside. Comes in a white box. UV print of your design.",
    },
    options: [
      { sku: "TZ1267S102", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#1b1b1f", hideImages: ["179338"] },
      { sku: "TZ1267S103", label: { ro: "Galben", ru: "Жёлтый", en: "Yellow" }, hex: "#ffe400", hideImages: ["179338"] },
      { sku: "TZ1267S105", label: { ro: "Albastru", ru: "Синий", en: "Blue" }, hex: "#0060a9", hideImages: ["179338"] },
      { sku: "TZ1267S1226", label: { ro: "Verde", ru: "Зелёный", en: "Green" }, hex: "#009a44", hideImages: ["179338"] },
    ],
  },
  {
    slug: "cana-akebia",
    category: "cani",
    mode: "simple",
    kind: "uvItem",
    name: { ro: "Cană AKEBIA cu linguriță", ru: "Кружка AKEBIA с ложечкой", en: "AKEBIA mug with spoon" },
    subtitle: { ro: "350 ml · 2 culori · imprimare UV", ru: "350 мл · 2 цвета · УФ-печать", en: "350 ml · 2 colours · UV print" },
    description: {
      ro: "Cană ceramică albă de 350 ml, cu interior colorat și linguriță ceramică asortată. Imprimare UV cu designul tău.",
      ru: "Белая керамическая кружка 350 мл с цветной внутренней частью и керамической ложечкой в тон. УФ-печать вашего дизайна.",
      en: "350 ml white ceramic mug with a coloured inside and a matching ceramic spoon. UV print of your design.",
    },
    options: [
      { sku: "MD4008S10103", label: { ro: "Galben", ru: "Жёлтый", en: "Yellow" }, hex: "#ffe400", hideImages: ["179338"] },
      { sku: "MD4008S10105", label: { ro: "Albastru", ru: "Синий", en: "Blue" }, hex: "#0060a9", hideImages: ["179338"] },
    ],
  },
  {
    slug: "tricou-dogo",
    category: "tricouri",
    mode: "dtf",
    garment: "tshirt",
    name: { ro: "Tricou DOGO cu imprimare", ru: "Футболка DOGO с принтом", en: "DOGO T-shirt with your print" },
    subtitle: { ro: "S–3XL · imprimare DTF", ru: "S–3XL · печать DTF", en: "S–3XL · DTF print" },
    description: {
      ro: "DOGO Premium, bumbac. Imprimare DTF — nu crapă după spălări. Alege mărimea imprimării pe față și pe spate.",
      ru: "DOGO Premium, хлопок. Печать DTF — не трескается после стирок. Выберите размер принта спереди и сзади.",
      en: "DOGO Premium, cotton. DTF print that doesn't crack after washing. Choose the print size on the front and back.",
    },
    badge: { ro: "Logoul tău", ru: "Ваш логотип", en: "Your logo" },
    options: [
      // The ROLY gallery also holds green and cream shirts (lifestyle photos): shown last with a
      // «colour may differ» caption. Keys differ per database (the photos were imported separately),
      // so both the local and the production timestamps are listed. Production also has a
      // byte-identical copy of the main photo as the first gallery image (…3221 / …0942) — hidden.
      {
        sku: "CA6502-01",
        label: { ro: "Alb", ru: "Белая", en: "White" },
        hex: "#ffffff",
        hideImages: ["1793382803221-"],
        lifestyleImages: [
          // local
          "1793380437611-",
          "1793380437612-",
          // prod: cream man front ×2 / back, green kid
          "1793382803638-",
          "1793382803633-",
          "1793382803636-",
          "1793382803630-",
        ],
      },
      {
        sku: "CA6502-02",
        label: { ro: "Negru", ru: "Чёрная", en: "Black" },
        hex: "#1b1b1f",
        hideImages: ["1793382800942-"],
        lifestyleImages: [
          // local
          "1793380436411-",
          "1793380436412-",
          "1793380436414-",
          "1793380436417-",
          // prod: cream man front ×2 / back, green kid
          "1793382801267-",
          "1793382801264-",
          "1793382801269-",
          "1793382801261-",
        ],
      },
    ],
  },
  {
    slug: "sapca-eris",
    category: "tricouri",
    mode: "dtf",
    garment: "cap",
    name: { ro: "Șapcă ERIS cu logo", ru: "Кепка ERIS с логотипом", en: "ERIS cap with your logo" },
    subtitle: { ro: "3 culori · logo inclus", ru: "3 цвета · логотип включён", en: "3 colours · logo included" },
    description: {
      ro: "Șapcă din bumbac 100%, 5 panouri, închidere velcro. Prețul include logoul tău pe față (până la 9×5 cm).",
      ru: "Кепка из 100% хлопка, 5 панелей, застёжка на липучке. В цену входит ваш логотип спереди (до 9×5 см).",
      en: "100% cotton cap, 5 panels, velcro strap. The price includes your logo on the front (up to 9×5 cm).",
    },
    options: [
      { sku: "GO70199002", label: { ro: "Neagră", ru: "Чёрная", en: "Black" }, hex: "#1b1b1f" },
      { sku: "GO70199055", label: { ro: "Bleumarin", ru: "Тёмно-синяя", en: "Navy" }, hex: "#1f2a4d" },
      { sku: "GO70199060", label: { ro: "Roșie", ru: "Красная", en: "Red" }, hex: "#c0262d" },
    ],
  },
  {
    slug: "geanta-napa",
    category: "genti",
    mode: "dtf",
    garment: "item",
    // A narrow bottle bag: the front only, up to A5.
    zones: bagZones("Мешочек для бутылки").filter((z) => z.side === "front"),
    maxPrintCm: A5_PRINT,
    name: { ro: "Săculeț NAPA pentru sticlă", ru: "Мешочек для бутылки NAPA", en: "NAPA bottle bag" },
    subtitle: { ro: "Bumbac natural · imprimare DTF", ru: "Натуральный хлопок · печать DTF", en: "Natural cotton · DTF print" },
    description: {
      ro: "Săculeț din bumbac pentru o sticlă, cu șnur. Un ambalaj de cadou sau promoțional cu logoul tău, imprimat DTF.",
      ru: "Хлопковый мешочек для бутылки на шнурке. Подарочная или промо-упаковка с вашим логотипом, печать DTF.",
      en: "Cotton bottle bag with a drawstring. A gift or promotional wrap with your logo, DTF printed.",
    },
    options: [{ sku: "BO7614S129", label: { ro: "Natur", ru: "Натуральный", en: "Natural" }, hex: "#e8dfcf" }],
  },
  {
    slug: "portfard-sedna",
    category: "genti",
    mode: "dtf",
    garment: "item",
    zones: bagZones("Косметичка"),
    // A toilet bag about 16 cm high: up to A6 on each side.
    maxPrintCm: A6_PRINT,
    name: { ro: "Trusă cosmetică SEDNA", ru: "Косметичка SEDNA", en: "SEDNA toilet bag" },
    subtitle: { ro: "4 culori · imprimare DTF", ru: "4 цвета · печать DTF", en: "4 colours · DTF print" },
    description: {
      ro: "Trusă cosmetică multifuncțională pentru călătorii, cu mai multe compartimente și fermoar. Imprimare DTF cu logoul tău.",
      ru: "Многофункциональная косметичка для поездок, с несколькими отделениями и молнией. Печать DTF с вашим логотипом.",
      en: "Multifunctional travel toilet bag with several pockets and a zip. DTF print with your logo.",
    },
    options: [
      { sku: "NE7565S102", label: { ro: "Neagră", ru: "Чёрная", en: "Black" }, hex: "#1b1b1f" },
      { sku: "NE7565S105", label: { ro: "Albastră", ru: "Синяя", en: "Blue" }, hex: "#1f3fb4" },
      { sku: "NE7565S131", label: { ro: "Portocalie", ru: "Оранжевая", en: "Orange" }, hex: "#f08927" },
      { sku: "NE7565S160", label: { ro: "Roșie", ru: "Красная", en: "Red" }, hex: "#dc002e" },
    ],
  },
  {
    slug: "jucarie-lenny",
    category: "jucarii",
    mode: "dtf",
    garment: "item",
    zones: [
      {
        side: "front",
        label: { ro: "Pe tricoul jucăriei", ru: "На футболке игрушки", en: "On the toy's T-shirt" },
        note: "Футболка игрушки, спереди",
      },
    ],
    // The toy's small T-shirt: up to A6.
    maxPrintCm: A6_PRINT,
    name: { ro: "Jucărie de pluș LENNY cu tricou", ru: "Мягкая игрушка LENNY в футболке", en: "LENNY plush toy in a T-shirt" },
    subtitle: { ro: "6 animăluțe · imprimare pe tricou", ru: "6 зверей · принт на футболке", en: "6 animals · print on the T-shirt" },
    description: {
      ro: "Jucărie de pluș în formă de animal, cu tricou alb pe care imprimăm logoul sau desenul tău (DTF). Poliester moale, ochi și nas brodate, fără piese detașabile. Model în poziție șezândă.",
      ru: "Мягкая игрушка в форме зверя в белой футболке: на футболке печатаем ваш логотип или рисунок (DTF). Мягкий полиэстер, вышитые глаза и нос, без съёмных деталей. Сидячая модель.",
      en: "Animal-shaped soft toy in a white T-shirt that we print with your logo or design (DTF). Soft polyester, embroidered eyes and nose, no removable parts. Seated design.",
    },
    options: [
      { sku: "FT2051S1924", label: { ro: "Leu", ru: "Лев", en: "Lion" }, hex: "#d9a23c" },
      { sku: "FT2051S1925", label: { ro: "Purceluș", ru: "Свинка", en: "Piggy" }, hex: "#f2b8c6" },
      { sku: "FT2051S1926", label: { ro: "Elefant", ru: "Слон", en: "Elephant" }, hex: "#a9a9ad" },
      { sku: "FT2051S1927", label: { ro: "Văcuță", ru: "Корова", en: "Cow" }, hex: "#f4f4f4" },
      { sku: "FT2051S1928", label: { ro: "Panda", ru: "Панда", en: "Panda" }, hex: "#1b1b1f" },
      { sku: "FT2051S1997", label: { ro: "Girafă", ru: "Жираф", en: "Giraffe" }, hex: "#e3a23f" },
    ],
  },
  {
    slug: "ursulet-jazz",
    category: "jucarii",
    mode: "dtf",
    garment: "item",
    zones: [
      {
        side: "front",
        label: { ro: "Pe hanoracul ursulețului", ru: "На толстовке мишки", en: "On the bear's sweatshirt" },
        note: "Толстовка мишки, спереди",
      },
    ],
    // The bear's small sweatshirt: up to A6.
    maxPrintCm: A6_PRINT,
    name: { ro: "Ursuleț de pluș JAZZ cu hanorac", ru: "Плюшевый мишка JAZZ в толстовке", en: "JAZZ teddy bear in a sweatshirt" },
    subtitle: { ro: "6 culori de hanorac", ru: "6 цветов толстовки", en: "6 sweatshirt colours" },
    description: {
      ro: "Ursuleț de pluș îmbrăcat cu hanorac moale din poliester fin la atingere; pe hanorac imprimăm logoul sau desenul tău (DTF). Model așezat — un cadou ideal.",
      ru: "Плюшевый мишка в мягкой толстовке из полиэстера; на толстовке печатаем ваш логотип или рисунок (DTF). Сидит. Идеально для подарка.",
      en: "Plush teddy bear in a sweatshirt made of soft polyester; we print your logo or design on the sweatshirt (DTF). Seated position — a lovely gift.",
    },
    // Black (FT1853S102) left out: none in stock and a different price (271).
    options: [
      { sku: "FT1853S101", label: { ro: "Alb", ru: "Белая", en: "White" }, hex: "#ffffff" },
      { sku: "FT1853S105", label: { ro: "Albastru", ru: "Синяя", en: "Blue" }, hex: "#1f4fb4" },
      { sku: "FT1853S1226", label: { ro: "Verde", ru: "Зелёная", en: "Green" }, hex: "#2f8a3a" },
      { sku: "FT1853S131", label: { ro: "Portocaliu", ru: "Оранжевая", en: "Orange" }, hex: "#e07a1f" },
      { sku: "FT1853S155", label: { ro: "Bleumarin", ru: "Тёмно-синяя", en: "Navy" }, hex: "#1f2a4d" },
      { sku: "FT1853S160", label: { ro: "Roșu", ru: "Красная", en: "Red" }, hex: "#c0262d" },
    ],
  },
  {
    slug: "pix-ardenes",
    category: "pixuri",
    mode: "simple",
    kind: "pen",
    editorHref: "/pen",
    name: { ro: "Pix metalic cu logo", ru: "Металлическая ручка с логотипом", en: "Metal pen with your logo" },
    subtitle: { ro: "5 culori", ru: "5 цветов", en: "5 colours" },
    description: {
      ro: "Pix ARDENES cu corp din aluminiu și mecanism cu buton. Imprimare UV cu numele sau logoul tău. Cerneală albastră.",
      ru: "Ручка ARDENES с алюминиевым корпусом и кнопочным механизмом. УФ-печать имени или логотипа. Синие чернила.",
      en: "ARDENES pen with an aluminium body and push-button mechanism. UV print of your name or logo. Blue ink.",
    },
    options: [
      { sku: "ARDENES_BLUE", label: { ro: "Albastru", ru: "Синий", en: "Blue" }, hex: "#1e4f9c" },
      { sku: "ARDENES_BLACK", label: { ro: "Negru", ru: "Чёрный", en: "Black" }, hex: "#1b1b1f" },
      { sku: "ARDENES_RED", label: { ro: "Roșu", ru: "Красный", en: "Red" }, hex: "#c0262d" },
      { sku: "ARDENES_GREEN", label: { ro: "Verde", ru: "Зелёный", en: "Green" }, hex: "#2f7a4a" },
      { sku: "ARDENES_WHITE", label: { ro: "Alb", ru: "Белый", en: "White" }, hex: "#f4f4f4" },
    ],
  },
];

/** Products shown under «Cele mai comandate» on the home page, in order. */
export const SHOP_POPULAR_SLUGS: string[] = [
  "carnet-a5",
  "cana-interior-colorat",
  "tricou-dogo",
  "cana-aurie-argintie",
  "cana-marmorata",
  "cana-nevex-gradient",
  "carnet-fruti",
  "carnet-coral",
];

/** Cap logo: at most 9×5 cm, included in the price (see `dtfIncludedPrintFor`). */
export const CAP_LOGO_ZONE = { widthCm: 9, heightCm: 5 };

export function allShopSkus(): string[] {
  return SHOP_PRODUCTS.flatMap((p) => p.options.map((o) => o.sku));
}

export function isShopCategorySlug(value: string): value is ShopCategorySlug {
  return SHOP_CATEGORIES.some((c) => c.slug === value);
}

// ─── Mapping DB rows → storefront products ──────────────────────────────────

export interface CatalogVariantRow {
  id: string;
  isActive: boolean;
  options: unknown;
  sellPrice: number | null;
  priceTiers: unknown;
  sortOrder: number;
  /** Variant label: the DTF engine's size fallback when `options.size` is empty. */
  label?: string | null;
  /** `StockVariant.stockQuantity`; null / absent = not tracked (always available). */
  stockQuantity?: number | null;
}

export interface CatalogItemRow {
  id: string;
  sku: string;
  isActive: boolean;
  imageUrl: string | null;
  galleryImages: string[];
  /** `StockItem.attributes`: UV print area and norms of a `uvItem`. */
  attributes?: unknown;
  variants: CatalogVariantRow[];
}

export interface CatalogPresetRow {
  id: string;
  label: string;
  widthCm: number;
  heightCm: number;
  retailPrice: number;
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "XXXL", "4XL", "5XL"];

function sizeRank(size: string): number {
  const i: number = SIZE_ORDER.indexOf(size.toUpperCase());
  return i < 0 ? 100 : i;
}

function optionString(options: unknown, key: string): string {
  if (options == null || typeof options !== "object" || Array.isArray(options)) return "";
  const v: unknown = (options as Record<string, unknown>)[key];
  return typeof v === "string" ? v.trim() : "";
}

/** First run-size tier (1 piece), else the variant's sell price. */
export function firstTierPrice(v: Pick<CatalogVariantRow, "priceTiers" | "sellPrice">): number | null {
  if (Array.isArray(v.priceTiers)) {
    const tiers = v.priceTiers
      .map((t) => (t && typeof t === "object" ? (t as { minQty?: unknown; priceMdl?: unknown }) : null))
      .filter((t): t is { minQty: number; priceMdl: number } => typeof t?.minQty === "number" && typeof t?.priceMdl === "number")
      .sort((a, b) => a.minQty - b.minQty);
    if (tiers[0] && tiers[0].priceMdl > 0) return tiers[0].priceMdl;
  }
  return v.sellPrice != null && v.sellPrice > 0 ? v.sellPrice : null;
}

/** Run-size price table of a variant (consecutive ranges); empty with fewer than two priced tiers. */
export function priceTierTable(priceTiers: unknown): ShopPriceTier[] {
  const tiers = parseGarmentPriceTiers(priceTiers).filter((t) => t.priceMdl > 0);
  if (tiers.length < 2) return [];
  return tiers.map((t, i) => ({
    minQty: t.minQty,
    maxQty: tiers[i + 1] ? tiers[i + 1]!.minQty - 1 : null,
    price: t.priceMdl,
  }));
}

/** Main photo, then the gallery, as public URLs (duplicates and `hide` matches dropped). */
export function itemImages(
  item: Pick<CatalogItemRow, "imageUrl" | "galleryImages">,
  hide: readonly string[] = [],
): string[] {
  return itemGallery(item, { hideImages: [...hide] }).images;
}

function matchesAny(key: string, parts: readonly string[] | undefined): boolean {
  return Boolean(parts?.some((h) => h && key.includes(h)));
}

/**
 * Gallery of an option: hidden photos dropped, duplicates removed, lifestyle
 * photos (another colour) moved to the end and listed in `lifestyle`.
 */
export function itemGallery(
  item: Pick<CatalogItemRow, "imageUrl" | "galleryImages">,
  opt: Pick<ShopOptionConfig, "hideImages" | "lifestyleImages">,
): { images: string[]; lifestyle: string[] } {
  const keys: string[] = [item.imageUrl ?? "", ...item.galleryImages].filter(
    (k) => Boolean(k) && !matchesAny(k, opt.hideImages),
  );
  const own: string[] = [];
  const lifestyle: string[] = [];
  for (const k of keys) {
    const u: string | null = publicAssetUrlFromStorageKey(k);
    if (!u || own.includes(u) || lifestyle.includes(u)) continue;
    (matchesAny(k, opt.lifestyleImages) ? lifestyle : own).push(u);
  }
  return { images: [...own, ...lifestyle], lifestyle };
}

function galleryFields(
  item: Pick<CatalogItemRow, "imageUrl" | "galleryImages">,
  opt: ShopOptionConfig,
): { images: string[]; lifestyleImages?: string[] } {
  const g = itemGallery(item, opt);
  return g.lifestyle.length ? { images: g.images, lifestyleImages: g.lifestyle } : { images: g.images };
}

function minPrice(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  return nums.length ? Math.min(...nums) : null;
}

/** DTF print pricing the product pages show (from `PrintMethod('dtf').settings`). */
export interface CatalogDtfPricing {
  printDiscount: ShopPrintDiscount | null;
  pressFeeMdl: number;
}

const NO_DTF_PRICING: CatalogDtfPricing = { printDiscount: null, pressFeeMdl: 0 };

/** Lowest price of a tier table (its last row), or null without tiers. */
function tableMin(tiers: readonly ShopPriceTier[] | undefined): number | null {
  return tiers && tiers.length ? Math.min(...tiers.map((t) => t.price)) : null;
}

/**
 * One storefront product from its config and the catalog rows; null when
 * none of its items is active (the product is then hidden).
 */
export function mapShopProduct(
  config: ShopProductConfig,
  itemsBySku: ReadonlyMap<string, CatalogItemRow>,
  presets: readonly CatalogPresetRow[],
  lang: ShopLang,
  dtfPricing: CatalogDtfPricing = NO_DTF_PRICING,
  opts: ShopCatalogOptions = {},
): ShopProduct | null {
  // Switch off (default): balances are not read — every option counts as not tracked (always available).
  const stockOf = (q: number | null | undefined): number | null => (opts.stockCheck ? wholeStock(q) : null);
  const base = {
    slug: config.slug,
    category: config.category,
    name: pickLocalized(config.name, lang),
    subtitle: pickLocalized(config.subtitle, lang),
    description: pickLocalized(config.description, lang),
    badge: config.badge ? pickLocalized(config.badge, lang) : null,
  };

  if (config.mode === "simple") {
    const variants: ShopVariant[] = [];
    let uvArea: { widthCm: number; heightCm: number } | null = null;
    for (const opt of config.options) {
      const item = itemsBySku.get(opt.sku);
      if (!item?.isActive) continue;
      const v = item.variants.filter((x) => x.isActive).sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (!v) continue;
      let uvNorms: ShopUvNorms | undefined;
      if (config.kind === "uvItem") {
        // The UV engine sizes the included main print from the item: without it the line cannot be priced.
        const area = stockItemPrintArea(item.attributes);
        if (!area) continue;
        uvArea ??= area;
        const n = parseUvPrintNorms(item.attributes);
        uvNorms = { whiteLayers: n.whiteLayers, varnish: n.varnish, primer: n.primer, transfer: n.transfer === true };
      } else if (config.kind === "pen") {
        // Artwork check of a pen: its print area (5×0.6 cm on ARDENES), else the pen default.
        uvArea ??= stockItemPrintArea(item.attributes) ?? { widthCm: PEN_DEFAULT_PRINT.widthCm, heightCm: PEN_DEFAULT_PRINT.heightCm };
      }
      variants.push({
        id: v.id,
        label: pickLocalized(opt.label, lang),
        hex: opt.hex,
        ...galleryFields(item, opt),
        price: firstTierPrice(v),
        ...(config.kind === "pen" ? { tiers: priceTierTable(v.priceTiers) } : {}),
        stock: stockOf(v.stockQuantity),
        ...(uvNorms ? { uvNorms } : {}),
      });
    }
    if (variants.length === 0) return null;
    // Out-of-stock options stay listed (shown disabled); prices and the photo come from what can be ordered.
    const orderable: ShopVariant[] = variants.filter((v) => inStock(v.stock));
    const shown: ShopVariant[] = orderable.length ? orderable : variants;
    return {
      ...base,
      fromPrice: minPrice(shown.map((v) => v.price)),
      unitFrom: minPrice(shown.map((v) => tableMin(v.tiers))),
      image: shown[0]!.images[0] ?? null,
      available: orderable.length > 0,
      mode: "simple",
      simpleKind: config.kind,
      variants,
      dtf: null,
      editorHref: config.editorHref ?? null,
      printAreaCm: config.printAreaCm ?? uvArea,
    };
  }

  const colors: ShopDtfColor[] = [];
  /** Item: the print area of its stock item (`printWidthCm/printHeightCm`), when set. */
  let itemArea: { widthCm: number; heightCm: number } | null = null;
  for (const opt of config.options) {
    const item = itemsBySku.get(opt.sku);
    if (!item?.isActive) continue;
    const active = item.variants.filter((x) => x.isActive);
    if (active.length === 0) continue;
    if (config.garment === "item") itemArea ??= shopDtfItemPrintLimit(config, item.attributes);
    // One colour per item in the pilot: the first active variant's colour.
    const colorKey: string = optionString(active[0]!.options, "color").toLowerCase();
    const sameColor = active.filter((v) => optionString(v.options, "color").toLowerCase() === colorKey);
    const sizes: string[] = [...new Set(sameColor.map((v) => optionString(v.options, "size") || v.label?.trim() || "—"))].sort(
      (a, b) => sizeRank(a) - sizeRank(b),
    );
    const tiers: ShopPriceTier[] = priceTierTable(sameColor[0]?.priceTiers);
    const sizeStock: Record<string, number> = {};
    for (const v of sameColor) {
      const size: string = optionString(v.options, "size") || v.label?.trim() || "—";
      const n: number | null = stockOf(v.stockQuantity);
      // Two variants of one size (the engine takes the first): keep the first balance.
      if (n != null && !(size in sizeStock)) sizeStock[size] = n;
    }
    colors.push({
      key: opt.sku,
      label: pickLocalized(opt.label, lang),
      hex: opt.hex,
      garmentId: `${item.id}:${colorKey}`,
      ...galleryFields(item, opt),
      sizes,
      itemPrice: minPrice(sameColor.map(firstTierPrice)),
      ...(tiers.length ? { tiers } : {}),
      sizeStock,
    });
  }
  if (colors.length === 0) return null;

  // T-shirt and item: item + print by the list (an item: the formats that fit its print area, else all, as the wizard).
  const printed: boolean = config.garment !== "cap";
  const prints: ShopPrintOption[] = printed
    ? presets
        .filter((p) => config.garment !== "item" || dtfPrintFitsItem(p.widthCm, p.heightCm, itemArea))
        .map((p) => ({
          presetId: p.id,
          label: p.label,
          widthCm: p.widthCm,
          heightCm: p.heightCm,
          price: p.retailPrice,
        }))
    : [];
  const itemZones: ShopDtfItemZone[] =
    config.garment === "item"
      ? (config.zones ?? []).map((z) => ({ side: z.side, label: pickLocalized(z.label, lang), note: z.note }))
      : [];
  if (config.garment === "item" && (prints.length === 0 || itemZones.length === 0)) return null;
  const itemFrom: number | null = minPrice(colors.map((c) => c.itemPrice));
  const printFrom: number | null = minPrice(prints.map((p) => p.price));
  const fromPrice: number | null =
    itemFrom == null ? null : printed ? (printFrom == null ? null : itemFrom + printFrom) : itemFrom;

  // Per piece at the biggest run: cheapest item tier (+ cheapest print at the deepest discount on a T-shirt).
  const itemTierMin: number | null = minPrice(colors.map((c) => tableMin(c.tiers)));
  const maxStep: number = Math.max(0, ...(dtfPricing.printDiscount?.steps ?? []).map((s) => s.minQty));
  const printTierMin: number | null =
    printed && maxStep > 0
      ? minPrice(prints.map((p) => printUnitPrice(p, maxStep, dtfPricing.printDiscount, dtfPricing.pressFeeMdl)))
      : null;
  const tiered: boolean = itemTierMin != null || printTierMin != null;
  const unitFrom: number | null = !tiered
    ? null
    : printed
      ? (itemTierMin ?? itemFrom) != null && (printTierMin ?? printFrom) != null
        ? (itemTierMin ?? itemFrom)! + (printTierMin ?? printFrom)!
        : null
      : itemTierMin;

  const firstOrderable: ShopDtfColor | undefined = colors.find(colorInStock);
  return {
    ...base,
    fromPrice,
    unitFrom,
    image: (firstOrderable ?? colors[0]!).images[0] ?? null,
    available: firstOrderable != null,
    mode: "dtf",
    simpleKind: null,
    variants: [],
    dtf: {
      garment: config.garment,
      colors,
      prints,
      itemZones,
      fixedZone: config.garment === "cap" ? CAP_LOGO_ZONE : null,
      printDiscount: printed ? dtfPricing.printDiscount : null,
      pressFeeMdl: dtfPricing.pressFeeMdl,
    },
    editorHref: null,
    printAreaCm: null,
  };
}

/**
 * Largest print of a DTF `item` product: its stock item's print area when set,
 * else the product's fallback (`maxPrintCm`); null = no limit.
 */
export function shopDtfItemPrintLimit(
  config: Pick<DtfProductConfig, "maxPrintCm">,
  attributes: unknown,
): { widthCm: number; heightCm: number } | null {
  const area = stockItemPrintArea(attributes);
  if (area) return { widthCm: area.widthCm, heightCm: area.heightCm };
  return config.maxPrintCm ?? null;
}

/** The storefront DTF `item` product (bag, toy) that sells the stock item of this SKU. */
export function shopDtfItemProductForSku(sku: string): DtfProductConfig | null {
  for (const c of SHOP_PRODUCTS) {
    if (c.mode === "dtf" && c.garment === "item" && c.options.some((o) => o.sku === sku)) return c;
  }
  return null;
}

/** Storefront mapping options. */
export interface ShopCatalogOptions {
  /**
   * Stock-aware shop (`SHOP_STOCK_CHECK=1`, see `shopStockCheckEnabled`): sold-out
   * options disabled, quantities capped, sold-out products hidden. Off by
   * default — the system balances are not trusted until the stocktake.
   */
  stockCheck?: boolean;
}

export function mapShopCatalog(
  items: readonly CatalogItemRow[],
  presets: readonly CatalogPresetRow[],
  lang: ShopLang,
  dtfPricing: CatalogDtfPricing = NO_DTF_PRICING,
  opts: ShopCatalogOptions = {},
): { categories: ShopCategory[]; products: ShopProduct[] } {
  const bySku = new Map(items.map((i) => [i.sku, i]));
  const products: ShopProduct[] = SHOP_PRODUCTS.map((c) => mapShopProduct(c, bySku, presets, lang, dtfPricing, opts)).filter(
    (p): p is ShopProduct => p != null,
  );
  // Sold-out products keep their page («Momentan indisponibil») but leave the listings and counts.
  const categories: ShopCategory[] = SHOP_CATEGORIES.map((c) => {
    const inCat = products.filter((p) => p.category === c.slug && p.available);
    return {
      slug: c.slug,
      name: pickLocalized(c.name, lang),
      image: inCat[0]?.image ?? null,
      productCount: inCat.length,
    };
  }).filter((c) => c.productCount > 0);
  return { categories, products };
}
