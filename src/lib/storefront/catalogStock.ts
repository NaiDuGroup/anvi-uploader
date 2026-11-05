import type { Localized } from "./i18n";
import type { DtfItemZoneConfig, ShopProductConfig } from "./catalogConfig";

/**
 * The rest of the studio stock on the shop (owner 2026-11-05, plan
 * `docs/storefront-full-catalog-plan.md` §A): bottles, games, Christmas,
 * gifts, pens, bags… Same shape as `SHOP_PRODUCTS` (appended to it there);
 * kept apart so the long list does not crowd the pilot catalog.
 *
 * Texts are written from the item cards (supplier descriptions) — no specs
 * that are not on the card. Print zones: the card's print parameters win;
 * `fallbackPrintAreaCm` / `maxPrintCm` are proposed from the item size and
 * marked «уточнить» until the studio fills the cards in.
 *
 * Only type imports from `catalogConfig.ts` (it imports this file).
 */

/** Price-list A6 / A5 / A4 and a 10×10 logo as print limits of DTF items (as in `catalogConfig.ts`). */
const A6_PRINT = { widthCm: 10, heightCm: 15 };
const A5_PRINT = { widthCm: 15, heightCm: 21 };
const A4_PRINT = { widthCm: 21, heightCm: 30 };
const LOGO_PRINT = { widthCm: 10, heightCm: 10 };

/** Bag sides: front and back (`other` zones with a note, as the wizard saves bags). */
function bagZones(itemRu: string): DtfItemZoneConfig[] {
  return [
    { side: "front", label: { ro: "Față", ru: "Лицевая сторона", en: "Front" }, note: `${itemRu}: лицевая сторона` },
    { side: "back", label: { ro: "Spate", ru: "Обратная сторона", en: "Back" }, note: `${itemRu}: обратная сторона` },
  ];
}

/** One front zone of a small DTF item. */
function frontZone(label: Localized, note: string): DtfItemZoneConfig[] {
  return [{ side: "front", label, note }];
}

/**
 * Bottles: direct UV prints ONE side (the studio does not print around the
 * bottle); a wrap-around print is UV-DTF, on request. Visible flat-ish part
 * of a Ø6.6 cm bottle × the straight height («уточнить»).
 */
const BOTTLE_SIDE = { widthCm: 5, heightCm: 15 };

const C = {
  white: { ro: "Alb", ru: "Белый", en: "White" },
  black: { ro: "Negru", ru: "Чёрный", en: "Black" },
  yellow: { ro: "Galben", ru: "Жёлтый", en: "Yellow" },
  blue: { ro: "Albastru", ru: "Синий", en: "Blue" },
  green: { ro: "Verde", ru: "Зелёный", en: "Green" },
  orange: { ro: "Portocaliu", ru: "Оранжевый", en: "Orange" },
  red: { ro: "Roșu", ru: "Красный", en: "Red" },
  navy: { ro: "Bleumarin", ru: "Тёмно-синий", en: "Navy" },
  natural: { ro: "Natur", ru: "Натуральный", en: "Natural" },
} satisfies Record<string, Localized>;

/** Feminine forms (bottle, bag: «sticlă neagră», «бутылка чёрная»). */
const F = {
  white: { ro: "Albă", ru: "Белая", en: "White" },
  black: { ro: "Neagră", ru: "Чёрная", en: "Black" },
  yellow: { ro: "Galbenă", ru: "Жёлтая", en: "Yellow" },
  blue: { ro: "Albastră", ru: "Синяя", en: "Blue" },
  green: { ro: "Verde", ru: "Зелёная", en: "Green" },
  orange: { ro: "Portocalie", ru: "Оранжевая", en: "Orange" },
  red: { ro: "Roșie", ru: "Красная", en: "Red" },
  navy: { ro: "Bleumarin", ru: "Тёмно-синяя", en: "Navy" },
  natural: { ro: "Naturală", ru: "Натуральная", en: "Natural" },
} satisfies Record<string, Localized>;

const HEX = {
  white: "#ffffff",
  black: "#1b1b1f",
  yellow: "#ffe400",
  blue: "#1f4fb4",
  green: "#009a44",
  orange: "#f08927",
  red: "#dc002e",
  navy: "#1f2a4d",
  natural: "#e8dfcf",
};

const ONE_SIDE_NOTE: Localized = {
  ro: "Imprimăm UV pe o parte a sticlei. Imprimare de jur împrejur (UV-DTF) — la cerere.",
  ru: "УФ-печать на одной стороне бутылки. Печать по кругу (UV-DTF) — по запросу.",
  en: "UV print on one side of the bottle. A wrap-around print (UV-DTF) is on request.",
};

function withNote(text: Localized, note: Localized): Localized {
  return { ro: `${text.ro} ${note.ro}`, ru: `${text.ru} ${note.ru}`, en: `${text.en} ${note.en}` };
}

