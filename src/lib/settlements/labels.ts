import type { Locale } from "@/lib/i18n/types";
import type {
  CardMerchantSource,
  CategorySource,
  CounterpartyCategoryCode,
  LedgerEntryKind,
  SettlementFlag,
  SettlementState,
} from "./types";

export type SettlementFilter =
  | "all"
  | "they_owe"
  | "we_owe"
  | "we_overpaid"
  | "they_overpaid"
  | "check"
  | "unclassified"
  | "service";

export const SETTLEMENT_FILTERS: SettlementFilter[] = [
  "all",
  "they_owe",
  "we_owe",
  "we_overpaid",
  "they_overpaid",
  "check",
  "unclassified",
  "service",
];

export interface SettlementLabels {
  title: string;
  hint: string;
  search: string;
  sumTheyOwe: string;
  sumWeOwe: string;
  sumWeOverpaid: string;
  sumTheyOverpaid: string;
  sumCheck: string;
  sumUnclassified: string;
  filters: Record<SettlementFilter, string>;
  colParty: string;
  colSalesInvoiced: string;
  colReceived: string;
  colPurchasesInvoiced: string;
  colPaid: string;
  colBalance: string;
  colState: string;
  colCategory: string;
  states: Record<SettlementState, string>;
  categories: Record<CounterpartyCategoryCode, string>;
  noCategory: string;
  categorySource: Record<CategorySource, string>;
  empty: string;
  loadError: string;
  saveError: string;
  showMore: (n: number) => string;
  rowsCount: (n: number) => string;
  purchasesWithoutTotals: (n: number) => string;
  ledgerTitle: string;
  ledgerEmpty: string;
  ledgerKinds: Record<LedgerEntryKind, string>;
  colDate: string;
  colDocument: string;
  colAmount: string;
  colRunning: string;
  payerVia: string;
  flagText: (f: SettlementFlag, money: (n: number) => string, date: (iso: string) => string) => string;
  checkPill: string;
  paidByCard: (money: string) => string;
  paidByReceipt: (money: string) => string;
  receiptOutText: (ref: string | null, method: string | null) => string;
  cardSourceShort: Record<"alias" | "name" | "amount", string>;
  card: {
    title: string;
    hint: string;
    attributed: string;
    unattributed: string;
    ignored: string;
    byAmount: (n: number) => string;
    countSum: (n: number, money: string) => string;
    colMerchant: string;
    colCount: string;
    colSum: string;
    colLast: string;
    colSupplier: string;
    sources: Record<Exclude<CardMerchantSource, null>, string>;
    partly: (attributed: number, total: number) => string;
    pick: string;
    change: string;
    notSupplier: string;
    reset: string;
    search: string;
    noMatches: string;
    bindIdno: (idno: string) => string;
    cancel: string;
    allDone: string;
    showAttributed: (n: number) => string;
    hideAttributed: string;
    saveError: string;
  };
}

