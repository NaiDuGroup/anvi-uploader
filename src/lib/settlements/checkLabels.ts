import type { Locale } from "@/lib/i18n/types";
import { countEn, countRo, countRu, pluralRo, pluralRu } from "./plural";
import type { AuditAction } from "./auditTypes";
import type { InvoicePaymentStatus } from "./supplierMatch";
import type { CheckSignal, CheckType, VatAnomalyReason } from "./types";

export type SettlementsView = "balances" | "checks" | "journal";

type Money = (n: number) => string;
type DateFmt = (iso: string | null) => string;

export interface SettlementExtraLabels {
  views: Record<SettlementsView, string>;
  checks: {
    hint: string;
    allTypes: string;
    types: Record<CheckType, string>;
    text: (s: CheckSignal, money: Money, date: DateFmt) => string;
    action: Record<CheckType, string>;
    open: string;
    dismiss: string;
    dismissTitle: string;
    note: string;
    notePlaceholder: string;
    save: string;
    cancel: string;
    restore: string;
    showDismissed: (n: number) => string;
    hideDismissed: string;
    dismissedBy: (by: string | null, at: string, note: string | null) => string;
    empty: string;
    emptyAll: string;
    unavailable: string;
    matchingNotRun: string;
    runMatching: string;
    running: (done: number, total: number) => string;
    runDone: (suggested: number, confirmed: number) => string;
    error: string;
    count: (n: number) => string;
  };
  match: {
    title: string;
    hint: string;
    status: Record<InvoicePaymentStatus, string>;
    staleTitle: string;
    staleHint: string;
    staleReason: Record<"payment_moved" | "invoice_gone", string>;
    creditOffset: (money: string) => string;
    overAllocated: (money: string) => string;
    invoices: string;
    payments: string;
    suggestions: string;
    noSuggestions: string;
    autoRun: string;
    autoRunning: string;
    autoDone: (suggested: number, confirmed: number) => string;
    confirm: string;
    reject: string;
    confirmAll: (n: number) => string;
    link: string;
    linkTitle: string;
    linkHint: string;
    linkSave: string;
    linkAmount: string;
    linkOpen: (money: string) => string;
    /** Sum of the rows is above the payment's unallocated rest. */
    linkOverPayment: string;
    /** A row is above that invoice's unpaid rest. */
    linkOverInvoice: string;
    undo: string;
    undoConfirm: string;
    rejectedTitle: string;
    rejectedHint: string;
    rejectedAt: (date: string) => string;
    restore: string;
    paidOf: (paid: string, total: string) => string;
    linkedTo: string;
    auto: string;
    manual: string;
    bank: string;
    card: string;
    left: (money: string) => string;
    noInvoices: string;
    noPayments: string;
    error: string;
    saved: string;
    skipped: (n: number) => string;
    showAll: (n: number) => string;
    confidence: (n: number) => string;
  };
  journal: {
    title: string;
    recentTitle: string;
    hint: string;
    allActions: string;
    allUsers: string;
    autoUser: string;
    idnoFilter: string;
    actions: Record<AuditAction, string>;
    unrejectAction: string;
    colAt: string;
    colUser: string;
    colAction: string;
    colParty: string;
    colAmount: string;
    colDetails: string;
    empty: string;
    prev: string;
    next: string;
    page: (page: number, pages: number, total: number) => string;
    details: (action: string, d: Record<string, unknown> | null) => string;
    openFull: string;
  };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Words used by the journal «Подробности» column, per language. */
interface DetailsDict {
  categories: Record<string, string>;
  categoryReset: string;
  cardReset: string;
  notSupplier: string;
  /** Prefix of a payment order number (п/п). */
  pp: string;
  asOf: (date: string) => string;
  startedBy: (name: string) => string;
  supplierRun: (processed: unknown, confirmed: unknown, suggested: unknown, remaining: unknown) => string;
  paymentsRun: (scanned: unknown, applied: unknown, created: unknown) => string;
}

function makeDetails(w: DetailsDict): SettlementExtraLabels["journal"]["details"] {
  return (action, d) => {
    if (!d) return "";
    const parts: string[] = [];
    const doc = str(d.document);
    if (doc) parts.push(doc);
    if (Array.isArray(d.documents)) parts.push(d.documents.filter((x) => typeof x === "string").join(", "));
    const pay = str(d.paymentDocument);
    if (pay) parts.push(`${w.pp} ${pay}`);
    if (action === "category_set") {
      parts.push(d.category ? w.categories[String(d.category)] ?? String(d.category) : w.categoryReset);
    }
    if (action === "card_alias_set") {
      parts.push(str(d.merchantKey) ?? "");
      parts.push(d.reset ? w.cardReset : d.idno ? `→ IDNO ${d.idno}` : w.notSupplier);
    }
    if (action === "opening_balance_set" && str(d.asOfDate)) parts.push(w.asOf(String(d.asOfDate)));
    if (typeof d.confidence === "number") parts.push(`${d.confidence}%`);
    const reason = str(d.reason);
    if (reason) parts.push(reason);
    const note = str(d.note);
    if (note) parts.push(`«${note}»`);
    const startedBy = str(d.startedBy);
    if (startedBy) parts.push(w.startedBy(startedBy));
    if (d.processed != null && action === "supplier_auto_match") {
      parts.push(w.supplierRun(d.processed, d.confirmed ?? 0, d.suggested ?? 0, d.remaining));
    }
    if (action === "auto_match" && d.scanned != null) {
      parts.push(w.paymentsRun(d.scanned, d.applied ?? 0, d.created ?? 0));
    }
    const key = str(d.key);
    if (key && action.startsWith("check_")) parts.push(key.split(":")[0] ?? "");
    return parts.filter(Boolean).join(" · ");
  };
}

const docsOf = (s: CheckSignal): string => s.documents.filter((d) => d && d !== "—").join(", ");

// ─── RU ──────────────────────────────────────────────────────────────────────

const VAT_RU: Record<VatAnomalyReason, string> = {
  vat_negative: "НДС отрицательный",
  vat_over_total: "НДС больше суммы фактуры",
  vat_over_rate: "НДС больше 20 % от суммы — так не бывает",
  sum_mismatch: "сумма без НДС + НДС ≠ итог фактуры",
  lines_mismatch: "НДС по строкам не совпадает с НДС фактуры",
};

const CATEGORY_RU: Record<string, string> = {
  supplier: "Поставщик",
  customer: "Клиент",
  tax: "Налоги",
  own: "Свои счета",
  bank: "Банк",
  staff: "Сотрудник / директор",
  courier: "Курьер",
  other: "Прочее",
};

const RU: SettlementExtraLabels = {
  views: { balances: "Сальдо", checks: "Проверить", journal: "Журнал" },
  checks: {
    hint: "Автоматические подсказки, где в расчётах может быть ошибка. «Проверено» скрывает подсказку, пока документы за ней не изменятся.",
    allTypes: "Все",
    types: {
      duplicate_sale: "Дубль нашей фактуры",
      payment_without_invoice: "Оплата без фактуры",
      supplier_overpaid: "Переплата поставщику",
      duplicate_payment: "Двойной платёж",
      supplier_unpaid: "Не оплачено > 30 дней",
      payment_unmatched: "Платёж без фактуры",
      card_unattributed: "Карта не разобрана",
      low_confidence_sales: "Слабое автосопоставление",
      vat_anomaly: "НДС",
      receipt_and_bank: "B/f + перевод",
      over_allocated: "Привязано больше суммы фактуры",
      stale_link: "Устаревшая привязка",
    },
    text: (s, money, date) => {
      const docList = docsOf(s);
      const n = s.count ?? 1;
      switch (s.type) {
        case "duplicate_sale":
          return `Две наши фактуры по ${money(s.amount)} (${docList}), а оплата такой суммы одна — возможен дубль.`;
        case "payment_without_invoice":
          return `Клиент заплатил ${money(s.amount)} (${countRu(n, "платёж", "платежа", "платежей")}), а нашей фактуры рядом (±60 дней) нет.`;
        case "supplier_overpaid":
          return `Мы заплатили поставщику на ${money(s.amount)} больше, чем он выставил фактур.`;
        case "duplicate_payment":
          return `Одна и та же сумма ${money(s.amount)} ушла дважды за 7 дней (п/п ${docList}), а фактур на неё меньше двух.`;
        case "supplier_unpaid":
          return `${countRu(n, "фактура", "фактуры", "фактур")} поставщика ${pluralRu(n, "не оплачена", "не оплачены", "не оплачены")} на ${money(s.amount)}; самая старая — ${s.ageDays != null ? countRu(s.ageDays, "день", "дня", "дней") : "?"} (${date(s.date)}).${docList ? ` ${docList}` : ""}`;
        case "payment_unmatched":
          return `${n} ${pluralRu(n, "наш платёж", "наших платежа", "наших платежей")} на ${money(s.amount)} старше 30 дней ${pluralRu(n, "не привязан", "не привязаны", "не привязаны")} ни к одной фактуре.${docList ? ` П/п: ${docList}` : ""}`;
        case "card_unattributed": {
          const c = s.count ?? 0;
          return `${countRu(c, "покупка", "покупки", "покупок")} картой на ${money(s.amount)} ${pluralRu(c, "не привязана", "не привязаны", "не привязаны")} ни к поставщику, ни к «не поставщик».`;
        }
        case "low_confidence_sales":
          return `${countRu(n, "автосопоставление", "автосопоставления", "автосопоставлений")} оплат на ${money(s.amount)} с уверенностью от ${s.confidence ?? 0}% — никто не подтвердил.${docList ? ` Фактуры: ${docList}` : ""}`;
        case "vat_anomaly":
          return `${s.side === "sales" ? "Наша фактура" : "Фактура поставщика"} ${docList}: ${s.vatReason ? VAT_RU[s.vatReason] : "странный НДС"} (НДС ${money(s.amount)}).`;
        case "receipt_and_bank":
          return `Фактура ${s.documents[0] ?? ""} оплачена на месте (B/f), и ещё есть перевод той же суммы ${money(s.amount)} (п/п ${s.documents[1] ?? "—"}) — возможна двойная оплата.`;
        case "over_allocated":
          return `К фактуре ${docList} привязано платежей на ${money(s.amount)} больше её суммы (сумма фактуры уменьшилась?). Лишнее не учитывается — отвяжите или перепривяжите платёж.`;
        case "stale_link":
          return `${n} ${pluralRu(n, "подтверждённая связь", "подтверждённые связи", "подтверждённых связей")} на ${money(s.amount)} больше не ${pluralRu(n, "действует", "действуют", "действуют")}: платёж теперь отнесён к другому поставщику или фактура отменена.${docList ? ` Фактуры: ${docList}` : ""} ${n === 1 ? "Она не учитывается — отвяжите её." : "Они не учитываются — отвяжите их."}`;
      }
    },
    action: {
      duplicate_sale: "Открыть карточку",
      payment_without_invoice: "Открыть карточку",
      supplier_overpaid: "Открыть карточку",
      duplicate_payment: "Открыть карточку",
      supplier_unpaid: "Сопоставить оплаты",
      payment_unmatched: "Связать платежи",
      card_unattributed: "К «Оплатам картой»",
      low_confidence_sales: "Открыть в «Сверке»",
      vat_anomaly: "Открыть карточку",
      receipt_and_bank: "Открыть карточку",
      over_allocated: "Сопоставить оплаты",
      stale_link: "Сопоставить оплаты",
    },
    open: "Открыть",
    dismiss: "Проверено",
    dismissTitle: "Отметить как проверенное",
    note: "Комментарий",
    notePlaceholder: "Почему всё в порядке (необязательно)",
    save: "Сохранить",
    cancel: "Отмена",
    restore: "Вернуть",
    showDismissed: (n) => `Показать проверенные (${n})`,
    hideDismissed: "Скрыть проверенные",
    dismissedBy: (by, at, note) => `Проверено${by ? `: ${by}` : ""}, ${at}${note ? ` — ${note}` : ""}`,
    empty: "Под этот фильтр подсказок нет.",
    emptyAll: "Всё чисто — подсказок нет.",
    unavailable: "Подсказки сейчас не собрались. Попробуйте обновить страницу.",
    matchingNotRun:
      "Сопоставление оплат поставщикам ещё не запускалось — проверки «не оплачено» и «платёж без фактуры» включатся после него.",
    runMatching: "Сопоставить оплаты поставщикам",
    running: (done, total) => `Сопоставляю… ${done} из ${total}`,
    runDone: (s, c) => `Готово: подтверждено автоматически — ${c}, подсказок на проверку — ${s}.`,
    error: "Не удалось сохранить.",
    count: (n) => countRu(n, "подсказка", "подсказки", "подсказок"),
  },
  match: {
    title: "Оплаты поставщику по фактурам",
    hint: "Какой наш платёж закрыл какую фактуру. Сальдо считается по IDNO в целом — эти связи только объясняют его по документам.",
    status: {
      paid: "Оплачена",
      partial: "Частично",
      unpaid: "Не оплачена",
      receipt: "Оплачена на месте (B/f)",
      credit: "Сторно",
    },
    staleTitle: "Связь устарела",
    staleHint: "Платёж теперь отнесён к другому поставщику или фактура отменена — эти связи не учитываются.",
    staleReason: { payment_moved: "платёж у другого поставщика", invoice_gone: "фактура отменена / не действует" },
    creditOffset: (m) => `сторно −${m}`,
    overAllocated: (m) => `привязано больше на ${m}`,
    invoices: "Фактуры поставщика",
    payments: "Наши платежи",
    suggestions: "Подсказки",
    noSuggestions: "Подсказок нет. Нажмите «Подобрать», чтобы поискать связи.",
    autoRun: "Подобрать",
    autoRunning: "Подбираю…",
    autoDone: (s, c) => `Подтверждено автоматически: ${c}, подсказок: ${s}.`,
    confirm: "Подтвердить",
    reject: "Отклонить",
    confirmAll: (n) => `Подтвердить все ≥ 80% (${n})`,
    link: "Связать",
    linkTitle: "Связать платёж с фактурами",
    linkHint: "Отметьте фактуры и суммы. Больше платежа или остатка фактуры не распределится.",
    linkSave: "Связать",
    linkAmount: "Сумма",
    linkOpen: (m) => `не оплачено ${m}`,
    linkOverPayment: "Больше остатка платежа",
    linkOverInvoice: "Больше остатка фактуры",
    undo: "Отвязать",
    undoConfirm: "Отвязать платёж от фактуры?",
    rejectedTitle: "Отклонённые",
    rejectedHint: "«Вернуть» снимает отказ и сразу заново подбирает связи — подсказка снова появится в списке.",
    rejectedAt: (d) => `отклонено ${d}`,
    restore: "Вернуть",
    paidOf: (paid, total) => `${paid} из ${total}`,
    linkedTo: "Связи",
    auto: "авто",
    manual: "вручную",
    bank: "Перевод",
    card: "Карта",
    left: (m) => `не распределено ${m}`,
    noInvoices: "Фактур от этого поставщика нет.",
    noPayments: "Наших платежей этому IDNO нет.",
    error: "Не удалось выполнить действие.",
    saved: "Сохранено",
    skipped: (n) => `Пропущено: ${n} (уже распределено)`,
    showAll: (n) => `Показать все (${n})`,
    confidence: (n) => `${n}%`,
  },
  journal: {
    title: "Журнал действий",
    recentTitle: "Последние действия",
    hint: "Кто и когда сопоставлял оплаты, менял категории, привязки карты и начальные сальдо.",
    allActions: "Все действия",
    allUsers: "Все пользователи",
    autoUser: "Автоматически",
    unrejectAction: "Вернул отклонённую подсказку",
    idnoFilter: "IDNO",
    actions: {
      match: "Сопоставил оплату",
      unmatch: "Снял сопоставление",
      auto_match: "Автосопоставление (Сверка)",
      auto_confirm: "Автоподтверждение оплаты поставщику",
      supplier_auto_match: "Подбор оплат поставщикам",
      confirm: "Подтвердил связь",
      reject: "Отклонил подсказку",
      unconfirm: "Отвязал платёж",
      manual_allocate: "Связал вручную",
      category_set: "Категория",
      card_alias_set: "Привязка карты",
      opening_balance_set: "Начальное сальдо",
      opening_balance_removed: "Удалил начальное сальдо",
      check_dismissed: "Проверено",
      check_restored: "Вернул подсказку",
    },
    colAt: "Когда",
    colUser: "Кто",
    colAction: "Действие",
    colParty: "Контрагент",
    colAmount: "Сумма",
    colDetails: "Подробности",
    empty: "Записей нет.",
    prev: "Назад",
    next: "Дальше",
    page: (p, n, t) => `стр. ${p} из ${n} · ${countRu(t, "запись", "записи", "записей")}`,
    details: makeDetails({
      categories: CATEGORY_RU,
      categoryReset: "сброшена (авто)",
      cardReset: "сброс (авто)",
      notSupplier: "не поставщик",
      pp: "п/п",
      asOf: (d) => `на ${d}`,
      startedBy: (name) => `запустил ${name}`,
      supplierRun: (p, c, s, r) =>
        `поставщиков: ${p}, подтверждено: ${c}, подсказок: ${s}${Number(r) > 0 ? `, осталось: ${r}` : ""}`,
      paymentsRun: (sc, a, c) => `платежей: ${sc}, применено: ${a}, новых связей: ${c}`,
    }),
    openFull: "Весь журнал",
  },
};

// ─── RO ──────────────────────────────────────────────────────────────────────

const VAT_RO: Record<VatAnomalyReason, string> = {
  vat_negative: "TVA negativ",
  vat_over_total: "TVA mai mare decât suma facturii",
  vat_over_rate: "TVA peste 20 % din sumă — așa ceva nu există",
  sum_mismatch: "suma fără TVA + TVA ≠ totalul facturii",
  lines_mismatch: "TVA pe rânduri nu coincide cu TVA facturii",
};

const CATEGORY_RO: Record<string, string> = {
  supplier: "Furnizor",
  customer: "Client",
  tax: "Impozite",
  own: "Conturi proprii",
  bank: "Bancă",
  staff: "Angajat / director",
  courier: "Curier",
  other: "Altele",
};

const RO: SettlementExtraLabels = {
  views: { balances: "Sold", checks: "De verificat", journal: "Jurnal" },
  checks: {
    hint: "Indicii automate despre locurile unde decontările pot conține o greșeală. «Verificat» ascunde indiciul până când documentele din spatele lui se schimbă.",
    allTypes: "Toate",
    types: {
      duplicate_sale: "Factură proprie dublată",
      payment_without_invoice: "Plată fără factură",
      supplier_overpaid: "Plată în plus către furnizor",
      duplicate_payment: "Plată dublă",
      supplier_unpaid: "Neachitat > 30 de zile",
      payment_unmatched: "Plată nelegată de factură",
      card_unattributed: "Card nerepartizat",
      low_confidence_sales: "Asociere automată slabă",
      vat_anomaly: "TVA",
      receipt_and_bank: "B/f + transfer",
      over_allocated: "Legat peste suma facturii",
      stale_link: "Legătură învechită",
    },
    text: (s, money, date) => {
      const docList = docsOf(s);
      const n = s.count ?? 1;
      switch (s.type) {
        case "duplicate_sale":
          return `Două facturi ale noastre de ${money(s.amount)} (${docList}), dar o singură plată de această sumă — posibil dublură.`;
        case "payment_without_invoice":
          return `Clientul a plătit ${money(s.amount)} (${countRo(n, "plată", "plăți")}), dar nu există o factură de-a noastră în apropiere (±60 de zile).`;
        case "supplier_overpaid":
          return `I-am plătit furnizorului cu ${money(s.amount)} mai mult decât a facturat.`;
        case "duplicate_payment":
          return `Aceeași sumă ${money(s.amount)} a fost plătită de două ori în 7 zile (OP ${docList}), dar facturi pentru ea sunt mai puțin de două.`;
        case "supplier_unpaid":
          return `${countRo(n, "factură", "facturi")} de la furnizor ${pluralRo(n, "neachitată", "neachitate")} în sumă de ${money(s.amount)}; cea mai veche — ${s.ageDays != null ? countRo(s.ageDays, "zi", "zile") : "?"} (${date(s.date)}).${docList ? ` ${docList}` : ""}`;
        case "payment_unmatched":
          return `${countRo(n, "plată", "plăți")} de-ale noastre în sumă de ${money(s.amount)}, mai vechi de 30 de zile, ${pluralRo(n, "nu este legată", "nu sunt legate")} de nicio factură.${docList ? ` OP: ${docList}` : ""}`;
        case "card_unattributed": {
          const c = s.count ?? 0;
          return `${countRo(c, "cumpărătură", "cumpărături")} cu cardul în sumă de ${money(s.amount)} ${pluralRo(c, "nu este legată", "nu sunt legate")} nici de un furnizor, nici de «nu e furnizor».`;
        }
        case "low_confidence_sales":
          return `${countRo(n, "asociere automată", "asocieri automate")} de plăți în sumă de ${money(s.amount)} cu încredere de la ${s.confidence ?? 0}% — nimeni nu ${pluralRo(n, "a confirmat-o", "le-a confirmat")}.${docList ? ` Facturi: ${docList}` : ""}`;
        case "vat_anomaly":
          return `${s.side === "sales" ? "Factura noastră" : "Factura furnizorului"} ${docList}: ${s.vatReason ? VAT_RO[s.vatReason] : "TVA neobișnuit"} (TVA ${money(s.amount)}).`;
        case "receipt_and_bank":
          return `Factura ${s.documents[0] ?? ""} a fost achitată pe loc (B/f), dar există și un transfer de aceeași sumă ${money(s.amount)} (OP ${s.documents[1] ?? "—"}) — posibil plată dublă.`;
        case "over_allocated":
          return `De factura ${docList} sunt legate plăți cu ${money(s.amount)} peste suma ei (suma facturii s-a micșorat?). Surplusul nu se ia în calcul — dezlegați sau relegați plata.`;
        case "stale_link":
          return `${countRo(n, "legătură confirmată", "legături confirmate")} în sumă de ${money(s.amount)} nu mai ${pluralRo(n, "este valabilă", "sunt valabile")}: plata este acum atribuită altui furnizor sau factura a fost anulată.${docList ? ` Facturi: ${docList}` : ""} ${n === 1 ? "Nu se ia în calcul — dezlegați-o." : "Nu se iau în calcul — dezlegați-le."}`;
      }
    },
    action: {
      duplicate_sale: "Deschide fișa",
      payment_without_invoice: "Deschide fișa",
      supplier_overpaid: "Deschide fișa",
      duplicate_payment: "Deschide fișa",
      supplier_unpaid: "Asociază plățile",
      payment_unmatched: "Leagă plățile",
      card_unattributed: "La «Plăți cu cardul»",
      low_confidence_sales: "Deschide în «Reconciliere»",
      vat_anomaly: "Deschide fișa",
      receipt_and_bank: "Deschide fișa",
      over_allocated: "Asociază plățile",
      stale_link: "Asociază plățile",
    },
    open: "Deschide",
    dismiss: "Verificat",
    dismissTitle: "Marchează ca verificat",
    note: "Comentariu",
    notePlaceholder: "De ce totul e în regulă (opțional)",
    save: "Salvează",
    cancel: "Renunță",
    restore: "Restabilește",
    showDismissed: (n) => `Arată cele verificate (${n})`,
    hideDismissed: "Ascunde cele verificate",
    dismissedBy: (by, at, note) => `Verificat${by ? `: ${by}` : ""}, ${at}${note ? ` — ${note}` : ""}`,
    empty: "Niciun indiciu pentru acest filtru.",
    emptyAll: "Totul e în regulă — niciun indiciu.",
    unavailable: "Indiciile nu au putut fi încărcate acum. Încercați să reîmprospătați pagina.",
    matchingNotRun:
      "Asocierea plăților cu furnizorii nu a fost încă pornită — verificările «neachitat» și «plată nelegată de factură» se activează după ea.",
    runMatching: "Asociază plățile cu furnizorii",
    running: (done, total) => `Se asociază… ${done} din ${total}`,
    runDone: (s, c) => `Gata: confirmate automat — ${c}, indicii de verificat — ${s}.`,
    error: "Nu s-a putut salva.",
    count: (n) => countRo(n, "indiciu", "indicii"),
  },
  match: {
    title: "Plăți către furnizor pe facturi",
    hint: "Care plată a noastră a achitat care factură. Soldul se calculează pe IDNO în ansamblu — aceste legături doar îl explică pe documente.",
    status: {
      paid: "Achitată",
      partial: "Parțial",
      unpaid: "Neachitată",
      receipt: "Achitată pe loc (B/f)",
      credit: "Stornare",
    },
    staleTitle: "Legătură învechită",
    staleHint: "Plata este acum atribuită altui furnizor sau factura a fost anulată — aceste legături nu se iau în calcul.",
    staleReason: { payment_moved: "plata e la alt furnizor", invoice_gone: "factura e anulată / nu e valabilă" },
    creditOffset: (m) => `stornare −${m}`,
    overAllocated: (m) => `legat în plus cu ${m}`,
    invoices: "Facturile furnizorului",
    payments: "Plățile noastre",
    suggestions: "Sugestii",
    noSuggestions: "Nicio sugestie. Apăsați «Caută», ca să căutați legături.",
    autoRun: "Caută",
    autoRunning: "Se caută…",
    autoDone: (s, c) => `Confirmate automat: ${c}, sugestii: ${s}.`,
    confirm: "Confirmă",
    reject: "Respinge",
    confirmAll: (n) => `Confirmă toate ≥ 80% (${n})`,
    link: "Leagă",
    linkTitle: "Leagă plata de facturi",
    linkHint: "Bifați facturile și sumele. Peste plată sau peste restul facturii nu se va repartiza.",
    linkSave: "Leagă",
    linkAmount: "Suma",
    linkOpen: (m) => `neachitat ${m}`,
    linkOverPayment: "Peste restul plății",
    linkOverInvoice: "Peste restul facturii",
    undo: "Dezleagă",
    undoConfirm: "Dezlegați plata de factură?",
    rejectedTitle: "Respinse",
    rejectedHint: "«Restabilește» anulează respingerea și caută din nou legăturile — sugestia va reapărea în listă.",
    rejectedAt: (d) => `respinsă ${d}`,
    restore: "Restabilește",
    paidOf: (paid, total) => `${paid} din ${total}`,
    linkedTo: "Legături",
    auto: "auto",
    manual: "manual",
    bank: "Transfer",
    card: "Card",
    left: (m) => `nerepartizat ${m}`,
    noInvoices: "Nu există facturi de la acest furnizor.",
    noPayments: "Nu există plăți de-ale noastre către acest IDNO.",
    error: "Acțiunea nu a putut fi executată.",
    saved: "Salvat",
    skipped: (n) => `Omise: ${n} (deja repartizate)`,
    showAll: (n) => `Arată toate (${n})`,
    confidence: (n) => `${n}%`,
  },
  journal: {
    title: "Jurnalul acțiunilor",
    recentTitle: "Ultimele acțiuni",
    hint: "Cine și când a asociat plăți, a schimbat categorii, legături de card și solduri inițiale.",
    allActions: "Toate acțiunile",
    allUsers: "Toți utilizatorii",
    autoUser: "Automat",
    unrejectAction: "A restabilit o sugestie respinsă",
    idnoFilter: "IDNO",
    actions: {
      match: "A asociat o plată",
      unmatch: "A anulat asocierea",
      auto_match: "Asociere automată (Reconciliere)",
      auto_confirm: "Confirmare automată a plății către furnizor",
      supplier_auto_match: "Căutarea plăților către furnizori",
      confirm: "A confirmat legătura",
      reject: "A respins sugestia",
      unconfirm: "A dezlegat plata",
      manual_allocate: "A legat manual",
      category_set: "Categorie",
      card_alias_set: "Legătură card",
      opening_balance_set: "Sold inițial",
      opening_balance_removed: "A șters soldul inițial",
      check_dismissed: "Verificat",
      check_restored: "A restabilit indiciul",
    },
    colAt: "Când",
    colUser: "Cine",
    colAction: "Acțiune",
    colParty: "Contragent",
    colAmount: "Suma",
    colDetails: "Detalii",
    empty: "Nicio înregistrare.",
    prev: "Înapoi",
    next: "Înainte",
    page: (p, n, t) => `pag. ${p} din ${n} · ${countRo(t, "înregistrare", "înregistrări")}`,
    details: makeDetails({
      categories: CATEGORY_RO,
      categoryReset: "resetată (auto)",
      cardReset: "resetare (auto)",
      notSupplier: "nu e furnizor",
      pp: "OP",
      asOf: (d) => `la ${d}`,
      startedBy: (name) => `pornit de ${name}`,
      supplierRun: (p, c, s, r) =>
        `furnizori: ${p}, confirmate: ${c}, sugestii: ${s}${Number(r) > 0 ? `, rămase: ${r}` : ""}`,
      paymentsRun: (sc, a, c) => `plăți: ${sc}, aplicate: ${a}, legături noi: ${c}`,
    }),
    openFull: "Tot jurnalul",
  },
};

// ─── EN ──────────────────────────────────────────────────────────────────────

const VAT_EN: Record<VatAnomalyReason, string> = {
  vat_negative: "VAT is negative",
  vat_over_total: "VAT exceeds the invoice total",
  vat_over_rate: "VAT above 20 % of the amount — impossible",
  sum_mismatch: "amount ex. VAT + VAT ≠ invoice total",
  lines_mismatch: "line VAT does not match the invoice VAT",
};

const CATEGORY_EN: Record<string, string> = {
  supplier: "Supplier",
  customer: "Client",
  tax: "Taxes",
  own: "Own accounts",
  bank: "Bank",
  staff: "Staff / director",
  courier: "Courier",
  other: "Other",
};

const EN: SettlementExtraLabels = {
  views: { balances: "Balances", checks: "To check", journal: "Journal" },
  checks: {
    hint: "Automatic hints where the settlements may contain an error. «Checked» hides a hint until the documents behind it change.",
    allTypes: "All",
    types: {
      duplicate_sale: "Duplicate own invoice",
      payment_without_invoice: "Payment without invoice",
      supplier_overpaid: "Supplier overpaid",
      duplicate_payment: "Double payment",
      supplier_unpaid: "Unpaid > 30 days",
      payment_unmatched: "Payment not linked",
      card_unattributed: "Card not sorted",
      low_confidence_sales: "Weak auto-match",
      vat_anomaly: "VAT",
      receipt_and_bank: "B/f + transfer",
      over_allocated: "Linked above invoice total",
      stale_link: "Stale link",
    },
    text: (s, money, date) => {
      const docList = docsOf(s);
      const n = s.count ?? 1;
      switch (s.type) {
        case "duplicate_sale":
          return `Two of our invoices of ${money(s.amount)} (${docList}) but only one payment of that amount — possible duplicate.`;
        case "payment_without_invoice":
          return `The client paid ${money(s.amount)} (${countEn(n, "payment", "payments")}) with no invoice of ours nearby (±60 days).`;
        case "supplier_overpaid":
          return `We paid the supplier ${money(s.amount)} more than they invoiced.`;
        case "duplicate_payment":
          return `The same amount ${money(s.amount)} was paid twice within 7 days (PO ${docList}) with fewer than two invoices for it.`;
        case "supplier_unpaid":
          return `${countEn(n, "supplier invoice", "supplier invoices")} unpaid for ${money(s.amount)}; the oldest — ${s.ageDays != null ? countEn(s.ageDays, "day", "days") : "?"} (${date(s.date)}).${docList ? ` ${docList}` : ""}`;
        case "payment_unmatched":
          return `${countEn(n, "payment", "payments")} of ours for ${money(s.amount)} older than 30 days ${n === 1 ? "is" : "are"} not linked to any invoice.${docList ? ` PO: ${docList}` : ""}`;
        case "card_unattributed": {
          const c = s.count ?? 0;
          return `${countEn(c, "card purchase", "card purchases")} for ${money(s.amount)} ${c === 1 ? "is" : "are"} linked neither to a supplier nor to «not a supplier».`;
        }
        case "low_confidence_sales":
          return `${countEn(n, "auto-match", "auto-matches")} of payments for ${money(s.amount)} with confidence from ${s.confidence ?? 0}% — nobody confirmed.${docList ? ` Invoices: ${docList}` : ""}`;
        case "vat_anomaly":
          return `${s.side === "sales" ? "Our invoice" : "Supplier invoice"} ${docList}: ${s.vatReason ? VAT_EN[s.vatReason] : "odd VAT"} (VAT ${money(s.amount)}).`;
        case "receipt_and_bank":
          return `Invoice ${s.documents[0] ?? ""} was paid on the spot (B/f) and there is also a transfer of the same ${money(s.amount)} (PO ${s.documents[1] ?? "—"}) — possible double payment.`;
        case "over_allocated":
          return `Invoice ${docList} has ${money(s.amount)} more payments linked than its total (did the invoice shrink?). The excess is ignored — unlink or relink the payment.`;
        case "stale_link":
          return `${countEn(n, "confirmed link", "confirmed links")} for ${money(s.amount)} no longer ${n === 1 ? "applies" : "apply"}: the payment now belongs to another supplier or the invoice was cancelled.${docList ? ` Invoices: ${docList}` : ""} ${n === 1 ? "It is ignored — unlink it." : "They are ignored — unlink them."}`;
      }
    },
    action: {
      duplicate_sale: "Open card",
      payment_without_invoice: "Open card",
      supplier_overpaid: "Open card",
      duplicate_payment: "Open card",
      supplier_unpaid: "Match payments",
      payment_unmatched: "Link payments",
      card_unattributed: "To «Card payments»",
      low_confidence_sales: "Open in «Reconciliation»",
      vat_anomaly: "Open card",
      receipt_and_bank: "Open card",
      over_allocated: "Match payments",
      stale_link: "Match payments",
    },
    open: "Open",
    dismiss: "Checked",
    dismissTitle: "Mark as checked",
    note: "Comment",
    notePlaceholder: "Why it is fine (optional)",
    save: "Save",
    cancel: "Cancel",
    restore: "Restore",
    showDismissed: (n) => `Show checked (${n})`,
    hideDismissed: "Hide checked",
    dismissedBy: (by, at, note) => `Checked${by ? `: ${by}` : ""}, ${at}${note ? ` — ${note}` : ""}`,
    empty: "No hints for this filter.",
    emptyAll: "All clean — no hints.",
    unavailable: "Hints could not be built right now. Try reloading the page.",
    matchingNotRun:
      "Supplier payment matching has not run yet — the «unpaid» and «payment not linked» checks start after it.",
    runMatching: "Match supplier payments",
    running: (done, total) => `Matching… ${done} of ${total}`,
    runDone: (s, c) => `Done: auto-confirmed — ${c}, hints to review — ${s}.`,
    error: "Could not save.",
    count: (n) => countEn(n, "hint", "hints"),
  },
  match: {
    title: "Supplier payments by invoice",
    hint: "Which of our payments closed which invoice. The balance is per IDNO as a whole — these links only explain it by document.",
    status: {
      paid: "Paid",
      partial: "Partly",
      unpaid: "Unpaid",
      receipt: "Paid on the spot (B/f)",
      credit: "Credit note",
    },
    staleTitle: "Stale link",
    staleHint: "The payment now belongs to another supplier or the invoice was cancelled — these links are ignored.",
    staleReason: { payment_moved: "payment belongs to another supplier", invoice_gone: "invoice cancelled / not valid" },
    creditOffset: (m) => `credit −${m}`,
    overAllocated: (m) => `over-linked by ${m}`,
    invoices: "Supplier invoices",
    payments: "Our payments",
    suggestions: "Suggestions",
    noSuggestions: "No suggestions. Press «Find» to look for links.",
    autoRun: "Find",
    autoRunning: "Finding…",
    autoDone: (s, c) => `Auto-confirmed: ${c}, suggestions: ${s}.`,
    confirm: "Confirm",
    reject: "Reject",
    confirmAll: (n) => `Confirm all ≥ 80% (${n})`,
    link: "Link",
    linkTitle: "Link payment to invoices",
    linkHint: "Tick invoices and amounts. Nothing above the payment or the invoice rest is allocated.",
    linkSave: "Link",
    linkAmount: "Amount",
    linkOpen: (m) => `unpaid ${m}`,
    linkOverPayment: "Above the payment rest",
    linkOverInvoice: "Above the invoice rest",
    undo: "Unlink",
    undoConfirm: "Unlink the payment from the invoice?",
    rejectedTitle: "Rejected",
    rejectedHint: "«Restore» lifts the rejection and re-runs matching — the suggestion shows up in the list again.",
    rejectedAt: (d) => `rejected ${d}`,
    restore: "Restore",
    paidOf: (paid, total) => `${paid} of ${total}`,
    linkedTo: "Links",
    auto: "auto",
    manual: "manual",
    bank: "Transfer",
    card: "Card",
    left: (m) => `unallocated ${m}`,
    noInvoices: "No invoices from this supplier.",
    noPayments: "No payments of ours to this IDNO.",
    error: "Could not complete the action.",
    saved: "Saved",
    skipped: (n) => `Skipped: ${n} (already allocated)`,
    showAll: (n) => `Show all (${n})`,
    confidence: (n) => `${n}%`,
  },
  journal: {
    title: "Action log",
    recentTitle: "Recent actions",
    hint: "Who matched payments, changed categories, card links and opening balances, and when.",
    allActions: "All actions",
    allUsers: "All users",
    autoUser: "Automatic",
    unrejectAction: "Restored a rejected suggestion",
    idnoFilter: "IDNO",
    actions: {
      match: "Matched a payment",
      unmatch: "Removed a match",
      auto_match: "Auto-match (Reconciliation)",
      auto_confirm: "Auto-confirmed supplier payment",
      supplier_auto_match: "Supplier payment matching",
      confirm: "Confirmed a link",
      reject: "Rejected a suggestion",
      unconfirm: "Unlinked a payment",
      manual_allocate: "Linked manually",
      category_set: "Category",
      card_alias_set: "Card link",
      opening_balance_set: "Opening balance",
      opening_balance_removed: "Deleted opening balance",
      check_dismissed: "Checked",
      check_restored: "Restored a hint",
    },
    colAt: "When",
    colUser: "Who",
    colAction: "Action",
    colParty: "Counterparty",
    colAmount: "Amount",
    colDetails: "Details",
    empty: "No entries.",
    prev: "Previous",
    next: "Next",
    page: (p, n, t) => `page ${p} of ${n} · ${countEn(t, "entry", "entries")}`,
    details: makeDetails({
      categories: CATEGORY_EN,
      categoryReset: "reset (auto)",
      cardReset: "reset (auto)",
      notSupplier: "not a supplier",
      pp: "PO",
      asOf: (d) => `as of ${d}`,
      startedBy: (name) => `started by ${name}`,
      supplierRun: (p, c, s, r) =>
        `suppliers: ${p}, confirmed: ${c}, suggestions: ${s}${Number(r) > 0 ? `, left: ${r}` : ""}`,
      paymentsRun: (sc, a, c) => `payments: ${sc}, applied: ${a}, new links: ${c}`,
    }),
    openFull: "Full log",
  },
};

/** Exposed for tests (every leaf filled, RO without Cyrillic). */
export const SETTLEMENT_EXTRA_LABELS: Readonly<Record<Locale, SettlementExtraLabels>> = { ru: RU, ro: RO, en: EN };

export function getSettlementExtraLabels(locale: Locale): SettlementExtraLabels {
  return SETTLEMENT_EXTRA_LABELS[locale] ?? RU;
}
