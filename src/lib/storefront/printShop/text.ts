import { pluralIndex, type Localized, type ShopLang } from "../i18n";
import { psFormat, psProduct, type PsLamination } from "./config";
import { psLinePrice, psSizeText, type PsPrice, type PsQuoteLine } from "./pricing";

/**
 * Print shop strings (ro / ru / en, every key in every language — `tsc`
 * fails on a gap), line names for the cart / order, and the Russian staff
 * summary. Kept out of `i18n.ts` so the shared dictionary only gains nav keys.
 */

const L = (ro: string, ru: string, en: string): Localized => ({ ro, ru, en });

export const PS_TEXT = {
  format: L("Format", "Формат", "Size"),
  paper: L("Hârtie", "Бумага", "Paper"),
  paperGsm: L("{g} g/m²", "{g} г/м²", "{g} g/m²"),
  sides: L("Imprimare", "Печать", "Printing"),
  sidesOne: L("O față", "Одна сторона", "One side"),
  sidesTwo: L("Față + verso", "Две стороны", "Both sides"),
  pack: L("Tiraj", "Тираж", "Quantity"),
  packPcs: L("{n} buc.", "{n} шт.", "{n} pcs"),
  packSheets: L("{n} foi", "{n} листов", "{n} sheets"),
  lamination: L("Laminare", "Ламинация", "Lamination"),
  laminationNone: L("Fără", "Без ламинации", "None"),
  laminationGloss: L("Lucioasă", "Глянцевая", "Gloss"),
  laminationMatte: L("Mată", "Матовая", "Matte"),
  laminationExtra: L("+{price} / buc.", "+{price} / шт.", "+{price} / pc"),
  cut: L("Tăiere", "Резка", "Cutting"),
  cutNo: L("Simplu (foaia întreagă)", "Простые (лист целиком)", "Plain (whole sheet)"),
  cutYes: L("Decupat pe contur", "С вырезкой по контуру", "Die-cut along the outline"),
  sizeTitle: L("Format și fișier", "Формат и файл", "Size and file"),
  sizeFinished: L("Format final: {size} mm", "Готовый размер: {size} мм", "Finished size: {size} mm"),
  sizeFile: L("Fișier: {size} mm — câte {b} mm pentru tăiere (bleed) pe fiecare latură", "Файл: {size} мм — по {b} мм на подрезку (bleed) с каждой стороны", "File: {size} mm — {b} mm bleed on every side"),
  sizeFileNoBleed: L("Fișier: {size} mm", "Файл: {size} мм", "File: {size} mm"),
  sizeSafe: L("Textul și logoul — la cel puțin {s} mm de margine", "Текст и логотип — не ближе {s} мм к краю", "Keep text and logos at least {s} mm from the edge"),
  sizeRes: L("Imagine de minimum 300 dpi ({px} px) sau PDF", "Изображение от 300 dpi ({px} px) или PDF", "An image of at least 300 dpi ({px} px) or a PDF"),
  sizePdfOnly: L("Doar PDF", "Только PDF", "PDF only"),
  template: L("Descarcă șablonul (SVG)", "Скачать шаблон (SVG)", "Download the template (SVG)"),
  tplBleed: L("Bleed — fundalul continuă până la margine", "Bleed — фон доводите до края", "Bleed — extend the background to the edge"),
  tplTrim: L("Linia de tăiere", "Линия реза", "Cut line"),
  tplSafe: L("Zona sigură — text și logo aici", "Безопасная зона — текст и логотип здесь", "Safe zone — text and logos here"),
  tplFold: L("Linia de îndoire", "Линия сгиба", "Fold line"),
  fileFront: L("Fișierul pentru față", "Файл лицевой стороны", "Front file"),
  fileBack: L("Fișierul pentru verso", "Файл оборотной стороны", "Back file"),
  fileOne: L("Fișierul de tipar", "Файл для печати", "Print file"),
  filesRequired: L("Încarcă fișierul pentru fiecare parte imprimată", "Загрузите файл для каждой печатной стороны", "Upload a file for every printed side"),
  filesNote: L("Fișierele sunt obligatorii: PDF, PNG sau JPG", "Файлы обязательны: PDF, PNG или JPG", "Files are required: PDF, PNG or JPG"),
  filesNotePdf: L("Fișierul este obligatoriu: PDF", "Файл обязателен: PDF", "The file is required: PDF"),
  checkOkImage: L("{w}×{h} px · ~{dpi} dpi — calitate bună", "{w}×{h} px · ~{dpi} dpi — хорошее качество", "{w}×{h} px · ~{dpi} dpi — good quality"),
  checkOkPdf: L("PDF {w}×{h} mm — format corect", "PDF {w}×{h} мм — размер верный", "PDF {w}×{h} mm — correct size"),
  checkNoBleed: L(
    "Pare făcut fără bleed: completăm marginile automat, dar păstrați textul la distanță de margine.",
    "Похоже, файл без bleed: края дорисуем автоматически, но держите текст подальше от края.",
    "Looks like it has no bleed: we extend the edges automatically, but keep text away from the edge.",
  ),
  checkProportions: L(
    "Proporțiile nu corespund formatului — alegeți mai jos cum îl punem (recomandăm un fișier de {size} mm).",
    "Пропорции не совпадают с форматом — выберите ниже, как его разместить (рекомендуем файл {size} мм).",
    "The proportions do not match the size — choose below how to place it (we recommend a {size} mm file).",
  ),
  checkProportionsNoFit: L(
    "Proporțiile paginii nu corespund formatului: încărcați un PDF de {size} mm, ca paginile să fie tipărite fără margini albe sau tăieturi.",
    "Пропорции страницы не совпадают с форматом: загрузите PDF {size} мм, чтобы страницы напечатались без белых полей и обрезки.",
    "The page proportions do not match the size: upload a {size} mm PDF so the pages print without white margins or cropping.",
  ),
  checkTooSmall: L("Pagina PDF ({w}×{h} mm) e mai mică decât {size} mm.", "Страница PDF ({w}×{h} мм) меньше {size} мм.", "The PDF page ({w}×{h} mm) is smaller than {size} mm."),
  checkLowDpi: L("Rezoluție mică: ~{dpi} dpi. Recomandăm 300 dpi ({px} px).", "Низкое разрешение: ~{dpi} dpi. Рекомендуем 300 dpi ({px} px).", "Low resolution: ~{dpi} dpi. We recommend 300 dpi ({px} px)."),
  checkPages: L("PDF-ul are {pages}, trebuie {need}.", "В PDF {pages}, нужно {need}.", "The PDF has {pages}, {need} are needed."),
  checkPdfUnknown: L("PDF primit — verificăm mărimea înainte de tipar.", "PDF получен — размер проверим перед печатью.", "PDF received — we check the size before printing."),
  fit: L("Potrivire", "Размещение", "Fit"),
  fitCover: L("Umple (decupează)", "Заполнить (обрезать)", "Fill (crop)"),
  fitContain: L("Încadrează (margini albe)", "Вписать (белые поля)", "Fit (white margins)"),
  fitHint: L("Previzualizarea arată cum va fi tipărit.", "Предпросмотр показывает, как будет напечатано.", "The preview shows how it will be printed."),
  preview: L("Previzualizare", "Предпросмотр", "Preview"),
  previewLegend: L("Roșu — linia de tăiere, albastru — zona sigură", "Красный — линия реза, синий — безопасная зона", "Red — the cut line, blue — the safe zone"),
  previewEmpty: L("Încarcă fișierul ca să vezi rezultatul", "Загрузите файл, чтобы увидеть результат", "Upload the file to see the result"),
  pricePerPiece: L("{price} / buc. · {n} buc.", "{price} / шт. · {n} шт.", "{price} / pc · {n} pcs"),
  fromPerPiece: L("de la {price} / buc.", "от {price} / шт.", "from {price} / pc"),
  onRequestTitle: L("La cerere", "По запросу", "On request"),
  onRequestText: L(
    "Aceste produse le facem la comandă: sunați sau scrieți-ne și calculăm prețul exact.",
    "Эти изделия делаем по запросу: позвоните или напишите — посчитаем точную цену.",
    "We make these on request: call or write to us and we will work out the exact price.",
  ),
  onRequestCall: L("Sunați: {phone}", "Звоните: {phone}", "Call: {phone}"),
  categoryIntro: L(
    "Tipar digital color pe Ricoh Pro C5200s și tăiere pe ghilotină automată: flyere, invitații, meniuri, calendare, stickere și cărți de vizită. Prețuri din lista noastră de prețuri.",
    "Цифровая цветная печать на Ricoh Pro C5200s и резка на автоматической гильотине: листовки, приглашения, меню, календари, наклейки и визитки. Цены — по нашему прайсу.",
    "Digital colour printing on a Ricoh Pro C5200s and cutting on an automatic guillotine: flyers, invitations, menus, calendars, stickers and business cards. Prices from our price list.",
  ),
  // UV-DTF stickers
  uvTitle: L("Stickere UV-DTF", "Наклейки UV-DTF", "UV-DTF stickers"),
  uvSubtitle: L("Orice formă · rezistente la apă · 500 lei / metru", "Любая форма · не боятся воды · 500 лей / метр", "Any shape · waterproof · 500 lei / metre"),
  uvDescription: L(
    "Stickere UV-DTF: imprimare UV pe film transparent, cu alb și lac, fără fundal — se transferă pe sticlă, metal, plastic, lemn. Încarcă PNG cu fundal transparent, alege mărimea și tirajul. Prețul — după metrii de film (lățime 30 cm), minimum 100 lei.",
    "Наклейки UV-DTF: УФ-печать на прозрачной плёнке с белым и лаком, без фона — переносятся на стекло, металл, пластик, дерево. Загрузите PNG с прозрачным фоном, выберите размер и тираж. Цена — по метражу плёнки (ширина 30 см), минимум 100 лей.",
    "UV-DTF stickers: UV print on clear film with white and varnish, no background — they transfer onto glass, metal, plastic and wood. Upload a PNG with a transparent background, choose the size and quantity. Priced by film length (30 cm wide), 100 lei minimum.",
  ),
  uvDesign: L("Design {n}", "Дизайн {n}", "Design {n}"),
  uvAddDesign: L("+ Încă un design", "+ Ещё дизайн", "+ Another design"),
  uvWidth: L("Lățime, cm", "Ширина, см", "Width, cm"),
  uvHeight: L("Înălțime, cm", "Высота, см", "Height, cm"),
  uvQty: L("Seturi (câte un sticker din fiecare design)", "Комплектов (по одной наклейке каждого дизайна)", "Sets (one sticker of each design)"),
  uvPngHint: L("PNG cu fundal transparent, 300 dpi la mărimea aleasă", "PNG с прозрачным фоном, 300 dpi в выбранном размере", "A PNG with a transparent background, 300 dpi at the chosen size"),
  uvPngOnly: L("Doar PNG sau JPG (nu PDF): imprimanta UV citește imagini.", "Только PNG или JPG (не PDF): УФ-принтер читает изображения.", "PNG or JPG only (no PDF): the UV printer reads images."),
  uvTooWide: L("Latura mică nu poate depăși {max} cm (lățimea filmului).", "Меньшая сторона — не больше {max} см (ширина плёнки).", "The shorter side cannot exceed {max} cm (the film width)."),
  uvPriceNote: L("Preț după metrii de film, minimum {min}", "Цена по метражу плёнки, минимум {min}", "Priced by film length, minimum {min}"),
  uvRemove: L("Șterge", "Удалить", "Remove"),
} as const satisfies Record<string, Localized>;

