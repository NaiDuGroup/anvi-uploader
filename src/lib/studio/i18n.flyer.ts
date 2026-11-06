import type { ShopLang } from "@/lib/storefront/i18n";
import { defineStudioStrings, fillVars, type StudioT, type StudioVars } from "./i18n";
import { studioCardT, type StudioCardKey } from "./i18n.card";
import type { SheetStudioKind } from "./surfaces";

/**
 * Strings of the flyer Studio (`flyer`). The flyer screens are the business
 * card's (StudioCard*.tsx), so `studioSheetT("flyer", lang)` answers a card
 * key with its flyer wording when there is one (`OVERRIDES`), else the
 * card's own; flyer-only keys (format, paper, the flyer fields) live in
 * `strings`. `studioSheetT("card", lang)` is exactly `studioCardT(lang)`.
 */

type Overrides = Partial<Record<StudioCardKey, string>>;

const OVERRIDES: Record<ShopLang, Overrides> = {
  ro: {
    tabCreateSub: "Alegi un model, scrii textele — gata în câteva minute",
    createLead: "Scrii titlul, oferta și contactele o dată, adaugi logoul și o fotografie — toate modelele se completează cu ele. Verificăm fiecare față înainte de tipar.",
    createStep1: "Textele, logoul și fotografia",
    createCta: "Începe flyerul →",
    removeBackConfirm: "Ștergi versoul? Flyerul rămâne tipărit doar pe față.",
    backLead: "Versoul se tipărește la prețul din listă: {price} în plus pentru tirajul ales.",
    startTitle: "Creează-ți flyerul",
    startLead: "Scrie textele o dată — apar în fiecare model. Ce lași gol nu se tipărește.",
    fieldsTitle: "Textele tale",
    blankSub: "Un flyer alb, adaugi tu textele",
    verifyTitle: "Verifică flyerul",
    verifyLead: "Așa arată flyerul tăiat, exact cum se tipărește. Verifică fiecare parte și textele.",
    cutNote: "Roșu — linia de tăiere {size}",
    galleryLead: "Toate modelele, deja cu textele, fotografia și culorile tale. Apasă pe unul ca să-l personalizezi.",
    filterIndustry: "Pentru ce",
    shortTitle: "Personalizează flyerul",
    shortLead: "Scrie textele — flyerul se actualizează imediat.",
    addBackPrice: "+{price}",
    addBackFull: "+ Adaugă verso (+{price})",
  },
  ru: {
    tabCreateSub: "Выберите шаблон, впишите тексты — готово за несколько минут",
    createLead: "Впишите заголовок, предложение и контакты один раз, добавьте логотип и фото — все шаблоны заполнятся ими. Каждую сторону проверяем перед печатью.",
    createStep1: "Тексты, логотип и фото",
    createCta: "Создать листовку →",
    removeBackConfirm: "Удалить оборот? Листовка будет напечатана только с лица.",
    backLead: "Оборот печатается по прайсу: на {price} дороже за выбранный тираж.",
    startTitle: "Создайте свою листовку",
    startLead: "Впишите тексты один раз — они появятся в каждом шаблоне. Пустые поля не печатаются.",
    fieldsTitle: "Ваши тексты",
    blankSub: "Белая листовка, тексты добавите сами",
    verifyTitle: "Проверьте листовку",
    verifyLead: "Так листовка выглядит после реза — ровно как будет напечатана. Проверьте каждую сторону и тексты.",
    cutNote: "Красная — линия реза {size}",
    galleryLead: "Все макеты — уже с вашими текстами, фото и цветами. Нажмите на любой, чтобы настроить.",
    filterIndustry: "Для чего",
    shortTitle: "Настройте листовку",
    shortLead: "Впишите тексты — листовка обновляется сразу.",
    addBackPrice: "+{price}",
    addBackFull: "+ Добавить оборот (+{price})",
  },
  en: {
    tabCreateSub: "Pick a design, type your texts — done in minutes",
    createLead: "Type the headline, the offer and your contacts once, add your logo and a photo — every design is filled with them. We check each side before printing.",
    createStep1: "Texts, logo and photo",
    createCta: "Start your flyer →",
    removeBackConfirm: "Remove the back? The flyer will be printed on the front only.",
    backLead: "The back is printed at list price: {price} more for the chosen run.",
    startTitle: "Create your flyer",
    startLead: "Type your texts once — they appear in every design. Empty fields are not printed.",
    fieldsTitle: "Your texts",
    blankSub: "A white flyer, you add the texts",
    verifyTitle: "Check your flyer",
    verifyLead: "This is the flyer as cut, exactly as it will be printed. Check each side and the texts.",
    cutNote: "Red — the cut line {size}",
    galleryLead: "Every design, already with your texts, photo and colours. Tap one to personalise it.",
    filterIndustry: "What for",
    shortTitle: "Personalise your flyer",
    shortLead: "Type your texts — the flyer updates at once.",
    addBackPrice: "+{price}",
    addBackFull: "+ Add a back (+{price})",
  },
};

