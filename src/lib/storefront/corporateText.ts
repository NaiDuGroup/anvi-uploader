import type { CorporateInterest, CorporateQuantity } from "@/lib/corporate/requestRules";
import type { Localized, ShopLang } from "./i18n";

/**
 * «Pentru companii» page, quote form and confirmation page (ro / ru / en).
 * Kept out of the big `i18n.ts` table; every value is `Localized`, so a
 * missing language fails `tsc`.
 */

export const CORP_TEXT = {
  pitchTitle: {
    ro: "Merch cu logo și tipar pentru companii",
    ru: "Мерч с логотипом и полиграфия для компаний",
    en: "Branded merch and print for companies",
  },
  pitchText: {
    ro: "Cadouri pentru clienți, kituri de bun venit pentru echipă, materiale pentru evenimente. Spune-ne ce ai nevoie — pregătim oferta, macheta și factura pe firmă.",
    ru: "Подарки клиентам, welcome-наборы для команды, материалы к мероприятиям. Расскажите, что нужно, — подготовим предложение, макет и счёт на фирму.",
    en: "Client gifts, welcome kits for your team, event materials. Tell us what you need — we'll prepare the quote, the mock-up and a company invoice.",
  },
  benefit1Title: { ro: "Ofertă în 1 zi lucrătoare", ru: "Предложение за 1 рабочий день", en: "Quote within 1 working day" },
  benefit1Text: {
    ro: "Un manager îți răspunde cu prețuri pe tiraj și termene reale.",
    ru: "Менеджер ответит с ценами на тираж и реальными сроками.",
    en: "A manager replies with run prices and real lead times.",
  },
  benefit2Title: { ro: "Machetă gratuită", ru: "Бесплатный макет", en: "Free mock-up" },
  benefit2Text: {
    ro: "Plasăm logoul pe produs și îți trimitem macheta spre aprobare înainte de tipar.",
    ru: "Разместим логотип на изделии и пришлём макет на согласование до печати.",
    en: "We place your logo on the product and send the mock-up for approval before printing.",
  },
  benefit3Title: { ro: "Prețuri de tiraj și factură", ru: "Цены на тираж и счёт", en: "Bulk prices and invoice" },
  benefit3Text: {
    ro: "Reduceri de la tiraje mari, plată prin transfer, factură fiscală pe firmă.",
    ru: "Скидки на большие тиражи, оплата переводом, налоговая накладная на фирму.",
    en: "Discounts on large runs, bank-transfer payment, a fiscal invoice for your company.",
  },
  examplesTitle: { ro: "Ce facem pentru companii", ru: "Что мы делаем для компаний", en: "What we make for companies" },
  examplesText: {
    ro: "Câteva produse din catalog — le personalizăm cu logoul tău la orice tiraj.",
    ru: "Несколько товаров из каталога — нанесём ваш логотип на любой тираж.",
    en: "A few products from the catalogue — we brand them with your logo at any quantity.",
  },
  stepsTitle: { ro: "Cum lucrăm", ru: "Как мы работаем", en: "How it works" },
  step1: { ro: "Trimiți cererea cu produsele, tirajul și termenul.", ru: "Вы отправляете заявку: товары, тираж и срок.", en: "You send the request: products, quantity and deadline." },
  step2: { ro: "Primești oferta și macheta spre aprobare.", ru: "Получаете предложение и макет на согласование.", en: "You get the quote and a mock-up to approve." },
  step3: { ro: "Plătești factura — noi producem și livrăm.", ru: "Оплачиваете счёт — мы производим и доставляем.", en: "You pay the invoice — we produce and deliver." },

  formTitle: { ro: "Cere o ofertă", ru: "Запросить предложение", en: "Request a quote" },
  formIntro: {
    ro: "Completează formularul — îți răspundem în 1 zi lucrătoare.",
    ru: "Заполните форму — ответим в течение 1 рабочего дня.",
    en: "Fill in the form — we'll reply within 1 working day.",
  },
  requiredNote: {
    ro: "Toate câmpurile sunt obligatorii, cu excepția celor marcate «opțional».",
    ru: "Все поля обязательны, кроме отмеченных «необязательно».",
    en: "All fields are required except those marked «optional».",
  },
  company: { ro: "Companie", ru: "Компания", en: "Company" },
  contactName: { ro: "Persoana de contact", ru: "Контактное лицо", en: "Contact person" },
  phone: { ro: "Telefon", ru: "Телефон", en: "Phone" },
  email: { ro: "E-mail", ru: "E-mail", en: "E-mail" },
  products: { ro: "Ce produse vă interesează?", ru: "Какие товары интересуют?", en: "Which products are you interested in?" },
  productsOther: { ro: "Alt produs — descrie-l", ru: "Другой товар — опишите", en: "Another product — describe it" },
  quantity: { ro: "Tiraj estimat", ru: "Примерный тираж", en: "Estimated quantity" },
  quantityPick: { ro: "Alege tirajul", ru: "Выберите тираж", en: "Choose a quantity" },
  pcs: { ro: "buc.", ru: "шт.", en: "pcs" },
  deadline: { ro: "Când aveți nevoie?", ru: "Когда нужно?", en: "When do you need it?" },
  budget: { ro: "Buget (opțional)", ru: "Бюджет (необязательно)", en: "Budget (optional)" },
  budgetPlaceholder: { ro: "de ex. 5 000 lei", ru: "например, 5 000 лей", en: "e.g. 5,000 MDL" },
  hasLogo: { ro: "Aveți logo gata?", ru: "Есть готовый логотип?", en: "Do you have a logo ready?" },
  yes: { ro: "Da", ru: "Да", en: "Yes" },
  no: { ro: "Nu, avem nevoie de ajutor", ru: "Нет, нужна помощь", en: "No, we need help" },
  files: { ro: "Logo sau brief (opțional)", ru: "Логотип или бриф (необязательно)", en: "Logo or brief (optional)" },
  filesHint: {
    ro: "PDF, AI, EPS, SVG, PNG, JPG, DOC — până la {n} fișiere",
    ru: "PDF, AI, EPS, SVG, PNG, JPG, DOC — до {n} файлов",
    en: "PDF, AI, EPS, SVG, PNG, JPG, DOC — up to {n} files",
  },
  addFile: { ro: "Adaugă fișier", ru: "Добавить файл", en: "Add a file" },
  remove: { ro: "Șterge", ru: "Удалить", en: "Remove" },
  uploading: { ro: "Se încarcă…", ru: "Загрузка…", en: "Uploading…" },
  message: { ro: "Mesaj (opțional)", ru: "Сообщение (необязательно)", en: "Message (optional)" },
  messagePlaceholder: {
    ro: "Detalii: culori, locul logoului, livrare, eveniment…",
    ru: "Детали: цвета, место логотипа, доставка, мероприятие…",
    en: "Details: colours, logo placement, delivery, event…",
  },
  consent: {
    ro: "Sunt de acord cu prelucrarea datelor pentru pregătirea ofertei.",
    ru: "Согласен на обработку данных для подготовки предложения.",
    en: "I agree to my data being processed to prepare the quote.",
  },
  privacyLink: { ro: "Politica de confidențialitate", ru: "Политика конфиденциальности", en: "Privacy policy" },
  submit: { ro: "Trimite cererea", ru: "Отправить заявку", en: "Send request" },
  sending: { ro: "Se trimite…", ru: "Отправляем…", en: "Sending…" },
  orWrite: { ro: "Sau scrie-ne direct:", ru: "Или напишите напрямую:", en: "Or write to us directly:" },

  errRequired: { ro: "Completează câmpul", ru: "Заполните поле", en: "Please fill this in" },
  errEmail: { ro: "Verifică adresa de e-mail", ru: "Проверьте e-mail", en: "Check the e-mail address" },
  errPhone: { ro: "Verifică numărul de telefon", ru: "Проверьте номер телефона", en: "Check the phone number" },
  errProducts: { ro: "Alege cel puțin un produs", ru: "Выберите хотя бы один товар", en: "Pick at least one product" },
  errDeadline: { ro: "Alege o dată de azi încolo", ru: "Выберите дату не раньше сегодняшней", en: "Pick today or a later date" },
  errConsent: { ro: "Avem nevoie de acordul tău", ru: "Нужно ваше согласие", en: "We need your consent" },
  errUploading: { ro: "Așteaptă să se încarce fișierele", ru: "Дождитесь загрузки файлов", en: "Wait for the files to upload" },
  errTooMany: {
    ro: "Prea multe cereri. Încearcă din nou peste câteva minute sau sună-ne.",
    ru: "Слишком много заявок. Попробуйте через несколько минут или позвоните.",
    en: "Too many requests. Try again in a few minutes or call us.",
  },
  errGeneric: {
    ro: "Cererea nu a fost trimisă. Încearcă din nou sau sună-ne.",
    ru: "Заявка не отправлена. Попробуйте ещё раз или позвоните.",
    en: "The request was not sent. Try again or call us.",
  },
  errUpload: { ro: "Fișierul nu s-a încărcat", ru: "Файл не загрузился", en: "The file did not upload" },
  errFileType: {
    ro: "Tip de fișier nepermis. Trimite PDF, AI, EPS, SVG, CDR, PSD, imagini (PNG, JPG, WEBP, TIFF), Office, TXT sau ZIP.",
    ru: "Недопустимый тип файла. Отправьте PDF, AI, EPS, SVG, CDR, PSD, изображения (PNG, JPG, WEBP, TIFF), Office, TXT или ZIP.",
    en: "File type not allowed. Send PDF, AI, EPS, SVG, CDR, PSD, images (PNG, JPG, WEBP, TIFF), Office, TXT or ZIP.",
  },
  errFileTooBig: {
    ro: "Fișierul e prea mare (maximum {mb} MB)",
    ru: "Файл слишком большой (максимум {mb} МБ)",
    en: "The file is too large (max {mb} MB)",
  },

  thanksTitle: { ro: "Am primit cererea", ru: "Мы получили заявку", en: "We've received your request" },
  thanksNumber: { ro: "Cererea nr. {n}", ru: "Заявка № {n}", en: "Request no. {n}" },
  thanksText: {
    ro: "Mulțumim! Un manager o studiază și revine cu oferta în 1 zi lucrătoare. Ți-am trimis și o confirmare pe e-mail.",
    ru: "Спасибо! Менеджер изучит её и вернётся с предложением в течение 1 рабочего дня. Мы также отправили подтверждение на e-mail.",
    en: "Thank you! A manager will review it and get back to you within 1 working day. We've also sent a confirmation e-mail.",
  },
  thanksUrgent: { ro: "Urgent? Sună-ne:", ru: "Срочно? Позвоните:", en: "Urgent? Call us:" },
  thanksBack: { ro: "Înapoi la catalog", ru: "Вернуться в каталог", en: "Back to the catalogue" },
  thanksAnother: { ro: "Trimite încă o cerere", ru: "Отправить ещё заявку", en: "Send another request" },
} satisfies Record<string, Localized>;

