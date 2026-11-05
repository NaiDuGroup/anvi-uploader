import type { Localized, ShopLang } from "./i18n";
import type { ShopLfProduct } from "./largeFormat";

/**
 * Copy of the wide-format pages («Print mare format») in ro / ru / en. Kept
 * apart from the shared shop dictionary (`i18n.ts` has only the names used
 * by cart lines). Every value needs all three languages (`Localized`).
 */

export const LF_PRODUCT_COPY: Record<ShopLfProduct, { subtitle: Localized; description: Localized }> = {
  banner: {
    subtitle: { ro: "Mărimea ta, cu capse și buzunare", ru: "Ваш размер, с люверсами и карманами", en: "Your size, with eyelets and pockets" },
    description: {
      ro: "Banner Frontlit 440 g pentru exterior, imprimat eco-solvent. Lățime de imprimare până la 132 cm dintr-o bucată; lungime până la 5 m. Alegi capse, margini sudate și buzunare pentru țeavă sau cablu.",
      ru: "Баннер Frontlit 440 г для улицы, экосольвентная печать. Ширина печати до 132 см одним полотном, длина до 5 м. Добавьте люверсы, проклейку края и карманы под трубу или трос.",
      en: "Frontlit 440 g outdoor banner, eco-solvent print. Up to 132 cm wide in one piece, up to 5 m long. Add eyelets, a welded hem and pockets for a pole or a rope.",
    },
  },
  autocolant: {
    subtitle: { ro: "Oracal mat sau lucios, fără tăiere", ru: "Oracal матовый или глянцевый, без резки", en: "Matte or gloss Oracal, no cutting" },
    description: {
      ro: "Autocolant Oracal imprimat la mărimea ta — pentru vitrine, pereți, uși și mașini. Lățime de imprimare până la 157 cm. Livrăm foaia imprimată, fără tăiere pe contur.",
      ru: "Самоклейка Oracal с печатью в вашем размере — для витрин, стен, дверей и авто. Ширина печати до 157 см. Отдаём напечатанное полотно без контурной резки.",
      en: "Oracal self-adhesive vinyl printed to your size — for shop windows, walls, doors and cars. Up to 157 cm wide. Delivered as a printed sheet, not contour-cut.",
    },
  },
  canvas: {
    subtitle: { ro: "Pe șasiu de lemn, 8 mărimi", ru: "На деревянном подрамнике, 8 размеров", en: "On a wooden frame, 8 sizes" },
    description: {
      ro: "Fotografia ta pe pânză de bumbac, întinsă pe șasiu de lemn. Marginile de 4 cm de pe laterale se completează în oglindă, așa că imaginea rămâne întreagă pe față.",
      ru: "Ваше фото на хлопковом холсте, натянутом на деревянный подрамник. Загиб 4 см на торцы мы достраиваем зеркально — на лицевой стороне остаётся вся картинка.",
      en: "Your photo on cotton canvas stretched over a wooden frame. The 4 cm sides are filled with a mirror of the edges, so the whole picture stays on the front.",
    },
  },
  poster: {
    subtitle: { ro: "Hârtie foto sau afiș, până la 120 cm", ru: "Фотобумага или афиша, до 120 см", en: "Photo paper or poster paper, up to 120 cm" },
    description: {
      ro: "Postere, afișe și fotografii mari: hârtie foto 200 g la mărimi fixe, hârtie foto mată 230 g sau hârtie 100 g la mărimea ta.",
      ru: "Постеры, афиши и большие фото: фотобумага 200 г в готовых размерах, матовая фотобумага 230 г или бумага 100 г в вашем размере.",
      en: "Posters and large photos: 200 g photo paper in fixed sizes, 230 g matte photo paper or 100 g paper in your size.",
    },
  },
  rollup: {
    subtitle: { ro: "Stand + imprimare, gata de montat", ru: "Стойка + печать, готово к установке", en: "Stand + print, ready to set up" },
    description: {
      ro: "Roll-up cu stand din aluminiu și geantă, cu bannerul tău imprimat. Bannerul are 10 cm în plus jos, care intră în casetă.",
      ru: "Roll-up: алюминиевая стойка с сумкой и ваш напечатанный баннер. Баннер на 10 см длиннее — нижняя часть уходит в кассету.",
      en: "Roll-up: an aluminium stand with a bag and your printed banner. The banner is 10 cm longer — the bottom goes into the cassette.",
    },
  },
  xbanner: {
    subtitle: { ro: "80×180 cm, stand + imprimare", ru: "80×180 см, стойка + печать", en: "80×180 cm, stand + print" },
    description: {
      ro: "X-banner ușor, cu stand și imprimare 80×180 cm. Bannerul are capse în colțuri pentru cârligele standului.",
      ru: "Лёгкий X-banner: стойка и печать 80×180 см. В углах баннера — люверсы под крючки стойки.",
      en: "A light X-banner: a stand and an 80×180 cm print. The banner has corner eyelets for the stand's hooks.",
    },
  },
};

