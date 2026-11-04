import type { WeekHours } from "@/lib/studioInfo/studioHours";
import { formatPhone } from "@/lib/studioInfo/studioInfo";
import { DELIVERY_DISPLAY_PRICE } from "./checkout";
import { SHOP_LOW_DPI } from "./dtfPrint";
import { formatPrice } from "./format";
import { pickLocalized, shopT, type Localized, type ShopLang } from "./i18n";
import { formatShopHours } from "./studioText";

/**
 * Copy of the storefront's info pages (/despre, /livrare-si-plata,
 * /intrebari) in ro / ru / en. Studio facts are placeholders filled from the
 * studio card (Settings → studio info) and the shop constants:
 * `{address}`, `{hours}`, `{phone}`, `{readyIn}`, `{courierChisinau}`,
 * `{courierMoldova}`, `{lowDpi}`, `{soon}`. `[text](/path)` is a storefront
 * link (clean path, adjusted for print.anvi.md/shop). Pure (unit-tested).
 */

export type InfoBlock =
  | { kind: "p"; text: Localized }
  | { kind: "list"; items: Localized[] }
  /** «Vezi pe hartă» link to the studio map, when stored. */
  | { kind: "map" };

export interface InfoSection {
  heading: Localized;
  blocks: InfoBlock[];
}

export type InfoPageSlug = "despre" | "livrare-si-plata" | "intrebari";

export interface InfoPageDef {
  slug: InfoPageSlug;
  /** Shown as `<details>` questions (FAQ) instead of headed sections. */
  faq: boolean;
  title: Localized;
  description: Localized;
  lead: Localized;
  sections: InfoSection[];
}

/** Footer / breadcrumb labels of the info pages. */
export const INFO_LABEL: Record<InfoPageSlug | "map" | "soon", Localized> = {
  despre: { ro: "Despre noi", ru: "О нас", en: "About us" },
  "livrare-si-plata": { ro: "Livrare și plată", ru: "Доставка и оплата", en: "Delivery and payment" },
  intrebari: { ro: "Întrebări frecvente", ru: "Частые вопросы", en: "FAQ" },
  map: { ro: "Vezi pe hartă", ru: "Открыть на карте", en: "Open the map" },
  soon: { ro: "în curând", ru: "скоро", en: "coming soon" },
};

const p = (ro: string, ru: string, en: string): InfoBlock => ({ kind: "p", text: { ro, ru, en } });
const L = (ro: string, ru: string, en: string): Localized => ({ ro, ru, en });