const RU: SettlementLabels = {
  title: "Взаиморасчёты",
  hint: "Сальдо по каждому IDNO с обеих сторон: наши фактуры и оплаты клиентов, фактуры поставщиков и наши платежи. Плюс — нам должны, минус — мы должны.",
  search: "Название или IDNO",
  sumTheyOwe: "Нам должны",
  sumWeOwe: "Мы должны",
  sumWeOverpaid: "Мы переплатили (поставщикам)",
  sumTheyOverpaid: "Нам переплатили (клиенты)",
  sumCheck: "Проверить",
  sumUnclassified: "Не размечено",
  filters: {
    all: "Все",
    they_owe: "Нам должны",
    we_owe: "Мы должны",
    we_overpaid: "Мы переплатили",
    they_overpaid: "Нам переплатили",
    check: "Проверить",
    unclassified: "Не размечено",
    service: "Служебные",
  },
  colParty: "Контрагент",
  colSalesInvoiced: "Мы выставили",
  colReceived: "Нам заплатили",
  colPurchasesInvoiced: "Нам выставили",
  colPaid: "Мы заплатили",
  colBalance: "Сальдо",
  colState: "Состояние",
  colCategory: "Категория",
  states: {
    they_owe: "Клиент должен",
    we_owe: "Мы должны",
    we_overpaid: "Мы переплатили",
    they_overpaid: "Клиент переплатил",
    settled: "Закрыто",
    unclassified: "Не размечено",
    service: "Служебный",
  },
  categories: {
    supplier: "Поставщик",
    customer: "Клиент",
    tax: "Налоги",
    own: "Свои счета",
    bank: "Банк",
    staff: "Сотрудник / директор",
    courier: "Курьер",
    other: "Прочее",
  },
  noCategory: "Не размечено",
  categorySource: {
    manual: "вручную",
    default: "по умолчанию",
    auto: "по фактурам",
    operational: "из «Не клиенты»",
  },
  empty: "Нет контрагентов под этот фильтр.",
  loadError: "Не удалось загрузить взаиморасчёты.",
  saveError: "Не удалось сохранить категорию.",
  showMore: (n) => `Показать ещё ${n}`,
  rowsCount: (n) => `${n} контрагентов`,
  purchasesWithoutTotals: (n) =>
    `${n} фактур поставщиков ещё без сумм (загрузка истории не закончена) — сальдо по закупкам может быть неполным.`,
  ledgerTitle: "Документы и платежи",
  ledgerEmpty: "Движений нет.",
  ledgerKinds: {
    sale_invoice: "Наша фактура",
    payment_in: "Оплата нам",
    receipt: "Чек (B/f)",
    historical_invoice: "Бумажная фактура",
    refund: "Возврат клиенту",
    purchase_invoice: "Фактура поставщика",
    payment_out: "Наш платёж",
    card_payment_out: "Оплата картой",
    receipt_out: "Оплачено на месте",
  },
  colDate: "Дата",
  colDocument: "Документ",
  colAmount: "Сумма",
  colRunning: "Сальдо",
  payerVia: "плательщик",
  flagText: (f, money, date) => {
    if (f.kind === "duplicate_sale") {
      return `Две фактуры по ${money(f.amount)} (${f.documents.join(", ")}; ${f.dates.map(date).join(" и ")}), а оплата такой суммы одна — возможен дубль.`;
    }
    if (f.kind === "payment_without_invoice") {
      return `Оплата без нашей фактуры рядом (±60 дней): ${money(f.amount)}, ${f.dates.map(date).join(", ")}.`;
    }
    if (f.kind === "supplier_overpaid") {
      return `Поставщику заплачено больше, чем выставлено, на ${money(f.amount)}.`;
    }
    return `Одинаковая сумма ${money(f.amount)} оплачена дважды (${f.dates.map(date).join(" и ")}), а фактура на неё одна.`;
  },
  checkPill: "Проверить",
  paidByCard: (m) => `в т.ч. картой ${m}`,
  paidByReceipt: (m) => `в т.ч. на месте (B/f) ${m}`,
  receiptOutText: (ref, method) =>
    `оплачено на месте: ${ref?.trim() || "B/f"}${method === "card" ? " (карта)" : method === "cash" ? " (наличные)" : ""}`,
  cardSourceShort: { alias: "вручную", name: "по названию", amount: "по сумме" },
  card: {
    title: "Оплаты картой",
    hint: "Покупки по корпоративной карте банк проводит как платёж в MAIB. Привязанные к поставщику считаются нашей оплатой ему; остальные остаются банковскими операциями.",
    attributed: "Привязано к поставщикам",
    unattributed: "Не привязано",
    ignored: "Не поставщик",
    byAmount: (n) => `из них ${n} по совпадению суммы с фактурой`,
    countSum: (n, m) => `${n} шт. · ${m}`,
    colMerchant: "Продавец (из банка)",
    colCount: "Покупок",
    colSum: "Сумма",
    colLast: "Последняя",
    colSupplier: "Поставщик",
    sources: {
      alias: "вручную",
      ignored: "не поставщик",
      name: "по названию",
      amount: "по сумме",
      mixed: "частично по сумме",
    },
    partly: (a, t) => `привязано ${a} из ${t}`,
    pick: "Выбрать поставщика",
    change: "Изменить",
    notSupplier: "Не поставщик",
    reset: "Сбросить (авто)",
    search: "Название или IDNO поставщика",
    noMatches: "Никого не найдено.",
    bindIdno: (idno) => `Привязать к IDNO ${idno}`,
    cancel: "Отмена",
    allDone: "Все покупки картой разобраны.",
    showAttributed: (n) => `Показать привязанные и «не поставщик» (${n})`,
    hideAttributed: "Скрыть привязанные",
    saveError: "Не удалось сохранить привязку.",
  },
};