export const SHOP_STOCK_PRODUCTS: ShopProductConfig[] = [
  // ─── cani ────────────────────────────────────────────────────────────────
  {
    slug: "cana-buks",
    category: "cani",
    mode: "simple",
    kind: "uvItem",
    name: { ro: "Cană BUKS mată", ru: "Кружка BUKS матовая", en: "BUKS matte mug" },
    subtitle: { ro: "320 ml · 5 culori · imprimare UV", ru: "320 мл · 5 цветов · УФ-печать", en: "320 ml · 5 colours · UV print" },
    description: {
      ro: "Cană ceramică de 320 ml, mată la exterior, cu interiorul și marginea în aceeași culoare. În față are o zonă rotundă gândită pentru logo, mânerul are o formă geometrică originală. Imprimare UV cu designul tău.",
      ru: "Керамическая кружка 320 мл, матовая снаружи, внутри и по краю — того же цвета. Спереди круглая зона под логотип, ручка оригинальной геометрической формы. УФ-печать вашего дизайна.",
      en: "320 ml ceramic mug with a matte outside and a matching colour inside and rim. A round area on the front made for a logo and a handle with an original geometric shape. UV print of your design.",
    },
    options: [
      { sku: "TZ2000S101", label: C.white, hex: "#ffffff" },
      { sku: "TZ2000S102", label: C.black, hex: "#1b1b1f" },
      { sku: "TZ2000S1107", label: C.green, hex: "#2c5234" },
      { sku: "TZ2000S155", label: C.navy, hex: "#1f2a4d" },
      { sku: "TZ2000S160", label: C.red, hex: "#dc002e" },
    ],
  },

  // ─── caiete ──────────────────────────────────────────────────────────────
  {
    slug: "agenda-2027",
    category: "caiete",
    mode: "simple",
    kind: "uvItem",
    name: { ro: "Agendă datată 2027 CLASSIC A5", ru: "Ежедневник 2027 CLASSIC A5", en: "CLASSIC A5 2027 dated diary" },
    subtitle: { ro: "168 file · 6 culori · imprimare UV", ru: "168 листов · 6 цветов · УФ-печать", en: "168 sheets · 6 colours · UV print" },
    description: {
      ro: "Agendă datată pentru 2027, format A5 (14×20,5 cm): 168 de file de 70 g/m², copertă tare din piele ecologică cu «2027» în relief pe cotor. Aplicăm logoul tău cu imprimare UV pe copertă — un cadou corporativ reușit.",
      ru: "Датированный ежедневник на 2027 год формата A5 (14×20,5 см): 168 листов бумаги 70 г/м², твёрдая обложка из искусственной кожи с тиснением «2027» на корешке. Нанесём ваш логотип УФ-печатью на обложку — отличный корпоративный подарок.",
      en: "2027 dated diary in A5 (14×20.5 cm): 168 sheets of 70 g/m² paper, a hard faux-leather cover with «2027» embossed on the spine. We UV print your logo on the cover — a great corporate gift.",
    },
    badge: { ro: "Nou", ru: "Новинка", en: "New" },
    options: [
      { sku: "BV-D1420-20", label: C.black, hex: "#1c1c1c" },
      { sku: "BV-D1420-30", label: C.blue, hex: "#1f3561" },
      { sku: "BV-D1420-41", label: C.red, hex: "#a3202a" },
      { sku: "BV-D1420-42", label: { ro: "Bordo", ru: "Бордовый", en: "Burgundy" }, hex: "#6d1a2a" },
      { sku: "BV-D1420-61", label: C.green, hex: "#1f4d3a" },
      { sku: "BV-D1420-65", label: { ro: "Coniac", ru: "Коньячный", en: "Cognac" }, hex: "#5a3424" },
    ],
  },

  // ─── pixuri ──────────────────────────────────────────────────────────────
  {
    slug: "pix-talbot",
    category: "pixuri",
    mode: "simple",
    kind: "uvItem",
    // Body Ø1 × 13.5 cm («уточнить»).
    fallbackPrintAreaCm: { widthCm: 4, heightCm: 0.6 },
    name: { ro: "Pix și creion TALBOT 2 în 1", ru: "Ручка-карандаш TALBOT 2 в 1", en: "TALBOT 2-in-1 pen and pencil" },
    subtitle: { ro: "Corp metalic · 3 culori · imprimare UV", ru: "Металлический корпус · 3 цвета · УФ-печать", en: "Metal body · 3 colours · UV print" },
    description: {
      ro: "Pix și creion «infinit» într-unul, cu corp metalic: la un capăt pix cu mină albastră, la celălalt creion fără ascuțire, ambele cu capac. Vine în cutie neagră cu interior moale. Imprimare UV cu numele sau logoul tău.",
      ru: "Ручка и «вечный» карандаш в одном металлическом корпусе: с одной стороны ручка с синими чернилами, с другой — карандаш, оба с колпачками. В индивидуальном чёрном футляре с мягкой подложкой. УФ-печать имени или логотипа.",
      en: "An infinite pencil and a pen in one metal body: a blue-ink pen at one end and an infinity-tip pencil at the other, both with caps. Comes in a black case with a padded inside. UV print of your name or logo.",
    },
    options: [
      { sku: "BL1917S101", label: C.white, hex: HEX.white },
      { sku: "BL1917S102", label: C.black, hex: HEX.black },
      { sku: "BL1917S155", label: C.navy, hex: HEX.navy },
    ],
  },
  {
    slug: "pix-lois",
    category: "pixuri",
    mode: "simple",
    kind: "uvItem",
    // The card has 4×1.5 (it wins); proposed 4×0.6 for a Ø1 cm body («уточнить»).
    fallbackPrintAreaCm: { widthCm: 4, heightCm: 0.6 },
    name: { ro: "Pix LOIS din oțel reciclat", ru: "Ручка LOIS из переработанной стали", en: "LOIS recycled steel pen" },
    subtitle: { ro: "Argintiu · cutie kraft · imprimare UV", ru: "Серебристая · крафт-коробка · УФ-печать", en: "Silver · kraft box · UV print" },
    description: {
      ro: "Pix cu corp din oțel inoxidabil reciclat și mină albastră, în cutie individuală din carton kraft. Imprimare UV cu numele sau logoul tău.",
      ru: "Шариковая ручка с корпусом из переработанной нержавеющей стали, синие чернила, индивидуальная крафт-коробка. УФ-печать имени или логотипа.",
      en: "Ballpoint pen with a recycled stainless steel body and blue ink, in its own kraft box. UV print of your name or logo.",
    },
    options: [{ sku: "BL1612S1251", label: { ro: "Argintiu", ru: "Серебристый", en: "Silver" }, hex: "#c0c0c0" }],
  },
  {
    slug: "pix-peret",
    category: "pixuri",
    mode: "simple",
    kind: "uvItem",
    fallbackPrintAreaCm: { widthCm: 4, heightCm: 0.6 },
    name: { ro: "Pix PERET cu stylus", ru: "Ручка PERET со стилусом", en: "PERET pen with stylus" },
    subtitle: { ro: "Roz metalizat · imprimare UV", ru: "Розовый металлик · УФ-печать", en: "Metallic pink · UV print" },
    description: {
      ro: "Pix cu buton, corp metalizat soft-touch și vârf stylus pentru ecrane tactile. Mină jumbo cu cerneală albastră. Imprimare UV cu logoul tău.",
      ru: "Кнопочная ручка с металлизированным корпусом soft-touch и стилусом для сенсорных экранов. Джамбо-стержень с синими чернилами. УФ-печать вашего логотипа.",
      en: "Push pen with a soft-touch metallic body and a touch-screen stylus tip. Blue-ink jumbo refill. UV print of your logo.",
    },
    options: [{ sku: "BL1333TA49", label: { ro: "Roz", ru: "Розовый", en: "Pink" }, hex: "#e7a1b8" }],
  },
  {
    slug: "set-kioto",
    category: "pixuri",
    mode: "simple",
    kind: "uvItem",
    // On the case (17 × 4.1 cm) «уточнить».
    fallbackPrintAreaCm: { widthCm: 12, heightCm: 3 },
    name: { ro: "Set pix și creion KIOTO din bambus", ru: "Набор ручка и карандаш KIOTO из бамбука", en: "KIOTO bamboo pen and pencil set" },
    subtitle: { ro: "Eco · imprimare UV pe cutie", ru: "Эко · УФ-печать на футляре", en: "Eco · UV print on the case" },
    description: {
      ro: "Set eco: pix și creion mecanic din bambus, retractabile. Imprimare UV cu logoul tău.",
      ru: "Эко-набор: шариковая ручка и механический карандаш из бамбука, выдвижные. УФ-печать вашего логотипа.",
      en: "Eco set: a ballpoint pen and a propelling pencil in bamboo, both retractable. UV print of your logo.",
    },
    options: [{ sku: "HW8036S129", label: { ro: "Bej-gri", ru: "Серо-бежевый", en: "Greige" }, hex: "#cdbfa8" }],
  },
  {
    slug: "creion-partas",
    category: "pixuri",
    mode: "simple",
    kind: "uvItem",
    // The card has 4×1.5 (it wins); proposed 4×0.5 («уточнить»).
    fallbackPrintAreaCm: { widthCm: 4, heightCm: 0.5 },
    name: { ro: "Creion PARTAS din hârtie reciclată", ru: "Карандаш PARTAS из переработанной бумаги", en: "PARTAS recycled paper pencil" },
    subtitle: { ro: "Eco · imprimare UV", ru: "Эко · УФ-печать", en: "Eco · UV print" },
    description: {
      ro: "Creion din hârtie reciclată. Imprimare UV cu logoul tău — un mic cadou promoțional pentru evenimente și școli.",
      ru: "Карандаш из переработанной бумаги. УФ-печать вашего логотипа — небольшой промо-подарок для мероприятий и школ.",
      en: "Pencil made from recycled paper. UV print of your logo — a small promotional gift for events and schools.",
    },
    options: [{ sku: "LA1573S129", label: C.natural, hex: HEX.natural }],
  },

  // ─── tricouri ────────────────────────────────────────────────────────────
  {
    slug: "polo-austral",
    category: "tricouri",
    mode: "dtf",
    garment: "tshirt",
    name: { ro: "Tricou polo AUSTRAL cu imprimare", ru: "Поло AUSTRAL с принтом", en: "AUSTRAL polo shirt with your print" },
    subtitle: { ro: "M–XL · 4 culori · imprimare DTF", ru: "M–XL · 4 цвета · печать DTF", en: "M–XL · 4 colours · DTF print" },
    description: {
      ro: "Tricou polo din bumbac cu mânecă scurtă, țesătură pique, guler tricotat 1×1 și 3 nasturi. Imprimare DTF pe față și pe spate.",
      ru: "Хлопковое поло с коротким рукавом, плетение пике, вязаный воротник 1×1, планка на три пуговицы. Печать DTF спереди и сзади.",
      en: "Short-sleeved cotton polo shirt, piqué knit, 1×1 knitted collar and a 3-button placket. DTF print on the front and back.",
    },
    options: [
      { sku: "PO6632-01", label: { ro: "Alb", ru: "Белое", en: "White" }, hex: HEX.white },
      { sku: "PO6632-02", label: { ro: "Negru", ru: "Чёрное", en: "Black" }, hex: HEX.black },
      { sku: "PO6632-20", label: { ro: "Verde", ru: "Зелёное", en: "Green" }, hex: "#1f6b3a" },
      { sku: "PO6632-55", label: { ro: "Bleumarin", ru: "Тёмно-синее", en: "Navy" }, hex: HEX.navy },
    ],
  },
  {
    slug: "body-sweet",
    category: "tricouri",
    mode: "dtf",
    garment: "item",
    zones: frontZone({ ro: "Față", ru: "Спереди", en: "Front" }, "Боди, спереди"),
    // Bodysuit about 23×40 cm: up to A6 on the front («уточнить»).
    maxPrintCm: A6_PRINT,
    name: { ro: "Body pentru bebeluși SWEET", ru: "Детское боди SWEET", en: "SWEET baby bodysuit" },
    subtitle: { ro: "Pe bretele · imprimare DTF", ru: "На бретелях · печать DTF", en: "Sleeveless · DTF print" },
    description: {
      ro: "Body pentru nou-născuți din tricot simplu, fără mâneci: decolteu rotund, margini cu bordură rib 1×1, capse jos și umeri petrecuți. Imprimare DTF pe față.",
      ru: "Боди для новорождённых на бретелях из одинарного трикотажа: круглая горловина, окантовка в рубчик 1×1, застёжка на кнопки снизу, перекрёстный запах на плечах. Печать DTF спереди.",
      en: "Sleeveless single-jersey bodysuit for newborns: crew neck, 1×1 ribbed edges, snap fastening at the crotch and crossed shoulders. DTF print on the front.",
    },
    options: [
      { sku: "BD7201-01", label: { ro: "Alb", ru: "Белое", en: "White" }, hex: HEX.white },
      { sku: "BD7201-48", label: { ro: "Roz deschis", ru: "Светло-розовое", en: "Light pink" }, hex: "#f4c7d3" },
    ],
  },

  // ─── genti ───────────────────────────────────────────────────────────────
  {
    slug: "geanta-nimes",
    category: "genti",
    mode: "dtf",
    garment: "item",
    zones: bagZones("Сумка NIMES"),
    // Bag 38×41 cm: up to A4 («уточнить»).
    maxPrintCm: A4_PRINT,
    name: { ro: "Geantă din iută NIMES", ru: "Джутовая сумка NIMES", en: "NIMES jute bag" },
    subtitle: { ro: "Mânere colorate · 6 culori · imprimare DTF", ru: "Цветные ручки · 6 цветов · печать DTF", en: "Coloured handles · 6 colours · DTF print" },
    description: {
      ro: "Geantă din iută naturală cu mânere din bumbac colorate, întărite, și margini cusute. Imprimare DTF cu logoul tău pe față și pe spate.",
      ru: "Сумка из натурального джута с усиленными цветными хлопковыми ручками и прошитыми краями. Печать DTF вашего логотипа с лицевой и обратной стороны.",
      en: "Natural jute bag with reinforced coloured cotton handles and sewn edges. DTF print of your logo on the front and back.",
    },
    options: [
      { sku: "BO7149S129", label: F.natural, hex: HEX.natural },
      { sku: "BO7149S103", label: F.yellow, hex: HEX.yellow },
      { sku: "BO7149S105", label: F.blue, hex: HEX.blue },
      { sku: "BO7149S1226", label: F.green, hex: HEX.green },
      { sku: "BO7149S131", label: F.orange, hex: HEX.orange },
      { sku: "BO7149S160", label: F.red, hex: HEX.red },
    ],
  },
  {
    slug: "geanta-niza",
    category: "genti",
    mode: "dtf",
    garment: "item",
    zones: bagZones("Сумка NIZA"),
    maxPrintCm: A4_PRINT,
    name: { ro: "Sacoșă din bumbac NIZA", ru: "Хлопковая сумка-шопер NIZA", en: "NIZA cotton tote bag" },
    subtitle: { ro: "100% bumbac · 3 culori · imprimare DTF", ru: "100% хлопок · 3 цвета · печать DTF", en: "100% cotton · 3 colours · DTF print" },
    description: {
      ro: "Sacoșă de cumpărături din bumbac 100%, cu mânere lungi de 70 cm. Imprimare DTF cu logoul tău pe față și pe spate.",
      ru: "Сумка-шопер из 100% хлопка с ручками длиной 70 см. Печать DTF вашего логотипа с лицевой и обратной стороны.",
      en: "Shopping tote in 100% cotton with 70 cm long handles. DTF print of your logo on the front and back.",
    },
    options: [
      { sku: "BO7160S102", label: F.black, hex: HEX.black },
      { sku: "BO7160S103", label: F.yellow, hex: HEX.yellow },
      { sku: "BO7160S1226", label: F.green, hex: HEX.green },
    ],
  },
  {
    slug: "geanta-palmira",
    category: "genti",
    mode: "dtf",
    garment: "item",
    zones: bagZones("Сумка PALMIRA"),
    maxPrintCm: A4_PRINT,
    name: { ro: "Sacoșă PALMIRA din bumbac reciclat", ru: "Сумка PALMIRA из переработанного хлопка", en: "PALMIRA recycled cotton bag" },
    subtitle: { ro: "120 g/m² · 3 culori · imprimare DTF", ru: "120 г/м² · 3 цвета · печать DTF", en: "120 g/m² · 3 colours · DTF print" },
    description: {
      ro: "Sacoșă de cumpărături din bumbac reciclat, 120 g/m². Imprimare DTF cu logoul tău pe față și pe spate.",
      ru: "Сумка для покупок из переработанного хлопка, 120 г/м². Печать DTF вашего логотипа с лицевой и обратной стороны.",
      en: "Shopping bag made of recycled cotton, 120 g/m². DTF print of your logo on the front and back.",
    },
    options: [
      { sku: "BO7188S102", label: F.black, hex: HEX.black },
      { sku: "BO7188S105", label: F.blue, hex: HEX.blue },
      { sku: "BO7188S160", label: F.red, hex: HEX.red },
    ],
  },
  {
    slug: "rucsac-manley",
    category: "genti",
    mode: "dtf",
    garment: "item",
    zones: frontZone({ ro: "Față", ru: "Спереди", en: "Front" }, "Рюкзак MANLEY: спереди"),
    // About 48 cm: up to A5 on the front («уточнить»).
    maxPrintCm: A5_PRINT,
    name: { ro: "Geantă sport pliabilă MANLEY", ru: "Складная спортивная сумка MANLEY", en: "MANLEY foldable sports bag" },
    subtitle: { ro: "RPET · 2 culori · imprimare DTF", ru: "RPET · 2 цвета · печать DTF", en: "RPET · 2 colours · DTF print" },
    description: {
      ro: "Geantă sport pliabilă din RPET 290T: compartiment principal cu fermoar și buzunar exterior cu fermoar dublu, care servește și ca husă de depozitare. Două mânere asortate. Imprimare DTF pe față.",
      ru: "Складная спортивная сумка из RPET 290T: основное отделение на молнии и внешний карман на двойной молнии, который служит и чехлом для хранения. Две ручки в тон. Печать DTF спереди.",
      en: "Foldable sports bag in 290T RPET: a zipped main compartment and an outer double-zip pocket that also works as a storage pouch. Two matching handles. DTF print on the front.",
    },
    options: [
      { sku: "BO1942S10547P1", label: { ro: "Albastru / gri", ru: "Синий / серый", en: "Blue / grey" }, hex: "#1f4fb4" },
      { sku: "BO1942S15547P1", label: { ro: "Bleumarin / gri", ru: "Тёмно-синий / серый", en: "Navy / grey" }, hex: HEX.navy },
    ],
  },
  {
    slug: "penar-colina",
    category: "genti",
    mode: "dtf",
    garment: "item",
    zones: frontZone({ ro: "Față", ru: "Спереди", en: "Front" }, "Пенал COLINA: спереди"),
    // Case 22×11 cm: a logo up to 10×10 («уточнить»).
    maxPrintCm: LOGO_PRINT,
    name: { ro: "Penar COLINA", ru: "Пенал COLINA", en: "COLINA pencil case" },
    subtitle: { ro: "Poliester · 6 culori · imprimare DTF", ru: "Полиэстер · 6 цветов · печать DTF", en: "Polyester · 6 colours · DTF print" },
    description: {
      ro: "Penar din poliester cu compartiment pentru creioane, pixuri și alte instrumente de scris. Imprimare DTF cu logoul tău.",
      ru: "Пенал из полиэстера с отделением для карандашей, ручек и других письменных принадлежностей. Печать DTF вашего логотипа.",
      en: "Polyester pencil case with a compartment for pencils, pens and other writing items. DTF print of your logo.",
    },
    options: [
      { sku: "BO7559S102", label: C.black, hex: HEX.black },
      { sku: "BO7559S103", label: C.yellow, hex: HEX.yellow },
      { sku: "BO7559S105", label: C.blue, hex: HEX.blue },
      { sku: "BO7559S1226", label: C.green, hex: HEX.green },
      { sku: "BO7559S131", label: C.orange, hex: HEX.orange },
      { sku: "BO7559S160", label: C.red, hex: HEX.red },
    ],
  },
  {
    slug: "penar-solaz",
    category: "genti",
    mode: "dtf",
    garment: "item",
    zones: frontZone({ ro: "Față", ru: "Спереди", en: "Front" }, "Пенал SOLAZ: спереди"),
    maxPrintCm: LOGO_PRINT,
    name: { ro: "Penar de colorat SOLAZ", ru: "Детский пенал-раскраска SOLAZ", en: "SOLAZ colouring pencil case" },
    subtitle: { ro: "Cu 5 creioane colorate · imprimare DTF", ru: "С 5 цветными карандашами · печать DTF", en: "With 5 crayons · DTF print" },
    description: {
      ro: "Penar pentru copii din material nețesut, cu desen de colorat și 5 creioane colorate incluse. Imprimare DTF cu logoul sau numele tău.",
      ru: "Детский пенал из нетканого материала с рисунком для раскрашивания, 5 цветных карандашей в комплекте. Печать DTF логотипа или имени.",
      en: "Kids' pencil case in non-woven fabric with a design to colour in and 5 crayons included. DTF print of your logo or name.",
    },
    options: [{ sku: "ET7571S201", label: C.white, hex: HEX.white }],
  },

  // ─── jucarii ─────────────────────────────────────────────────────────────
  {
    slug: "ursulet-koda",
    category: "jucarii",
    mode: "dtf",
    garment: "item",
    zones: frontZone(
      { ro: "Pe tricoul ursulețului", ru: "На футболке мишки", en: "On the bear's T-shirt" },
      "Футболка мишки, спереди",
    ),
    // The bear's small T-shirt: up to A6 (as LENNY / JAZZ).
    maxPrintCm: A6_PRINT,
    name: { ro: "Ursuleț KODA cu tricou", ru: "Мишка KODA в футболке", en: "KODA teddy bear in a T-shirt" },
    subtitle: { ro: "4 culori de tricou · imprimare DTF", ru: "4 цвета футболки · печать DTF", en: "4 T-shirt colours · DTF print" },
    description: {
      ro: "Ursuleț de pluș cu tricou din poliester, moale la atingere — un cadou ideal. Pe tricou imprimăm logoul sau desenul tău (DTF).",
      ru: "Плюшевый мишка в футболке из полиэстера RPET, мягкий на ощупь — отличный подарок. На футболке печатаем ваш логотип или рисунок (DTF).",
      en: "Plush teddy bear in a polyester T-shirt, soft to the touch — an ideal gift. We print your logo or design on the T-shirt (DTF).",
    },
    options: [
      { sku: "FT1548S202", label: C.black, hex: HEX.black },
      { sku: "FT1548S203", label: C.yellow, hex: HEX.yellow },
      { sku: "FT1548S205", label: C.blue, hex: HEX.blue },
      { sku: "FT1548S260", label: C.red, hex: HEX.red },
    ],
  },

  // ─── sticle ──────────────────────────────────────────────────────────────
  {
    slug: "sticla-lewik",
    category: "sticle",
    mode: "simple",
    kind: "uvItem",
    fallbackPrintAreaCm: BOTTLE_SIDE,
    name: { ro: "Sticlă LEWIK din aluminiu reciclat", ru: "Бутылка LEWIK из переработанного алюминия", en: "LEWIK recycled aluminium bottle" },
    subtitle: { ro: "600 ml · argintie · imprimare UV", ru: "600 мл · серебристая · УФ-печать", en: "600 ml · silver · UV print" },
    description: withNote(
      {
        ro: "Sticlă pentru apă din aluminiu reciclat, 600 ml.",
        ru: "Бутылка для воды из переработанного алюминия, 600 мл.",
        en: "Water bottle made of recycled aluminium, 600 ml.",
      },
      ONE_SIDE_NOTE,
    ),
    options: [{ sku: "BI4212S1251", label: { ro: "Argintie", ru: "Серебристая", en: "Silver" }, hex: "#c0c0c0" }],
  },
  {
    slug: "sticla-kisko",
    category: "sticle",
    mode: "simple",
    kind: "uvItem",
    fallbackPrintAreaCm: BOTTLE_SIDE,
    name: { ro: "Sticlă KISKO din aluminiu reciclat", ru: "Бутылка KISKO из переработанного алюминия", en: "KISKO recycled aluminium bottle" },
    subtitle: { ro: "4 culori · imprimare UV", ru: "4 цвета · УФ-печать", en: "4 colours · UV print" },
    description: withNote(
      {
        ro: "Sticlă pentru apă din aluminiu reciclat — un cadou eco reușit.",
        ru: "Бутылка для воды из переработанного алюминия — удачный эко-подарок.",
        en: "Water bottle made of recycled aluminium — a good eco gift.",
      },
      ONE_SIDE_NOTE,
    ),
    options: [
      { sku: "BI4213S102", label: F.black, hex: HEX.black },
      { sku: "BI4213S105", label: F.blue, hex: HEX.blue },
      { sku: "BI4213S1226", label: F.green, hex: HEX.green },
      { sku: "BI4213S160", label: F.red, hex: HEX.red },
    ],
  },
  {
    slug: "sticla-camu",
    category: "sticle",
    mode: "simple",
    kind: "uvItem",
    fallbackPrintAreaCm: BOTTLE_SIDE,
    name: { ro: "Sticlă de sticlă CAMU cu husă", ru: "Стеклянная бутылка CAMU в чехле", en: "CAMU glass bottle with a sleeve" },
    subtitle: { ro: "500 ml · 7 culori · imprimare UV", ru: "500 мл · 7 цветов · УФ-печать", en: "500 ml · 7 colours · UV print" },
    description: withNote(
      {
        ro: "Sticlă de sticlă de 500 ml cu husă din neopren colorată și curea de purtat în aceeași culoare.",
        ru: "Стеклянная бутылка 500 мл с цветным неопреновым чехлом и ремешком для переноски в тон.",
        en: "500 ml glass bottle with a coloured neoprene sleeve and a matching carry strap.",
      },
      ONE_SIDE_NOTE,
    ),
    options: [
      { sku: "MD4040S102", label: F.black, hex: HEX.black },
      { sku: "MD4040S103", label: F.yellow, hex: HEX.yellow },
      { sku: "MD4040S105", label: F.blue, hex: HEX.blue },
      { sku: "MD4040S1226", label: F.green, hex: HEX.green },
      { sku: "MD4040S131", label: F.orange, hex: HEX.orange },
      { sku: "MD4040S140", label: { ro: "Fucsia", ru: "Фуксия", en: "Fuchsia" }, hex: "#d6247f" },
      { sku: "MD4040S160", label: F.red, hex: HEX.red },
    ],
  },
  {
    slug: "carafa-adaya",
    category: "sticle",
    mode: "simple",
    kind: "sublItem",
    // Jug 15.1 × Ø8.1 cm («уточнить»).
    printAreaCm: { widthCm: 8, heightCm: 10 },
    name: { ro: "Borcan de sticlă ADAYA", ru: "Стеклянная банка ADAYA", en: "ADAYA glass jar" },
    subtitle: { ro: "500 ml · imprimare prin sublimare", ru: "500 мл · сублимационная печать", en: "500 ml · sublimation print" },
    description: {
      ro: "Borcan din sticlă borosilicată de 500 ml, potrivit pentru sublimare. Imprimarea ta e inclusă în preț.",
      ru: "Банка из боросиликатного стекла 500 мл, подходит для сублимации. Печать вашего дизайна входит в цену.",
      en: "500 ml borosilicate glass jar, made for sublimation. Your print is included in the price.",
    },
    options: [{ sku: "JR3986S100", label: { ro: "Transparent", ru: "Прозрачная", en: "Clear" }, hex: "#e6eef2" }],
  },

  // ─── jocuri ──────────────────────────────────────────────────────────────
  {
    slug: "joc-pensy",
    category: "jocuri",
    mode: "simple",
    kind: "uvItem",
    // Game 12×11.5 cm («уточнить»).
    fallbackPrintAreaCm: { widthCm: 10, heightCm: 10 },
    name: { ro: "X și 0 PENSY", ru: "Крестики-нолики PENSY", en: "PENSY tic-tac-toe" },
    subtitle: { ro: "Joc clasic · imprimare UV", ru: "Классическая игра · УФ-печать", en: "Classic game · UV print" },
    description: {
      ro: "Jocul clasic X și 0, un mic cadou promoțional. Imprimare UV cu logoul tău.",
      ru: "Классическая игра «крестики-нолики» — небольшой промо-подарок. УФ-печать вашего логотипа.",
      en: "The classic tic-tac-toe game, a small promotional gift. UV print of your logo.",
    },
    options: [{ sku: "JU1035S129", label: C.natural, hex: HEX.natural }],
  },
  {
    slug: "joc-vernon",
    category: "jocuri",
    mode: "simple",
    kind: "uvItem",
    // 9×11.5 cm («уточнить»).
    fallbackPrintAreaCm: { widthCm: 8, heightCm: 10 },
    name: { ro: "Joc de matematică VERNON", ru: "Математическая игра VERNON", en: "VERNON maths game" },
    subtitle: { ro: "Lemn · 32 de piese · imprimare UV", ru: "Дерево · 32 предмета · УФ-печать", en: "Wood · 32 pieces · UV print" },
    description: {
      ro: "Joc de matematică din lemn pentru copii, set de 32 de piese, în săculeț din bumbac. Imprimare UV cu logoul tău.",
      ru: "Деревянная математическая игра для детей, набор из 32 предметов, в хлопковом мешочке. УФ-печать вашего логотипа.",
      en: "Wooden maths game for kids, a 32-piece set in a cotton pouch. UV print of your logo.",
    },
    options: [{ sku: "JU1252S229", label: C.natural, hex: HEX.natural }],
  },
  {
    slug: "set-brisca",
    category: "jocuri",
    mode: "simple",
    kind: "uvItem",
    // On the lid (10 × 9.1 cm) «уточнить».
    fallbackPrintAreaCm: { widthCm: 8, heightCm: 8 },
    name: { ro: "Set de jocuri BRISCA", ru: "Набор игр BRISCA", en: "BRISCA game set" },
    subtitle: { ro: "Cărți și zaruri · cutie din lemn · imprimare UV", ru: "Карты и кости · деревянный ящик · УФ-печать", en: "Cards and dice · wooden box · UV print" },
    description: {
      ro: "Set de 2 jocuri de masă: cărți franceze și zaruri, într-o cutie din lemn cu două compartimente și capac glisant. Imprimare UV pe capac.",
      ru: "Набор из 2 настольных игр: французские карты и кости, в деревянном ящике с двумя отсеками и раздвижной крышкой. УФ-печать на крышке.",
      en: "Set of 2 table games: French cards and dice, in a wooden box with two compartments and a sliding lid. UV print on the lid.",
    },
    options: [{ sku: "JU1016S129", label: C.natural, hex: HEX.natural }],
  },
  {
    slug: "carti-naipe",
    category: "jocuri",
    mode: "simple",
    kind: "uvItem",
    // On the box (6×9 cm) «уточнить».
    fallbackPrintAreaCm: { widthCm: 5, heightCm: 8 },
    name: { ro: "Cărți de joc NAIPE", ru: "Игральные карты NAIPE", en: "NAIPE playing cards" },
    subtitle: { ro: "54 de cărți · carton reciclat · imprimare UV", ru: "54 карты · переработанный картон · УФ-печать", en: "54 cards · recycled board · UV print" },
    description: {
      ro: "Pachet de 54 de cărți franceze din carton reciclat. Imprimare UV pe cutie.",
      ru: "Колода из 54 французских карт из переработанного картона. УФ-печать на коробке.",
      en: "A deck of 54 French cards made of recycled cardboard. UV print on the box.",
    },
    options: [{ sku: "JU1028S129", label: C.natural, hex: HEX.natural }],
  },
  {
    slug: "set-ludus",
    category: "jocuri",
    mode: "simple",
    kind: "uvItem",
    // Box 19 × 7.6 cm («уточнить»).
    fallbackPrintAreaCm: { widthCm: 17, heightCm: 6 },
    name: { ro: "Set de jocuri LUDUS", ru: "Набор игр LUDUS", en: "LUDUS game set" },
    subtitle: { ro: "Cărți și domino · cutie din lemn · imprimare UV", ru: "Карты и домино · деревянный ящик · УФ-печать", en: "Cards and dominoes · wooden box · UV print" },
    description: {
      ro: "Set de 2 jocuri: pachet de cărți din carton reciclat și domino din lemn, într-o cutie din lemn. Imprimare UV pe cutie.",
      ru: "Набор из 2 игр: колода карт из переработанного картона и деревянное домино, в деревянном ящике. УФ-печать на ящике.",
      en: "A 2-game set: a recycled cardboard deck of cards and wooden dominoes in a wooden box. UV print on the box.",
    },
    options: [{ sku: "JU1592S129", label: C.natural, hex: HEX.natural }],
  },

  // ─── craciun ─────────────────────────────────────────────────────────────
  {
    slug: "magnet-klaus",
    category: "craciun",
    mode: "simple",
    kind: "uvItem",
    // Magnet 20×10 cm («уточнить»).
    fallbackPrintAreaCm: { widthCm: 8, heightCm: 8 },
    name: { ro: "Magnet de Crăciun KLAUS cu carnețel", ru: "Новогодний магнит KLAUS с блокнотом", en: "KLAUS Christmas magnet with a notepad" },
    subtitle: { ro: "Moș Crăciun · imprimare UV", ru: "Санта · УФ-печать", en: "Santa · UV print" },
    description: {
      ro: "Magnet de Crăciun cu Moș Crăciun, cu carnețel de 40 de file albe și creion — pentru planurile de sărbători. Imprimare UV cu logoul tău.",
      ru: "Новогодний магнит с Сантой, блокнотом на 40 чистых листов и карандашом — для праздничных планов. УФ-печать вашего логотипа.",
      en: "Christmas magnet with a Santa design, a 40-sheet plain notepad and a pencil — for the holiday plans. UV print of your logo.",
    },
    options: [{ sku: "XM1304S160", label: C.red, hex: HEX.red }],
  },
  {
    slug: "rama-filey",
    category: "craciun",
    mode: "simple",
    kind: "uvItem",
    // Ornament 10.5×9.5 cm («уточнить»).
    fallbackPrintAreaCm: { widthCm: 6, heightCm: 6 },
    name: { ro: "Ornament-ramă foto FILEY", ru: "Ёлочная фоторамка FILEY", en: "FILEY photo frame ornament" },
    subtitle: { ro: "Lemn · 3 forme · imprimare UV", ru: "Дерево · 3 формы · УФ-печать", en: "Wood · 3 shapes · UV print" },
    description: {
      ro: "Ornament de brad din lemn cu ramă foto pentru o fotografie rotundă de 4,5 cm. Imprimare UV cu textul sau logoul tău.",
      ru: "Деревянное ёлочное украшение-фоторамка для круглого фото диаметром 4,5 см. УФ-печать вашего текста или логотипа.",
      en: "Wooden Christmas tree ornament with a photo frame for a round 4.5 cm photo. UV print of your text or logo.",
    },
    options: [
      { sku: "XM1511S1511", label: { ro: "Stea", ru: "Звезда", en: "Star" }, hex: "#d9b98a" },
      { sku: "XM1511S1512", label: { ro: "Brad", ru: "Ёлка", en: "Tree" }, hex: "#c9a97a" },
      { sku: "XM1511S1517", label: { ro: "Cizmă", ru: "Сапожок", en: "Boot" }, hex: "#b8956a" },
    ],
  },
  {
    slug: "creion-nuss",
    category: "craciun",
    mode: "simple",
    kind: "uvItem",
    fallbackPrintAreaCm: { widthCm: 4, heightCm: 0.5 },
    name: { ro: "Creion de Crăciun NUSS", ru: "Новогодний карандаш NUSS", en: "NUSS Christmas pencil" },
    subtitle: { ro: "Lemn · 3 modele · imprimare UV", ru: "Дерево · 3 рисунка · УФ-печать", en: "Wood · 3 designs · UV print" },
    description: {
      ro: "Creion de lemn cu Moș Crăciun, om de zăpadă sau brad. Imprimare UV cu logoul tău — un mic cadou de sărbători.",
      ru: "Деревянный карандаш с Сантой, снеговиком или ёлкой. УФ-печать вашего логотипа — небольшой праздничный подарок.",
      en: "Wooden pencil with a Santa, snowman or Christmas tree design. UV print of your logo — a small holiday gift.",
    },
    options: [
      { sku: "XM1303S1512", label: { ro: "Brad", ru: "Ёлка", en: "Tree" }, hex: "#2f7a4a" },
      { sku: "XM1303S1515", label: { ro: "Moș Crăciun", ru: "Санта", en: "Santa" }, hex: "#c0262d" },
      { sku: "XM1303S1516", label: { ro: "Om de zăpadă", ru: "Снеговик", en: "Snowman" }, hex: "#f4f4f4" },
    ],
  },
  {
    slug: "sac-arsuk",
    category: "craciun",
    mode: "dtf",
    garment: "item",
    zones: frontZone({ ro: "Față", ru: "Спереди", en: "Front" }, "Мешок ARSUK: спереди"),
    // Bag 13×23 cm: up to A6 («уточнить»).
    maxPrintCm: A6_PRINT,
    name: { ro: "Săculeț de cadou ARSUK", ru: "Подарочный мешочек ARSUK", en: "ARSUK gift bag" },
    subtitle: { ro: "Bumbac · 2 modele · imprimare DTF", ru: "Хлопок · 2 рисунка · печать DTF", en: "Cotton · 2 designs · DTF print" },
    description: {
      ro: "Săculeț de cadou din bumbac 100% cu model de Crăciun, reutilizabil. Imprimare DTF cu logoul sau urarea ta.",
      ru: "Подарочный мешочек из 100% хлопка с новогодним рисунком, многоразовый. Печать DTF вашего логотипа или поздравления.",
      en: "Reusable 100% cotton gift bag with a Christmas design. DTF print of your logo or greeting.",
    },
    options: [
      { sku: "XM1157S1512", label: { ro: "Brad", ru: "Ёлка", en: "Tree" }, hex: "#2f7a4a" },
      { sku: "XM1157S1515", label: { ro: "Moș Crăciun", ru: "Санта", en: "Santa" }, hex: "#c0262d" },
    ],
  },
  {
    slug: "ciorap-noel",
    category: "craciun",
    mode: "dtf",
    garment: "item",
    zones: frontZone({ ro: "Față", ru: "Спереди", en: "Front" }, "Носок NOEL: спереди"),
    // Stocking 34×22 cm: up to A6 («уточнить»).
    maxPrintCm: A6_PRINT,
    name: { ro: "Ciorap de Crăciun NOEL", ru: "Новогодний носок NOEL", en: "NOEL Christmas stocking" },
    subtitle: { ro: "Pentru cadouri · imprimare DTF", ru: "Для подарков · печать DTF", en: "For gifts · DTF print" },
    description: {
      ro: "Ciorap clasic de Crăciun pentru cadouri, cu agățătoare pentru brad. Imprimare DTF cu numele sau logoul tău.",
      ru: "Классический новогодний носок для подарков с петлёй, чтобы повесить на ёлку. Печать DTF имени или логотипа.",
      en: "Classic Christmas stocking for presents, with a loop to hang it on the tree. DTF print of your name or logo.",
    },
    options: [{ sku: "XM1301S160", label: C.red, hex: HEX.red }],
  },
  {
    slug: "caciula-elfy",
    category: "craciun",
    mode: "dtf",
    garment: "item",
    zones: frontZone({ ro: "Față", ru: "Спереди", en: "Front" }, "Шапка ELFY: спереди"),
    maxPrintCm: LOGO_PRINT,
    name: { ro: "Căciulă de Moș Crăciun ELFY", ru: "Шапка Санты ELFY", en: "ELFY Santa hat" },
    subtitle: { ro: "Pentru copii · imprimare DTF", ru: "Детская · печать DTF", en: "For kids · DTF print" },
    description: {
      ro: "Căciulă de Moș Crăciun pentru copii. Imprimare DTF cu numele sau logoul tău pe față.",
      ru: "Детская шапка Санты. Печать DTF имени или логотипа спереди.",
      en: "Santa hat for kids. DTF print of your name or logo on the front.",
    },
    options: [{ sku: "XM1502S160", label: F.red, hex: HEX.red }],
  },

  // ─── cadouri ─────────────────────────────────────────────────────────────
  {
    slug: "figurina-nika",
    category: "cadouri",
    mode: "simple",
    kind: "uvItem",
    name: { ro: "Figurină trofeu NIKA", ru: "Наградная фигурка «Ника»", en: "NIKA award figurine" },
    subtitle: { ro: "14 sau 18 cm · plăcuță cu imprimarea ta", ru: "14 или 18 см · табличка с вашей печатью", en: "14 or 18 cm · plate with your print" },
    description: {
      ro: "Figurină de premiere «Nika»: 14 cm, sau 18 cm de culoarea bronzului, cu suport pentru o inserție rotundă D50 mm. Imprimarea plăcuței (UV-DTF) e inclusă în preț.",
      ru: "Наградная фигурка «Ника»: 14 см или 18 см бронзового цвета с держателем под круглую вставку D50 мм. Печать таблички (UV-DTF) входит в цену.",
      en: "«Nika» award figurine: 14 cm, or 18 cm in bronze with a holder for a round D50 mm insert. The plate print (UV-DTF) is included in the price.",
    },
    options: [
      { sku: "F20-S-K", label: { ro: "14 cm", ru: "14 см", en: "14 cm" }, hex: "#c9c9c9" },
      { sku: "F32-B-K", label: { ro: "18 cm, bronz", ru: "18 см, бронза", en: "18 cm, bronze" }, hex: "#a87a3d" },
    ],
  },
  {
    slug: "ruleta-pick",
    category: "cadouri",
    mode: "simple",
    kind: "uvItem",
    // Body 7×7 cm («уточнить»).
    fallbackPrintAreaCm: { widthCm: 4, heightCm: 4 },
    name: { ro: "Ruletă PICK de 5 m", ru: "Рулетка PICK 5 м", en: "PICK 5 m measuring tape" },
    subtitle: { ro: "Corp cauciucat · imprimare UV", ru: "Прорезиненный корпус · УФ-печать", en: "Rubber body · UV print" },
    description: {
      ro: "Ruletă omologată de 5 m cu blocare și cârlig metalic, corp cauciucat roșu. Imprimare UV cu logoul tău.",
      ru: "Сертифицированная рулетка 5 м с фиксатором и металлическим крючком, красный прорезиненный корпус. УФ-печать вашего логотипа.",
      en: "Approved 5 m measuring tape with a lock and a metal hook, red rubber body. UV print of your logo.",
    },
    options: [{ sku: "TO0106S160", label: F.red, hex: HEX.red }],
  },
  {
    slug: "breloc-crux",
    category: "cadouri",
    mode: "simple",
    kind: "uvItem",
    // Keyring 3.4×8.5 cm («уточнить»).
    fallbackPrintAreaCm: { widthCm: 2.5, heightCm: 5 },
    name: { ro: "Breloc-cablu de încărcare CRUX 3 în 1", ru: "Брелок-кабель для зарядки CRUX 3 в 1", en: "CRUX 3-in-1 charging cable keyring" },
    subtitle: { ro: "Micro USB, Type-C, Lightning · imprimare UV", ru: "Micro USB, Type-C, Lightning · УФ-печать", en: "Micro USB, Type-C, Lightning · UV print" },
    description: {
      ro: "Cablu de încărcare-breloc cu conectori Micro USB, Type-C și Lightning. Imprimare UV cu numele sau logoul tău.",
      ru: "Брелок с кабелем для зарядки: разъёмы Micro USB, Type-C и Lightning. УФ-печать имени или логотипа.",
      en: "Keyring charging cable with Micro USB, Type-C and Lightning connectors. UV print of your name or logo.",
    },
    // Black, blue (blurred photos), yellow and red (photo of the green one) left out until the studio has photos.
    options: [
      { sku: "IA3009S101", label: C.white, hex: HEX.white },
      { sku: "IA3009S1226", label: C.green, hex: HEX.green },
      { sku: "IA3009S131", label: C.orange, hex: HEX.orange },
    ],
  },
  {
    slug: "breloc-belsan",
    category: "cadouri",
    mode: "simple",
    kind: "uvItem",
    // Keyring 2.7×7.8 cm («уточнить»).
    fallbackPrintAreaCm: { widthCm: 2, heightCm: 5 },
    name: { ro: "Breloc metalic BELSAN", ru: "Металлический брелок BELSAN", en: "BELSAN metal keyring" },
    subtitle: { ro: "Cupru și negru · 2 forme · imprimare UV", ru: "Медь и чёрный · 2 формы · УФ-печать", en: "Copper and black · 2 shapes · UV print" },
    description: {
      ro: "Breloc metalic cu finisaj de cupru și interior negru, cu o suprafață largă pentru logo. Imprimare UV.",
      ru: "Металлический брелок с медным покрытием и чёрной внутренней частью, с широкой поверхностью под логотип. УФ-печать.",
      en: "Metal keyring with a copper finish and a black inside, with a wide surface for a logo. UV print.",
    },
    options: [
      { sku: "KO2024S1981", label: { ro: "Dreptunghiular", ru: "Прямоугольный", en: "Rectangular" }, hex: "#b87333" },
      { sku: "KO2024S1983", label: { ro: "Oval", ru: "Овальный", en: "Oval" }, hex: "#a8652c" },
    ],
  },
  {
    slug: "rama-pixel",
    category: "cadouri",
    mode: "simple",
    kind: "uvItem",
    // On the frame border (15×19 cm) «уточнить».
    fallbackPrintAreaCm: { widthCm: 12, heightCm: 3 },
    name: { ro: "Ramă foto PIXEL 10×15", ru: "Фоторамка PIXEL 10×15", en: "PIXEL 10×15 photo frame" },
    subtitle: { ro: "MDF și sticlă · imprimare UV", ru: "МДФ и стекло · УФ-печать", en: "MDF and glass · UV print" },
    description: {
      ro: "Ramă foto pentru o fotografie 10×15, din MDF și sticlă, se așază orizontal sau vertical. Imprimare UV pe ramă cu textul sau logoul tău.",
      ru: "Фоторамка для фото 10×15 из МДФ и стекла, ставится горизонтально или вертикально. УФ-печать текста или логотипа на рамке.",
      en: "Photo frame for a 10×15 photo, made of MDF and glass, stands horizontally or vertically. UV print of your text or logo on the frame.",
    },
    options: [{ sku: "HO1278S129", label: F.natural, hex: HEX.natural }],
  },
  {
    slug: "medalie-dresel",
    category: "cadouri",
    mode: "simple",
    kind: "sublItem",
    // Ø7 cm disc, print Ø5 («уточнить»).
    printAreaCm: { widthCm: 5, heightCm: 5 },
    name: { ro: "Medalie DRESEL cu panglică", ru: "Медаль DRESEL с лентой", en: "DRESEL medal with a ribbon" },
    subtitle: { ro: "Ø 7 cm · 3 culori · sublimare", ru: "Ø 7 см · 3 цвета · сублимация", en: "Ø 7 cm · 3 colours · sublimation" },
    description: {
      ro: "Medalie metalică de Ø 7 cm cu panglică din poliester și carabină. Imprimarea ta prin sublimare e inclusă în preț.",
      ru: "Металлическая медаль Ø 7 см с лентой из полиэстера и карабином. Сублимационная печать вашего дизайна входит в цену.",
      en: "Ø 7 cm metal medal with a polyester ribbon and a carabiner. Your sublimation print is included in the price.",
    },
    options: [
      { sku: "CP2043S101", label: F.white, hex: HEX.white },
      { sku: "CP2043S1226", label: F.green, hex: HEX.green },
      { sku: "CP2043S160", label: F.red, hex: HEX.red },
    ],
  },
  {
    slug: "snur-host",
    category: "cadouri",
    mode: "simple",
    kind: "sublItem",
    // Lanyard 2×50 cm («уточнить»).
    printAreaCm: { widthCm: 1.5, heightCm: 45 },
    name: { ro: "Șnur pentru ecuson HOST", ru: "Шнурок для бейджа HOST", en: "HOST lanyard" },
    subtitle: { ro: "Cu carabină · 10 culori · sublimare", ru: "С карабином · 10 цветов · сублимация", en: "With a carabiner · 10 colours · sublimation" },
    description: {
      ro: "Șnur din poliester cu carabină, pentru ecuson sau chei. Imprimarea ta prin sublimare e inclusă în preț.",
      ru: "Шнурок из полиэстера с карабином — для бейджа или ключей. Сублимационная печать вашего дизайна входит в цену.",
      en: "Polyester lanyard with a carabiner, for a badge or keys. Your sublimation print is included in the price.",
    },
    options: [
      { sku: "LY7053S101", label: C.white, hex: HEX.white },
      { sku: "LY7053S102", label: C.black, hex: HEX.black },
      { sku: "LY7053S103", label: C.yellow, hex: HEX.yellow },
      { sku: "LY7053S105", label: C.blue, hex: HEX.blue },
      { sku: "LY7053S1242", label: { ro: "Albastru deschis", ru: "Голубой", en: "Light blue" }, hex: "#5aaee6" },
      { sku: "LY7053S1226", label: C.green, hex: HEX.green },
      { sku: "LY7053S131", label: C.orange, hex: HEX.orange },
      { sku: "LY7053S148", label: { ro: "Roz deschis", ru: "Светло-розовый", en: "Light pink" }, hex: "#f4c2cf" },
      { sku: "LY7053S160", label: C.red, hex: HEX.red },
      { sku: "LY7053S171", label: { ro: "Mov", ru: "Фиолетовый", en: "Purple" }, hex: "#7b4fa0" },
    ],
  },

  // ─── calendar (no own category: «Cadouri» + Tipografie's calendar group) ──
  {
    slug: "calendar-medus",
    category: "cadouri",
    mode: "simple",
    kind: "uvItem",
    // Base 13.6×4.9 cm («уточнить»).
    fallbackPrintAreaCm: { widthCm: 10, heightCm: 4 },
    name: { ro: "Calendar perpetuu MEDUS din bambus", ru: "Вечный календарь MEDUS из бамбука", en: "MEDUS bamboo perpetual calendar" },
    subtitle: { ro: "De birou · imprimare UV", ru: "Настольный · УФ-печать", en: "Desk calendar · UV print" },
    description: {
      ro: "Calendar perpetuu de birou din bambus. Imprimare UV cu logoul tău.",
      ru: "Настольный вечный календарь из бамбука. УФ-печать вашего логотипа.",
      en: "Bamboo perpetual desk calendar. UV print of your logo.",
    },
    options: [{ sku: "CN1002S129", label: C.natural, hex: HEX.natural }],
  },
];

/**
 * The shop's fallback main print zone of a UV stock item (`fallbackPrintAreaCm`
 * of the `uvItem` product selling this item SKU), or null. The studio wizard
 * starts the item's main zone at this size while the card has no print
 * parameters, so staff see the size the shop sells (FILEY 6×6 …).
 */
export function shopFallbackPrintAreaCm(itemSku: string): { widthCm: number; heightCm: number } | null {
  for (const c of SHOP_STOCK_PRODUCTS) {
    if (c.mode === "simple" && c.kind === "uvItem" && c.fallbackPrintAreaCm && c.options.some((o) => o.sku === itemSku)) {
      return { ...c.fallbackPrintAreaCm };
    }
  }
  return null;
}