const DESPRE: InfoPageDef = {
  slug: "despre",
  faq: false,
  title: INFO_LABEL.despre,
  description: L(
    "ANVI-STUDIO — atelier de imprimare din Chișinău. Imprimăm singuri: UV, DTF, sublimare și presă digitală Ricoh.",
    "ANVI-STUDIO — мастерская печати в Кишинёве. Печатаем сами: УФ, DTF, сублимация и цифровая машина Ricoh.",
    "ANVI-STUDIO is a print workshop in Chișinău. We print in-house: UV, DTF, sublimation and a Ricoh digital press.",
  ),
  lead: L(
    "ANVI-STUDIO este un atelier de imprimare din Chișinău. Pe anvi.md comanzi produse cu designul tău — carnete, pixuri, căni, tricouri, șepci, cărți de vizită — sau [printare de fotografii și documente](/printare), iar noi le imprimăm în atelierul nostru.",
    "ANVI-STUDIO — мастерская печати в Кишинёве. На anvi.md вы заказываете вещи со своим дизайном — блокноты, ручки, кружки, футболки, кепки, визитки — или [печать фото и документов](/printare), а мы печатаем их в своей мастерской.",
    "ANVI-STUDIO is a print workshop in Chișinău. On anvi.md you order items with your own design — notebooks, pens, mugs, T-shirts, caps, business cards — or [photo and document printing](/printare), and we print them in our workshop.",
  ),
  sections: [
    {
      heading: L("Producție proprie", "Своё производство", "In-house production"),
      blocks: [
        p(
          "Tot ce comanzi pe site imprimăm în atelierul nostru din Chișinău, pe echipamentul propriu:",
          "Всё, что вы заказываете на сайте, мы печатаем в своей мастерской в Кишинёве, на своём оборудовании:",
          "Everything you order on the site is printed in our Chișinău workshop, on our own equipment:",
        ),
        {
          kind: "list",
          items: [
            L(
              "Imprimare UV — carnete, pixuri și alte obiecte: imprimăm direct pe suprafața lor.",
              "УФ-печать — блокноты, ручки и другие предметы: печатаем прямо по их поверхности.",
              "UV printing — notebooks, pens and other items: we print straight onto their surface.",
            ),
            L(
              "DTF — tricouri, șepci și genți: imaginea se transferă pe material prin presare la cald.",
              "DTF — футболки, кепки и сумки: изображение переносится на ткань термопрессом.",
              "DTF — T-shirts, caps and bags: the image is transferred onto the fabric with a heat press.",
            ),
            L("Sublimare — căni cu fotografia sau logoul tău.", "Сублимация — кружки с вашим фото или логотипом.", "Sublimation — mugs with your photo or logo."),
            L(
              "Presa digitală Ricoh Pro C5200s — cărți de vizită pe hârtie de 350 g/m², tăiate pe ghilotina automată.",
              "Цифровая печатная машина Ricoh Pro C5200s — визитки на бумаге 350 г/м², резка на автоматической гильотине.",
              "Ricoh Pro C5200s digital press — business cards on 350 g/m² paper, cut on an automatic guillotine.",
            ),
            L(
              "Printare documente și fotografii — încarci fișierele pe pagina [Printare foto și documente](/printare), alegi formatul și numărul de copii.",
              "Печать документов и фотографий — загрузите файлы на странице [Печать фото и документов](/printare), выберите формат и число копий.",
              "Document and photo printing — upload your files on the [Photo and document printing](/printare) page, choose the format and the number of copies.",
            ),
          ],
        },
      ],
    },
    {
      heading: L("Cum lucrăm", "Как мы работаем", "How we work"),
      blocks: [
        p(
          "Prețul se calculează pe site imediat, iar la încărcare site-ul verifică rezoluția fișierului. Pentru căni, carnete și pixuri poți face macheta direct în editorul online. Producția începe după confirmarea plății.",
          "Цена считается на сайте сразу, а при загрузке сайт проверяет разрешение файла. Для кружек, блокнотов и ручек макет можно собрать прямо в онлайн-редакторе. Производство начинается после подтверждения оплаты.",
          "The site prices your order instantly and checks the file resolution on upload. For mugs, notebooks and pens you can make the layout right in the online editor. Production starts once the payment is confirmed.",
        ),
        p(
          "Ai întrebări? Răspunsurile scurte sunt la [Întrebări frecvente](/intrebari).",
          "Есть вопросы? Короткие ответы — в разделе [Частые вопросы](/intrebari).",
          "Questions? Short answers are in the [FAQ](/intrebari).",
        ),
      ],
    },
    {
      heading: L("Pentru companii", "Для компаний", "For companies"),
      blocks: [
        p(
          "Facem merch cu logo pentru echipă, clienți și evenimente, cu prețuri de tiraj, ofertă și factură pe firmă. [Cere o ofertă](/companii).",
          "Делаем мерч с логотипом для команды, клиентов и мероприятий: цены на тираж, предложение и счёт на фирму. [Запросить предложение](/companii).",
          "We make logo merch for teams, clients and events, with run prices, a quote and an invoice to your company. [Ask for a quote](/companii).",
        ),
      ],
    },
    {
      heading: L("Unde ne găsești", "Где нас найти", "Where to find us"),
      blocks: [
        {
          kind: "list",
          items: [
            L("Atelierul: {address}", "Мастерская: {address}", "Workshop: {address}"),
            L("Program: {hours}", "Часы работы: {hours}", "Opening hours: {hours}"),
            L("Telefon: {phone}", "Телефон: {phone}", "Phone: {phone}"),
          ],
        },
        p(
          "Comenzile de pe site le poți ridica de aici gratuit.",
          "Заказы с сайта можно бесплатно забрать здесь.",
          "You can collect your online orders here for free.",
        ),
        { kind: "map" },
      ],
    },
  ],
};