export type CorpTextKey = keyof typeof CORP_TEXT;

export function corpT(lang: ShopLang): (key: CorpTextKey, vars?: Record<string, string | number>) => string {
  return (key, vars) => {
    const s: string = CORP_TEXT[key][lang] || CORP_TEXT[key].ro;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
  };
}

/** Interest checkbox labels. */
export const CORP_INTEREST_LABEL: Record<CorporateInterest, Localized> = {
  notebooks: { ro: "Carnete", ru: "Блокноты", en: "Notebooks" },
  mugs: { ro: "Căni", ru: "Кружки", en: "Mugs" },
  pens: { ro: "Pixuri", ru: "Ручки", en: "Pens" },
  tshirts: { ro: "Tricouri și șepci", ru: "Футболки и кепки", en: "T-shirts and caps" },
  bags: { ro: "Genți", ru: "Сумки", en: "Bags" },
  bottles: { ro: "Sticle", ru: "Бутылки", en: "Bottles" },
  gifts: { ro: "Cadouri", ru: "Подарки", en: "Gifts" },
  business_cards: { ro: "Cărți de vizită", ru: "Визитки", en: "Business cards" },
  flyers: { ro: "Flyere și tipografie", ru: "Флаеры и полиграфия", en: "Flyers and print" },
  banners: { ro: "Bannere și print mare", ru: "Баннеры и широкоформат", en: "Banners and large format" },
  stickers: { ro: "Stickere", ru: "Наклейки", en: "Stickers" },
  other: { ro: "Altceva", ru: "Другое", en: "Something else" },
};

export function corpQuantityLabel(q: CorporateQuantity, lang: ShopLang): string {
  const pcs: string = CORP_TEXT.pcs[lang];
  const ranges: Record<CorporateQuantity, string> = {
    lt50: lang === "en" ? `under 50 ${pcs}` : lang === "ru" ? `до 50 ${pcs}` : `sub 50 ${pcs}`,
    "50_100": `50–100 ${pcs}`,
    "100_250": `100–250 ${pcs}`,
    "250_500": `250–500 ${pcs}`,
    "500_1000": `500–1000 ${pcs}`,
    gt1000: lang === "en" ? `over 1000 ${pcs}` : lang === "ru" ? `более 1000 ${pcs}` : `peste 1000 ${pcs}`,
  };
  return ranges[q];
}