const T = {
  categoryIntro: {
    ro: "Bannere, autocolant, canvas, postere, roll-up și X-banner — imprimate în atelierul nostru, pe un plotter de 1,6 m. Prețul se calculează imediat, după materialul și mărimea ta.",
    ru: "Баннеры, самоклейка, холст, постеры, roll-up и X-banner — печатаем в своей мастерской на плоттере 1,6 м. Цена считается сразу по материалу и вашему размеру.",
    en: "Banners, vinyl, canvas, posters, roll-ups and X-banners — printed in our workshop on a 1.6 m plotter. The price is shown right away for your material and size.",
  },
  material: { ro: "Material", ru: "Материал", en: "Material" },
  size: { ro: "Mărime", ru: "Размер", en: "Size" },
  widthCm: { ro: "Lățime, cm", ru: "Ширина, см", en: "Width, cm" },
  heightCm: { ro: "Înălțime, cm", ru: "Высота, см", en: "Height, cm" },
  customSize: { ro: "Altă mărime", ru: "Свой размер", en: "Custom size" },
  sizeLimits: {
    ro: "Până la {w} cm pe latura mică și {l} cm pe cea mare.",
    ru: "До {w} см по короткой стороне и до {l} см по длинной.",
    en: "Up to {w} cm on the short side and {l} cm on the long side.",
  },
  orientation: { ro: "Orientare", ru: "Ориентация", en: "Orientation" },
  portrait: { ro: "Verticală", ru: "Вертикально", en: "Portrait" },
  landscape: { ro: "Orizontală", ru: "Горизонтально", en: "Landscape" },
  quantity: { ro: "Bucăți", ru: "Количество", en: "Quantity" },
  finishing: { ro: "Finisare", ru: "Отделка", en: "Finishing" },
  eyelets: { ro: "Capse (inele metalice)", ru: "Люверсы", en: "Eyelets" },
  eyeletsNone: { ro: "Fără", ru: "Без люверсов", en: "None" },
  eyeletsCorners: { ro: "Doar în colțuri", ru: "Только по углам", en: "Corners only" },
  eyeletsPerimeter: { ro: "Pe tot conturul", ru: "По периметру", en: "All around" },
  eyeletSpacing: { ro: "Distanța maximă între capse", ru: "Шаг люверсов, не больше", en: "Max distance between eyelets" },
  eyeletsCount: { ro: "{n} capse × {price}", ru: "{n} люверсов × {price}", en: "{n} eyelets × {price}" },
  hem: { ro: "Margini sudate (întărite)", ru: "Проклейка края (усиление)", en: "Welded hem (reinforced edges)" },
  hemHint: {
    ro: "{price} pe metru de contur; pe laturile cu buzunar nu se adaugă.",
    ru: "{price} за метр края; на сторонах с карманом не считается.",
    en: "{price} per metre of edge; not on the sides with a pocket.",
  },
  pockets: { ro: "Buzunare pentru țeavă / cablu", ru: "Карманы под трубу / трос", en: "Pockets for a pole / rope" },
  pocketsHint: { ro: "{price} pe metru de buzunar.", ru: "{price} за метр кармана.", en: "{price} per metre of pocket." },
  kitSize: { ro: "Mărimea standului", ru: "Размер стойки", en: "Stand size" },
  kitIncludes: {
    ro: "Prețul include standul, geanta și imprimarea.",
    ru: "В цену входят стойка, сумка и печать.",
    en: "The price includes the stand, the bag and the print.",
  },
  fileTitle: { ro: "Fișierul tău", ru: "Ваш файл", en: "Your file" },
  fileHint: {
    ro: "PDF, JPG, PNG sau TIFF, la mărimea comenzii. Pentru {size}: cel puțin {px} px ({dpi} dpi).",
    ru: "PDF, JPG, PNG или TIFF в размере заказа. Для {size}: не меньше {px} px ({dpi} dpi).",
    en: "PDF, JPG, PNG or TIFF at the ordered size. For {size}: at least {px} px ({dpi} dpi).",
  },
  fileRequired: { ro: "Încarcă fișierul ca să adaugi în coș.", ru: "Загрузите файл, чтобы добавить в корзину.", en: "Upload the file to add it to the cart." },
  dpiGood: { ro: "Rezoluție bună: {dpi} dpi la {size}.", ru: "Хорошее разрешение: {dpi} dpi при {size}.", en: "Good resolution: {dpi} dpi at {size}." },
  dpiOk: {
    ro: "Rezoluție acceptabilă: {dpi} dpi la {size} — arată bine de la 1–2 m.",
    ru: "Допустимое разрешение: {dpi} dpi при {size} — хорошо смотрится с 1–2 м.",
    en: "Acceptable resolution: {dpi} dpi at {size} — looks fine from 1–2 m.",
  },
  dpiLow: {
    ro: "Rezoluție mică: {dpi} dpi la {size}. Imaginea poate ieși neclară — trimite un fișier mai mare sau alege o mărime mai mică.",
    ru: "Низкое разрешение: {dpi} dpi при {size}. Картинка может выйти нечёткой — пришлите файл побольше или выберите размер меньше.",
    en: "Low resolution: {dpi} dpi at {size}. The print may look blurry — send a bigger file or choose a smaller size.",
  },
  proportions: {
    ro: "Proporțiile fișierului ({file}) diferă de mărimea comandată ({size}). Imaginea va fi tăiată ca în previzualizare.",
    ru: "Пропорции файла ({file}) отличаются от заказанного размера ({size}). Картинка будет обрезана, как на превью.",
    en: "The file's proportions ({file}) differ from the ordered size ({size}). The picture will be cropped as in the preview.",
  },
  useFileProportions: { ro: "Potrivește înălțimea după fișier", ru: "Подогнать высоту под файл", en: "Match the height to the file" },
  pdfNoCheck: {
    ro: "PDF: verificăm rezoluția în atelier înainte de imprimare.",
    ru: "PDF: разрешение проверим в мастерской перед печатью.",
    en: "PDF: we check the resolution at the workshop before printing.",
  },
  pdfSize: { ro: "Pagina PDF: {size}.", ru: "Страница PDF: {size}.", en: "PDF page: {size}." },
  preview: { ro: "Previzualizare", ru: "Превью", en: "Preview" },
  legendSafe: { ro: "zona sigură pentru text și logo", ru: "безопасная зона для текста и логотипа", en: "safe zone for text and logos" },
  legendWrap: {
    ro: "marginea de {cm} cm pe laterale (completată în oglindă)",
    ru: "загиб {cm} см на торцы (достраиваем зеркально)",
    en: "{cm} cm wrapped sides (mirrored)",
  },
  legendEyelets: { ro: "capse", ru: "люверсы", en: "eyelets" },
  legendPocket: { ro: "buzunar", ru: "карман", en: "pocket" },
  legendHidden: { ro: "{cm} cm intră în casetă (nu se vede)", ru: "{cm} см уходят в кассету (не видно)", en: "{cm} cm go into the cassette (hidden)" },
  previewEmpty: { ro: "Încarcă fișierul ca să-l vezi aici", ru: "Загрузите файл, чтобы увидеть его здесь", en: "Upload your file to see it here" },
  tooWide: {
    ro: "Mai lat decât poate imprima rola ({w} cm) — o facem la cerere, din mai multe bucăți.",
    ru: "Шире, чем печатает рулон ({w} см), — сделаем по запросу из нескольких полотен.",
    en: "Wider than the roll can print ({w} cm) — we make it on request, from several pieces.",
  },
  tooLong: { ro: "Mai lung de {l} cm — la cerere.", ru: "Длиннее {l} см — по запросу.", en: "Longer than {l} cm — on request." },
  tooSmall: { ro: "Minimum {m} cm pe fiecare latură.", ru: "Не меньше {m} см по каждой стороне.", en: "At least {m} cm on each side." },
  onRequest: { ro: "La cerere", ru: "По запросу", en: "On request" },
  onRequestTitle: { ro: "La cerere", ru: "По запросу", en: "On request" },
  onRequestText: {
    ro: "Le facem împreună cu partenerii noștri — scrie-ne mărimea și cantitatea, revenim cu prețul.",
    ru: "Делаем вместе с партнёрами — напишите размер и количество, мы ответим с ценой.",
    en: "Made with our partners — send us the size and quantity and we will get back with a price.",
  },
  onRequestOneWay: { ro: "One Way Vision (perforat pentru geamuri)", ru: "One Way Vision (перфоплёнка для стёкол)", en: "One Way Vision (perforated window film)" },
  onRequestPlastic: { ro: "Imprimare pe plastic PVC 3–4 mm", ru: "Печать на ПВХ-пластике 3–4 мм", en: "Print on 3–4 mm PVC board" },
  onRequestCut: { ro: "Tăiere pe contur cu plotterul", ru: "Плоттерная резка по контуру", en: "Contour cutting" },
  onRequestLam: { ro: "Laminare la rece", ru: "Холодная ламинация", en: "Cold lamination" },
  onRequestWide: {
    ro: "Bannere mai late de 132 cm (sudate din bucăți)",
    ru: "Баннеры шире 132 см (сварка из полотен)",
    en: "Banners wider than 132 cm (welded from pieces)",
  },
  onRequestTriptych: {
    ro: "Tablouri modulare pe canvas (3–6 bucăți)",
    ru: "Модульные картины на холсте (3–6 частей)",
    en: "Multi-panel canvas pictures (3–6 pieces)",
  },
  onRequestBacklit: { ro: "Backlit pentru casete luminoase", ru: "Backlit для световых коробов", en: "Backlit film for light boxes" },
  onRequestWrite: { ro: "Scrie-ne", ru: "Написать нам", en: "Write to us" },
  onRequestMessage: {
    ro: "Bună ziua! Aș dori o ofertă: {item}. Mărime: …, cantitate: …",
    ru: "Здравствуйте! Хочу узнать цену: {item}. Размер: …, количество: …",
    en: "Hello! I would like a quote: {item}. Size: …, quantity: …",
  },
  priceNote: {
    ro: "Prețul ține cont de lățimea rolei: o imprimare îngustă pe o rolă lată costă mai mult. Comanda minimă — {min}.",
    ru: "Цена учитывает ширину рулона: узкая печать на широком рулоне дороже. Минимальная сумма позиции — {min}.",
    en: "The price follows the roll width: a narrow print on a wide roll costs more. Minimum per item — {min}.",
  },
  fixedSizes: { ro: "Mărimi din lista de prețuri", ru: "Размеры из прайса", en: "Price-list sizes" },
  viewTabs: { ro: "Mod de vizualizare", ru: "Вид превью", en: "Preview view" },
  tabLayout: { ro: "Machetă", ru: "Макет", en: "Layout" },
  tabScale: { ro: "Mărime reală", ru: "Размер", en: "Real size" },
  tab3d: { ro: "3D", ru: "3D-вид", en: "3D" },
  scaleCaption: { ro: "Pentru scară: o persoană de 170 cm", ru: "Для масштаба: человек 170 см", en: "For scale: a 170 cm person" },
  scaleAlt: {
    ro: "{item} de {size} lângă o persoană de 170 cm",
    ru: "{item} {size} рядом с человеком ростом 170 см",
    en: "{item}, {size}, next to a 170 cm person",
  },
  canvas3dHint: { ro: "Trage ca să rotești tabloul", ru: "Потяните, чтобы повернуть картину", en: "Drag to turn the canvas" },
  canvas3dPdf: {
    ro: "PDF-ul nu se afișează în 3D: pe față va fi fișierul tău, pe laterale — marginile lui în oglindă.",
    ru: "PDF в 3D не показываем: на лицевой стороне будет ваш файл, на торцах — его края зеркально.",
    en: "PDFs are not shown in 3D: the front will carry your file, the sides a mirror of its edges.",
  },
  canvas3dUnavailable: {
    ro: "3D nu merge pe acest dispozitiv — vezi macheta.",
    ru: "3D не работает на этом устройстве — смотрите макет.",
    en: "3D is not available on this device — see the layout.",
  },
} satisfies Record<string, Localized>;

export type LfTextKey = keyof typeof T;
export type LfT = (key: LfTextKey, vars?: Record<string, string | number>) => string;

export function lfText(lang: ShopLang): LfT {
  return (key, vars) => {
    const s: string = T[key][lang] || T[key].ro;
    return vars ? s.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : s;
  };
}

export const LF_TEXT_KEYS = Object.keys(T) as LfTextKey[];
export const LF_TEXT = T;