const LIVRARE: InfoPageDef = {
  slug: "livrare-si-plata",
  faq: false,
  title: INFO_LABEL["livrare-si-plata"],
  description: L(
    "Ridicare gratuită din atelier în Chișinău, curier EVS în Chișinău și livrare în toată Moldova. Plată online cu cardul.",
    "Бесплатный самовывоз из мастерской в Кишинёве, курьер EVS по Кишинёву и доставка по всей Молдове. Оплата картой онлайн.",
    "Free pickup at our Chișinău workshop, EVS courier in Chișinău and delivery across Moldova. Online card payment.",
  ),
  lead: L(
    "Comanzi pe site, noi imprimăm în atelier, iar tu alegi cum primești comanda.",
    "Вы заказываете на сайте, мы печатаем в мастерской, а вы выбираете, как получить заказ.",
    "You order on the site, we print in the workshop, and you choose how to receive the order.",
  ),
  sections: [
    {
      heading: L("Termen de producție", "Срок изготовления", "Production time"),
      blocks: [
        p("{readyIn}.", "{readyIn}.", "{readyIn}."),
        p(
          "Termenul curge de la confirmarea plății. Pentru tiraje mari sau unele produse poate fi mai lung — atunci îl confirmăm separat. Dacă fișierul are o problemă tehnică, te putem contacta înainte de imprimare.",
          "Срок считается с момента подтверждения оплаты. Для больших тиражей и некоторых товаров он может быть дольше — тогда мы сообщим его отдельно. Если с файлом есть техническая проблема, мы можем связаться с вами до печати.",
          "The time counts from the payment confirmation. For large runs or some products it can be longer — then we confirm it separately. If the file has a technical problem, we may contact you before printing.",
        ),
      ],
    },
    {
      heading: L("Ridicare din atelier — gratuit", "Самовывоз из мастерской — бесплатно", "Pickup at the workshop — free"),
      blocks: [
        {
          kind: "list",
          items: [
            L("Adresa: {address}", "Адрес: {address}", "Address: {address}"),
            L("Program: {hours}", "Часы работы: {hours}", "Opening hours: {hours}"),
          ],
        },
        p(
          "Te anunțăm când comanda e gata de ridicare.",
          "Мы сообщим, когда заказ будет готов к выдаче.",
          "We let you know when the order is ready for pickup.",
        ),
        { kind: "map" },
      ],
    },
    {
      heading: L("Curier EVS în Chișinău — {courierChisinau}", "Курьер EVS по Кишинёву — {courierChisinau}", "EVS courier in Chișinău — {courierChisinau}"),
      blocks: [
        p(
          "Livrare la adresa ta, de obicei în următoarea zi lucrătoare după ce comanda e gata.",
          "Доставка по вашему адресу, обычно на следующий рабочий день после готовности заказа.",
          "Delivery to your address, usually on the next working day after the order is ready.",
        ),
      ],
    },
    {
      heading: L("Livrare în toată Moldova — {courierMoldova}", "Доставка по всей Молдове — {courierMoldova}", "Delivery across Moldova — {courierMoldova}"),
      blocks: [
        p(
          "Trimitem coletul prin EVS după ce comanda e gata. Termenul de livrare depinde de localitate.",
          "Отправляем посылку через EVS, когда заказ готов. Срок доставки зависит от населённого пункта.",
          "We send the parcel with EVS once the order is ready. Delivery time depends on the location.",
        ),
        p(
          "Costul livrării îl vezi la plasarea comenzii, înainte de plată.",
          "Стоимость доставки видна при оформлении заказа, до оплаты.",
          "You see the delivery cost when placing the order, before paying.",
        ),
      ],
    },
    {
      heading: L("Plata", "Оплата", "Payment"),
      blocks: [
        p(
          "Online, cu cardul bancar, prin Paynet{soon}. Datele cardului le introduci pe pagina Paynet — noi nu le vedem.",
          "Онлайн банковской картой через Paynet{soon}. Данные карты вы вводите на странице Paynet — мы их не видим.",
          "Online by bank card via Paynet{soon}. You enter the card details on the Paynet page — we never see them.",
        ),
        p(
          "Comanda intră în producție după confirmarea plății. Plata la livrare (ramburs) nu este disponibilă.",
          "Заказ уходит в работу после подтверждения оплаты. Оплаты при получении (наложенный платёж) нет.",
          "The order goes into production after the payment is confirmed. Cash on delivery is not available.",
        ),
        p(
          "Pentru firme facem ofertă și factură — vezi [Pentru companii](/companii).",
          "Для фирм выставляем предложение и счёт — см. [Для компаний](/companii).",
          "For companies we issue a quote and an invoice — see [For companies](/companii).",
        ),
      ],
    },
    {
      heading: L("La primire", "При получении", "On receipt"),
      blocks: [
        p(
          "Verifică coletul când îl primești. Dacă ceva nu e în regulă, scrie-ne — pașii sunt descriși în [Politica de retur](/retur).",
          "Проверьте посылку при получении. Если что-то не так, напишите нам — порядок действий описан в [Политике возврата](/retur).",
          "Check the parcel when you receive it. If something is wrong, write to us — the steps are in the [Returns policy](/retur).",
        ),
      ],
    },
  ],
};