const strings = defineStudioStrings({
  ro: {
    format: "Format",
    formatOption: "{name} · {w}×{h} mm",
    paper: "Hârtie",
    paperOption: "{n} g/m²",
    pack: "Tiraj",
    packOption: "{n} buc.",
    lamination: "Laminare",
    laminationNone: "Fără",
    laminationGloss: "Lucioasă",
    laminationMatte: "Mată",
    sidesTitle: "Tipar",
    sidesOneLong: "Pe o față",
    sidesTwoLong: "Pe ambele fețe",
    fHeadline: "Titlu",
    fSubheadline: "Subtitlu",
    fBody: "Text",
    fBullets: "Listă",
    fBulletsHint: "Un punct pe fiecare rând",
    fOffer: "Ofertă / preț",
    fDate: "Data sau perioada",
    fEmailOptional: "E-mail (opțional)",
    textsTitle: "Textele flyerului",
    contactsTitle: "Contacte",
    photoTitle: "Fotografie",
    photoHint: "O fotografie pentru modelele cu poză. Verificăm calitatea ei la formatul ales.",
    photoRemove: "Fără fotografie",
    formatTitle: "Formatul flyerului",
  },
  ru: {
    format: "Формат",
    formatOption: "{name} · {w}×{h} мм",
    paper: "Бумага",
    paperOption: "{n} г/м²",
    pack: "Тираж",
    packOption: "{n} шт.",
    lamination: "Ламинация",
    laminationNone: "Без",
    laminationGloss: "Глянцевая",
    laminationMatte: "Матовая",
    sidesTitle: "Печать",
    sidesOneLong: "С одной стороны",
    sidesTwoLong: "С двух сторон",
    fHeadline: "Заголовок",
    fSubheadline: "Подзаголовок",
    fBody: "Текст",
    fBullets: "Список",
    fBulletsHint: "Каждый пункт с новой строки",
    fOffer: "Предложение / цена",
    fDate: "Дата или период",
    fEmailOptional: "E-mail (необязательно)",
    textsTitle: "Тексты листовки",
    contactsTitle: "Контакты",
    photoTitle: "Фото",
    photoHint: "Одно фото для макетов с фотографией. Качество проверим для выбранного формата.",
    photoRemove: "Без фото",
    formatTitle: "Формат листовки",
  },
  en: {
    format: "Size",
    formatOption: "{name} · {w}×{h} mm",
    paper: "Paper",
    paperOption: "{n} g/m²",
    pack: "Quantity",
    packOption: "{n} pcs",
    lamination: "Lamination",
    laminationNone: "None",
    laminationGloss: "Gloss",
    laminationMatte: "Matte",
    sidesTitle: "Printing",
    sidesOneLong: "One side",
    sidesTwoLong: "Both sides",
    fHeadline: "Headline",
    fSubheadline: "Subheadline",
    fBody: "Text",
    fBullets: "List",
    fBulletsHint: "One point per line",
    fOffer: "Offer / price",
    fDate: "Date or period",
    fEmailOptional: "E-mail (optional)",
    textsTitle: "Flyer texts",
    contactsTitle: "Contacts",
    photoTitle: "Photo",
    photoHint: "One photo for the designs with a picture. We check its quality at the chosen size.",
    photoRemove: "No photo",
    formatTitle: "Flyer size",
  },
});

export type StudioFlyerKey = Parameters<ReturnType<typeof strings>>[0];

export function studioFlyerT(lang: ShopLang): StudioT<StudioFlyerKey> {
  return strings(lang);
}

/** The card screens' strings for a sheet product: the card's own, or their flyer wording. */
export function studioSheetT(kind: SheetStudioKind | string, lang: ShopLang): StudioT<StudioCardKey> {
  const card = studioCardT(lang);
  if (kind !== "flyer") return card;
  const own: Overrides = OVERRIDES[lang] ?? OVERRIDES.ro;
  return (key: StudioCardKey, vars?: StudioVars) => {
    const s: string | undefined = own[key];
    return s != null ? fillVars(s, vars) : card(key, vars);
  };
}