const RO: SettlementLabels = {
  ...RU,
  title: "Decontări",
  hint: "Soldul pe fiecare IDNO pe ambele părți: facturile noastre și plățile clienților, facturile furnizorilor și plățile noastre. Plus — ni se datorează, minus — datorăm noi.",
  search: "Denumire sau IDNO",
  sumTheyOwe: "Ni se datorează",
  sumWeOwe: "Datorăm",
  sumWeOverpaid: "Am plătit în plus (furnizori)",
  sumTheyOverpaid: "Ne-au plătit în plus (clienți)",
  sumCheck: "De verificat",
  sumUnclassified: "Neclasificat",
  filters: {
    all: "Toți",
    they_owe: "Ni se datorează",
    we_owe: "Datorăm",
    we_overpaid: "Am plătit în plus",
    they_overpaid: "Ne-au plătit în plus",
    check: "De verificat",
    unclassified: "Neclasificat",
    service: "Servicii",
  },
  colParty: "Contrapartidă",
  colSalesInvoiced: "Am facturat",
  colReceived: "Ne-au plătit",
  colPurchasesInvoiced: "Ne-au facturat",
  colPaid: "Am plătit",
  colBalance: "Sold",
  colState: "Stare",
  colCategory: "Categorie",
  states: {
    they_owe: "Clientul datorează",
    we_owe: "Datorăm",
    we_overpaid: "Am plătit în plus",
    they_overpaid: "Clientul a plătit în plus",
    settled: "Închis",
    unclassified: "Neclasificat",
    service: "Serviciu",
  },
  categories: {
    supplier: "Furnizor",
    customer: "Client",
    tax: "Impozite",
    own: "Conturi proprii",
    bank: "Bancă",
    staff: "Angajat / director",
    courier: "Curier",
    other: "Altele",
  },
  noCategory: "Neclasificat",
  categorySource: {
    manual: "manual",
    default: "implicit",
    auto: "după facturi",
    operational: "din «Nu sunt clienți»",
  },
  empty: "Nicio contrapartidă pentru acest filtru.",
  loadError: "Nu s-au putut încărca decontările.",
  saveError: "Nu s-a putut salva categoria.",
  showMore: (n) => `Arată încă ${n}`,
  rowsCount: (n) => `${n} contrapartide`,
  purchasesWithoutTotals: (n) =>
    `${n} facturi de la furnizori încă fără sume (importul istoricului nu e gata) — soldul achizițiilor poate fi incomplet.`,
  ledgerTitle: "Documente și plăți",
  ledgerEmpty: "Nicio mișcare.",
  ledgerKinds: {
    sale_invoice: "Factura noastră",
    payment_in: "Plată primită",
    receipt: "Bon (B/f)",
    historical_invoice: "Factură pe hârtie",
    refund: "Restituire client",
    purchase_invoice: "Factura furnizorului",
    payment_out: "Plata noastră",
    card_payment_out: "Plată cu cardul",
    receipt_out: "Achitat pe loc",
  },
  colDate: "Data",
  colDocument: "Document",
  colAmount: "Suma",
  colRunning: "Sold",
  payerVia: "plătitor",
  flagText: (f, money, date) => {
    if (f.kind === "duplicate_sale") {
      return `Două facturi de ${money(f.amount)} (${f.documents.join(", ")}; ${f.dates.map(date).join(" și ")}), dar o singură plată de această sumă — posibil dublură.`;
    }
    if (f.kind === "payment_without_invoice") {
      return `Plată fără factură în apropiere (±60 zile): ${money(f.amount)}, ${f.dates.map(date).join(", ")}.`;
    }
    if (f.kind === "supplier_overpaid") {
      return `Furnizorului i s-a plătit cu ${money(f.amount)} mai mult decât a facturat.`;
    }
    return `Aceeași sumă ${money(f.amount)} plătită de două ori (${f.dates.map(date).join(" și ")}), dar o singură factură.`;
  },
  checkPill: "De verificat",
};