const FAQ: InfoPageDef = {
  slug: "intrebari",
  faq: true,
  title: INFO_LABEL.intrebari,
  description: L(
    "Fișiere, rezoluție, cărți de vizită, printare foto și documente, editor, livrare, plată și cont — răspunsuri scurte despre comenzile pe anvi.md.",
    "Файлы, разрешение, визитки, печать фото и документов, редактор, доставка, оплата и аккаунт — короткие ответы о заказах на anvi.md.",
    "Files, resolution, business cards, photo and document printing, the editor, delivery, payment and your account — short answers about ordering on anvi.md.",
  ),
  lead: L(
    "Nu ai găsit răspunsul? Sună-ne: {phone}.",
    "Не нашли ответ? Позвоните нам: {phone}.",
    "Didn't find the answer? Call us: {phone}.",
  ),
  sections: [
    {
      heading: L("Ce fișiere pot încărca?", "Какие файлы можно загрузить?", "Which files can I upload?"),
      blocks: [
        p("Depinde de produs:", "Зависит от товара:", "It depends on the product:"),
        {
          kind: "list",
          items: [
            L(
              "Produsele din catalog cu fișierul tău (tricouri, șepci, carnete etc.) — PNG, JPG, WEBP, PDF, TIFF sau SVG.",
              "Товары каталога с вашим файлом (футболки, кепки, блокноты и т. д.) — PNG, JPG, WEBP, PDF, TIFF или SVG.",
              "Catalog products with your own file (T-shirts, caps, notebooks, etc.) — PNG, JPG, WEBP, PDF, TIFF or SVG.",
            ),
            L(
              "Editorul online (căni, carnete, pixuri) — fotografii și imagini: JPG, PNG, WEBP etc.",
              "Онлайн-редактор (кружки, блокноты, ручки) — фотографии и картинки: JPG, PNG, WEBP и т. д.",
              "The online editor (mugs, notebooks, pens) — photos and images: JPG, PNG, WEBP, etc.",
            ),
            L(
              "[Cărți de vizită](/carti-de-vizita) — PDF, PNG sau JPG.",
              "[Визитки](/carti-de-vizita) — PDF, PNG или JPG.",
              "[Business cards](/carti-de-vizita) — PDF, PNG or JPG.",
            ),
            L(
              "[Printare documente](/printare) — PDF, Word (DOC, DOCX, ODT, RTF), JPG sau PNG.",
              "[Печать документов](/printare) — PDF, Word (DOC, DOCX, ODT, RTF), JPG или PNG.",
              "[Document printing](/printare) — PDF, Word (DOC, DOCX, ODT, RTF), JPG or PNG.",
            ),
            L(
              "[Printare foto](/printare) — JPG, PNG, HEIC (fotografiile de pe iPhone), WEBP sau TIFF.",
              "[Печать фото](/printare) — JPG, PNG, HEIC (фото с iPhone), WEBP или TIFF.",
              "[Photo printing](/printare) — JPG, PNG, HEIC (iPhone photos), WEBP or TIFF.",
            ),
          ],
        },
        p(
          "Dacă designul e în alt program, exportă-l în PDF sau PNG.",
          "Если дизайн сделан в другой программе, экспортируйте его в PDF или PNG.",
          "If the design is in another program, export it to PDF or PNG.",
        ),
      ],
    },
    {
      heading: L("Printați fotografii și documente?", "Печатаете фотографии и документы?", "Do you print photos and documents?"),
      blocks: [
        p(
          "Da. Pe pagina [Printare foto și documente](/printare) încarci documentele sau fotografiile, alegi formatul și numărul de copii și vezi prețul imediat. Le tipărim în atelier, iar tu le ridici sau le primești prin curier.",
          "Да. На странице [Печать фото и документов](/printare) загрузите документы или фотографии, выберите формат и число копий — цена видна сразу. Мы печатаем их в мастерской, а вы забираете их сами или получаете курьером.",
          "Yes. On the [Photo and document printing](/printare) page you upload documents or photos, choose the format and the number of copies and see the price right away. We print them at the workshop, and you pick them up or get them by courier.",
        ),
      ],
    },
    {
      heading: L("Ce rezoluție trebuie să aibă imaginea?", "Какое нужно разрешение?", "What resolution does the image need?"),
      blocks: [
        p(
          "La încărcare site-ul calculează rezoluția pentru mărimea imprimării și te avertizează dacă imaginea e prea mică (sub ~{lowDpi} dpi). Pentru cărțile de vizită recomandăm 300 dpi. Un PDF vectorial se imprimă clar la orice mărime.",
          "При загрузке сайт считает разрешение для размера печати и предупреждает, если картинка слишком мелкая (меньше ~{lowDpi} dpi). Для визиток рекомендуем 300 dpi. Векторный PDF печатается чётко в любом размере.",
          "On upload the site works out the resolution for the print size and warns you if the image is too small (under ~{lowDpi} dpi). For business cards we recommend 300 dpi. A vector PDF prints sharp at any size.",
        ),
      ],
    },
    {
      heading: L("Ce este bleed-ul la cărțile de vizită?", "Что такое вылеты (bleed) у визиток?", "What is bleed on business cards?"),
      blocks: [
        p(
          "Cartea de vizită finală are 90×50 mm, iar fișierul — 94×54 mm: câte 2 mm în plus pe fiecare latură, unde fundalul continuă. La tăiere acești milimetri se pierd și nu rămân margini albe. Textul și logoul — la cel puțin 4 mm de linia de tăiere. Pe pagina [Cărți de vizită](/carti-de-vizita) găsești un șablon SVG.",
          "Готовая визитка — 90×50 мм, а файл — 94×54 мм: по 2 мм с каждой стороны, куда продолжается фон. При резке эти миллиметры срезаются, и белых полос не остаётся. Текст и логотип — не ближе 4 мм к линии реза. На странице [Визитки](/carti-de-vizita) есть шаблон SVG.",
          "The finished card is 90×50 mm and the file 94×54 mm: 2 mm extra on every side where the background continues. These millimetres are cut off, so no white edges remain. Keep text and logo at least 4 mm inside the cut line. The [Business cards](/carti-de-vizita) page has an SVG template.",
        ),
      ],
    },
    {
      heading: L("Editor online sau fișier gata?", "Онлайн-редактор или готовый файл?", "Online editor or a ready file?"),
      blocks: [
        p(
          "Pentru căni, carnete și pixuri poți face macheta direct în editorul de pe pagina produsului. Pentru celelalte produse încarci un fișier gata. Dacă ai deja designul, încarcă-l — e cel mai rapid.",
          "Для кружек, блокнотов и ручек макет можно собрать прямо в редакторе на странице товара. Для остальных товаров загружается готовый файл. Если дизайн уже есть — просто загрузите его, так быстрее всего.",
          "For mugs, notebooks and pens you can make the layout right in the editor on the product page. For other products you upload a ready file. If you already have the design, just upload it — that's the quickest.",
        ),
      ],
    },
    {
      heading: L("Cum se face livrarea?", "Как работает доставка?", "How does delivery work?"),
      blocks: [
        p(
          "Ridicare gratuită din atelier ({address}), curier EVS în Chișinău — {courierChisinau}, în toată Moldova — {courierMoldova}. Detalii: [Livrare și plată](/livrare-si-plata).",
          "Бесплатный самовывоз из мастерской ({address}), курьер EVS по Кишинёву — {courierChisinau}, по всей Молдове — {courierMoldova}. Подробнее: [Доставка и оплата](/livrare-si-plata).",
          "Free pickup at the workshop ({address}), EVS courier in Chișinău — {courierChisinau}, across Moldova — {courierMoldova}. Details: [Delivery and payment](/livrare-si-plata).",
        ),
      ],
    },
    {
      heading: L("Cum plătesc?", "Как оплатить?", "How do I pay?"),
      blocks: [
        p(
          "Online, cu cardul, prin Paynet{soon}. Producția începe după confirmarea plății. Plata la livrare nu este disponibilă.",
          "Онлайн картой через Paynet{soon}. Производство начинается после подтверждения оплаты. Оплаты при получении нет.",
          "Online by card via Paynet{soon}. Production starts once the payment is confirmed. Cash on delivery is not available.",
        ),
      ],
    },
    {
      heading: L("Pot modifica sau anula comanda?", "Можно изменить или отменить заказ?", "Can I change or cancel my order?"),
      blocks: [
        p(
          "Scrie-ne sau sună cât mai repede: {phone}. Dacă producția nu a început, încercăm să schimbăm fișierul sau să anulăm comanda. Produsele personalizate nu se pot returna doar pentru că te-ai răzgândit — detaliile sunt în [Politica de retur](/retur).",
          "Напишите или позвоните как можно скорее: {phone}. Если производство ещё не началось, постараемся заменить файл или отменить заказ. Персонализированные товары нельзя вернуть просто потому, что вы передумали — подробности в [Политике возврата](/retur).",
          "Write or call us as soon as possible: {phone}. If production has not started, we try to swap the file or cancel the order. Personalised products cannot be returned just because you changed your mind — details are in the [Returns policy](/retur).",
        ),
      ],
    },
    {
      heading: L("Faceți comenzi pentru companii?", "Делаете заказы для компаний?", "Do you take corporate orders?"),
      blocks: [
        p(
          "Da: merch cu logo pentru echipă, clienți și evenimente, cu prețuri de tiraj, ofertă și factură pe firmă. Scrie-ne de pe pagina [Pentru companii](/companii).",
          "Да: мерч с логотипом для команды, клиентов и мероприятий, цены на тираж, предложение и счёт на фирму. Напишите нам со страницы [Для компаний](/companii).",
          "Yes: logo merch for teams, clients and events, with run prices, a quote and an invoice to your company. Contact us from the [For companies](/companii) page.",
        ),
      ],
    },
    {
      heading: L("Cum intru în cont? Am nevoie de parolă?", "Как войти в аккаунт? Нужен пароль?", "How do I sign in? Do I need a password?"),
      blocks: [
        p(
          "Nu ai nevoie de parolă. Contul se creează automat la prima comandă cu e-mail. Ca să intri, scrie adresa de e-mail pe pagina [Contul meu](/cont) — îți trimitem un link și un cod de 6 cifre, valabile 15 minute. În cont vezi comenzile și fișierele păstrate pentru comenzile repetate.",
          "Пароль не нужен. Аккаунт создаётся автоматически при первом заказе с e-mail. Чтобы войти, укажите e-mail на странице [Мой аккаунт](/cont) — мы пришлём ссылку и 6-значный код, они действуют 15 минут. В аккаунте видны заказы и файлы, сохранённые для повторных заказов.",
          "No password needed. The account is created automatically with your first order that has an e-mail. To sign in, enter your e-mail on the [My account](/cont) page — we send a link and a 6-digit code, valid for 15 minutes. Your account shows your orders and the files kept for repeat orders.",
        ),
      ],
    },
    {
      heading: L("Produsul are un defect. Ce fac?", "Товар с дефектом. Что делать?", "The product has a defect. What do I do?"),
      blocks: [
        p(
          "Fotografiază defectul și scrie-ne cu numărul comenzii. Pașii sunt descriși în [Politica de retur](/retur).",
          "Сфотографируйте дефект и напишите нам, указав номер заказа. Порядок действий — в [Политике возврата](/retur).",
          "Take a photo of the defect and write to us with the order number. The steps are in the [Returns policy](/retur).",
        ),
      ],
    },
  ],
};