export type PsTextKey = keyof typeof PS_TEXT;
export type PsT = (key: PsTextKey, vars?: Record<string, string | number>) => string;

export function psT(lang: ShopLang): PsT {
  return (key, vars) => {
    let s: string = PS_TEXT[key][lang];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/** «1 pagină / 2 pagini / 20 de pagini», «1 страница / 2 страницы / 5 страниц», «1 page / 2 pages»; «? pagini» when unknown. */
export function psPagesText(n: number | null | undefined, lang: ShopLang): string {
  const forms: Record<ShopLang, readonly [string, string, string]> = {
    ro: ["pagină", "pagini", "de pagini"],
    ru: ["страница", "страницы", "страниц"],
    en: ["page", "pages", "pages"],
  };
  if (n == null || !Number.isFinite(n)) return `? ${forms[lang][lang === "ru" ? 2 : 1]}`;
  return `${n} ${forms[lang][pluralIndex(n, lang)]}`;
}

/**
 * The wrong-proportions message of an artwork: products with a fit choice
 * (cover / contain buttons below) ask to choose; PDF-only products (desk
 * calendar) have no such buttons, so their text asks for a PDF of the size.
 */
export function psProportionsKey(product: { pagesPerPiece?: number }): "checkProportions" | "checkProportionsNoFit" {
  return product.pagesPerPiece != null ? "checkProportionsNoFit" : "checkProportions";
}

function laminationText(l: PsLamination, t: PsT): string {
  return l === "matte" ? t("laminationMatte") : t("laminationGloss");
}

/** Cart / order line name in a language. */
export function psLineTitle(line: PsQuoteLine, lang: ShopLang): string {
  return psProduct(line.product)?.name[lang] ?? line.product;
}

/** «A5 148×210 · 150 g/m² · Față + verso · Laminare: Mată». */
export function psLineOptions(line: PsQuoteLine, lang: ShopLang): string {
  const t = psT(lang);
  const p = psProduct(line.product);
  const f = p ? psFormat(p, line.format) : null;
  const parts: string[] = [];
  if (f) parts.push(psSizeText(f));
  if (line.paper != null) parts.push(t("paperGsm", { g: line.paper }));
  if (p && p.sides.length > 1) parts.push(line.sides === "two" ? t("sidesTwo") : t("sidesOne"));
  if (line.cut) parts.push(t("cutYes"));
  if (line.lamination) parts.push(`${t("lamination")}: ${laminationText(line.lamination, t)}`);
  if (line.fit) parts.push(line.fit === "contain" ? t("fitContain") : t("fitCover"));
  return parts.join(" · ");
}

/**
 * The staff note row (Russian): product, format, paper, sides, finishing, the
 * run and the sheets — «Листовки A5 148×210 · 150 г · 2 стор. · ламинация мат —
 * 100 шт. (50 л. A4+, по 2 на листе)».
 */
export function psStaffSummaryRu(line: PsQuoteLine, price: PsPrice | null = psLinePrice(line)): string {
  const p = psProduct(line.product);
  if (!p) return line.product;
  const f = psFormat(p, line.format);
  const parts: string[] = [`${p.staffRu}${f ? ` ${psSizeText(f)}` : ""}`];
  if (line.paper != null) parts.push(`${line.paper} г`);
  parts.push(line.sides === "two" ? "2 стор." : "1 стор.");
  if (line.cut) parts.push("контурная резка");
  if (line.lamination) parts.push(`ламинация ${line.lamination === "matte" ? "мат" : "глянец"}`);
  if (line.fit === "contain") parts.push("вписать (белые поля)");
  let qty = `${line.quantity} ${p.id === "stickerSheets" ? "л." : "шт."}`;
  if (p.pagesPerPiece) qty += ` × ${p.pagesPerPiece} стр.`;
  else if (price?.sheets && price.piecesPerSheet) qty += ` (${price.sheets} л. A4+, по ${price.piecesPerSheet} на листе)`;
  const how: string = p.productionRu ? ` [${p.productionRu}]` : "";
  return `${parts.join(" · ")} — ${qty}${how}`;
}

/** Short form of the staff row. */
export function psStaffShortRu(line: PsQuoteLine): string {
  const p = psProduct(line.product);
  const f = p ? psFormat(p, line.format) : null;
  return `${p?.staffRu ?? line.product}${f ? ` ${f.name ?? psSizeText(f)}` : ""} — ${line.quantity} ${p?.id === "stickerSheets" ? "л." : "шт."}`;
}

/** Finishing of a print-shop line in Russian for the admin / board badge («Листовки · ламинация мат»). */
export function psFinishingRu(line: Pick<PsQuoteLine, "product" | "lamination" | "cut">): string {
  const p = psProduct(line.product);
  return [p?.staffRu ?? line.product, line.lamination ? `ламинация ${line.lamination === "matte" ? "мат" : "глянец"}` : null, line.cut ? "контурная резка" : null]
    .filter(Boolean)
    .join(" · ");
}