const EN: SettlementLabels = {
  ...RU,
  title: "Settlements",
  hint: "Balance per fiscal code on both sides: our invoices and client payments, supplier invoices and our payments. Plus — they owe us, minus — we owe them.",
  search: "Name or IDNO",
  sumTheyOwe: "Owed to us",
  sumWeOwe: "We owe",
  sumWeOverpaid: "We overpaid (suppliers)",
  sumTheyOverpaid: "Overpaid to us (clients)",
  sumCheck: "To check",
  sumUnclassified: "Unclassified",
  filters: {
    all: "All",
    they_owe: "Owed to us",
    we_owe: "We owe",
    we_overpaid: "We overpaid",
    they_overpaid: "Overpaid to us",
    check: "To check",
    unclassified: "Unclassified",
    service: "Service",
  },
  colParty: "Counterparty",
  colSalesInvoiced: "We invoiced",
  colReceived: "They paid",
  colPurchasesInvoiced: "They invoiced",
  colPaid: "We paid",
  colBalance: "Balance",
  colState: "State",
  colCategory: "Category",
  states: {
    they_owe: "Client owes",
    we_owe: "We owe",
    we_overpaid: "We overpaid",
    they_overpaid: "Client overpaid",
    settled: "Settled",
    unclassified: "Unclassified",
    service: "Service",
  },
  categories: {
    supplier: "Supplier",
    customer: "Client",
    tax: "Taxes",
    own: "Own accounts",
    bank: "Bank",
    staff: "Staff / director",
    courier: "Courier",
    other: "Other",
  },
  noCategory: "Unclassified",
  categorySource: {
    manual: "manual",
    default: "default",
    auto: "from invoices",
    operational: "from «Not clients»",
  },
  empty: "No counterparties for this filter.",
  loadError: "Could not load settlements.",
  saveError: "Could not save the category.",
  showMore: (n) => `Show ${n} more`,
  rowsCount: (n) => `${n} counterparties`,
  purchasesWithoutTotals: (n) =>
    `${n} supplier invoices still have no totals (history import not finished) — purchase balances may be incomplete.`,
  ledgerTitle: "Documents and payments",
  ledgerEmpty: "No movements.",
  ledgerKinds: {
    sale_invoice: "Our invoice",
    payment_in: "Payment to us",
    receipt: "Receipt (B/f)",
    historical_invoice: "Paper invoice",
    refund: "Refund to client",
    purchase_invoice: "Supplier invoice",
    payment_out: "Our payment",
    card_payment_out: "Card payment",
    receipt_out: "Paid on the spot",
  },
  colDate: "Date",
  colDocument: "Document",
  colAmount: "Amount",
  colRunning: "Balance",
  payerVia: "payer",
  flagText: (f, money, date) => {
    if (f.kind === "duplicate_sale") {
      return `Two invoices of ${money(f.amount)} (${f.documents.join(", ")}; ${f.dates.map(date).join(" and ")}) but only one payment of that amount — possible duplicate.`;
    }
    if (f.kind === "payment_without_invoice") {
      return `Payment with no invoice nearby (±60 days): ${money(f.amount)}, ${f.dates.map(date).join(", ")}.`;
    }
    if (f.kind === "supplier_overpaid") {
      return `Supplier paid ${money(f.amount)} more than invoiced.`;
    }
    return `Same amount ${money(f.amount)} paid twice (${f.dates.map(date).join(" and ")}) with one invoice.`;
  },
  checkPill: "To check",
};

export function getSettlementLabels(locale: Locale): SettlementLabels {
  if (locale === "ru") return RU;
  if (locale === "en") return EN;
  return RO;
}