export const INFO_PAGES: Record<InfoPageSlug, InfoPageDef> = {
  despre: DESPRE,
  "livrare-si-plata": LIVRARE,
  intrebari: FAQ,
};

/** `{name}` placeholders → values (unknown names stay as they are). */
export function fillInfoText(text: string, vars: Readonly<Record<string, string>>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}

/** `[text](/path)` links → their text (plain-text copies: JSON-LD, previews). */
export function stripInfoLinks(text: string): string {
  return parseInfoInline(text)
    .map((part) => part.text)
    .join("");
}

/**
 * Questions and answers of a FAQ page as plain text in one language
 * (placeholders filled, links → their text, list items on their own lines):
 * the FAQPage JSON-LD of /intrebari.
 */
export function infoFaqEntries(
  page: InfoPageDef,
  lang: ShopLang,
  vars: Readonly<Record<string, string>>,
): { question: string; answer: string }[] {
  const text = (l: Localized) => stripInfoLinks(fillInfoText(pickLocalized(l, lang), vars)).trim();
  return page.sections.map((s) => ({
    question: text(s.heading),
    answer: s.blocks
      .flatMap((b) => (b.kind === "p" ? [text(b.text)] : b.kind === "list" ? b.items.map((it) => `• ${text(it)}`) : []))
      .filter(Boolean)
      .join("\n"),
  }));
}

export type InfoInline = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

/** `[text](/path)` → links (storefront paths and https only); the rest is plain text. */
export function parseInfoInline(text: string): InfoInline[] {
  const out: InfoInline[] = [];
  const re = /\[([^\]]+)\]\(((?:\/|https:\/\/)[^)\s]*)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    out.push({ kind: "link", text: m[1]!, href: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** A storefront clean path for the link base: `/cont` stays on anvi.md, becomes `/shop/cont` on print.anvi.md. */
export function infoHref(base: "" | "/shop", href: string): string {
  if (!href.startsWith("/") || base === "") return href;
  return href === "/" ? "/shop" : `/shop${href}`;
}

/**
 * Placeholder values for a page language. The production time is the product
 * page's «✓ Gata în 1–2 zile lucrătoare» without the tick; delivery prices are
 * the checkout's display prices; «în curând» marks Paynet until a real
 * payment provider is configured.
 */
export function infoPageVars(o: {
  lang: ShopLang;
  address: string;
  hours: WeekHours;
  phone: string;
  paymentLive: boolean;
}): Record<string, string> {
  const t = shopT(o.lang);
  return {
    address: o.address,
    hours: formatShopHours(o.hours, o.lang),
    phone: o.phone ? formatPhone(o.phone) : "",
    readyIn: t("readyIn").replace(/^\s*✓\s*/, ""),
    courierChisinau: formatPrice(DELIVERY_DISPLAY_PRICE.courier_chisinau, o.lang),
    courierMoldova: formatPrice(DELIVERY_DISPLAY_PRICE.courier_moldova, o.lang),
    lowDpi: String(SHOP_LOW_DPI),
    soon: o.paymentLive ? "" : ` (${INFO_LABEL.soon[o.lang]})`,
  };
}
