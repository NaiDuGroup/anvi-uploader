import type { Locale } from "@/lib/i18n/types";
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
    undo: string;
    undoConfirm: string;
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

const VAT_TEXT: Record<VatAnomalyReason, string> = {
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

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

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
      const docs = s.documents.filter((d) => d && d !== "—");
      const docList = docs.length > 0 ? docs.join(", ") : "";
      switch (s.type) {
        case "duplicate_sale":
          return `Две наши фактуры по ${money(s.amount)} (${docList}), а оплата такой суммы одна — возможен дубль.`;
        case "payment_without_invoice":
          return `Клиент заплатил ${money(s.amount)} (${s.count ?? 1} плат.), а нашей фактуры рядом (±60 дней) нет.`;
        case "supplier_overpaid":
          return `Мы заплатили поставщику на ${money(s.amount)} больше, чем он выставил фактур.`;
        case "duplicate_payment":
          return `Одна и та же сумма ${money(s.amount)} ушла дважды за 7 дней (п/п ${docList}), а фактур на неё меньше двух.`;
        case "supplier_unpaid":
          return `${s.count ?? 1} фактур(ы) поставщика не оплачены на ${money(s.amount)}; самая старая — ${s.ageDays ?? "?"} дн. (${date(s.date)}).${docList ? ` ${docList}` : ""}`;
        case "payment_unmatched":
          return `${s.count ?? 1} наш(их) платеж(ей) на ${money(s.amount)} старше 30 дней ни к одной фактуре не привязаны.${docList ? ` П/п: ${docList}` : ""}`;
        case "card_unattributed":
          return `${s.count ?? 0} покупок картой на ${money(s.amount)} не привязаны ни к поставщику, ни к «не поставщик».`;
        case "low_confidence_sales":
          return `${s.count ?? 1} автосопоставлений оплат на ${money(s.amount)} с уверенностью от ${s.confidence ?? 0}% — никто не подтвердил.${docList ? ` Фактуры: ${docList}` : ""}`;
        case "vat_anomaly":
          return `${s.side === "sales" ? "Наша фактура" : "Фактура поставщика"} ${docList}: ${s.vatReason ? VAT_TEXT[s.vatReason] : "странный НДС"} (НДС ${money(s.amount)}).`;
        case "receipt_and_bank":
          return `Фактура ${s.documents[0] ?? ""} оплачена на месте (B/f), и ещё есть перевод той же суммы ${money(s.amount)} (п/п ${s.documents[1] ?? "—"}) — возможна двойная оплата.`;
        case "over_allocated":
          return `К фактуре ${docList} привязано платежей на ${money(s.amount)} больше её суммы (сумма фактуры уменьшилась?). Лишнее не учитывается — отвяжите или перепривяжите платёж.`;
        case "stale_link":
          return `${s.count ?? 1} подтверждённ(ых) связ(ей) на ${money(s.amount)} больше не действуют: платёж теперь отнесён к другому поставщику или фактура отменена.${docList ? ` Фактуры: ${docList}` : ""} Они не учитываются — отвяжите их.`;
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
    runDone: (s, c) => `Готово: ${c} связей подтверждено автоматически, ${s} подсказок на проверку.`,
    error: "Не удалось сохранить.",
    count: (n) => `${n} подсказок`,
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
    undo: "Отвязать",
    undoConfirm: "Отвязать платёж от фактуры?",
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
    skipped: (n) => `${n} пропущено (уже распределено)`,
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
    page: (p, n, t) => `Стр. ${p} из ${n} · ${t} записей`,
    details: (action, d) => {
      if (!d) return "";
      const parts: string[] = [];
      const doc = str(d.document);
      if (doc) parts.push(doc);
      if (Array.isArray(d.documents)) parts.push(d.documents.filter((x) => typeof x === "string").join(", "));
      const pay = str(d.paymentDocument);
      if (pay) parts.push(`п/п ${pay}`);
      if (action === "category_set") parts.push(d.category ? CATEGORY_RU[String(d.category)] ?? String(d.category) : "сброшена (авто)");
      if (action === "card_alias_set") {
        parts.push(str(d.merchantKey) ?? "");
        parts.push(d.reset ? "сброс (авто)" : d.idno ? `→ IDNO ${d.idno}` : "не поставщик");
      }
      if (action === "opening_balance_set" && str(d.asOfDate)) parts.push(`на ${d.asOfDate}`);
      if (typeof d.confidence === "number") parts.push(`${d.confidence}%`);
      const reason = str(d.reason);
      if (reason) parts.push(reason);
      const note = str(d.note);
      if (note) parts.push(`«${note}»`);
      const startedBy = str(d.startedBy);
      if (startedBy) parts.push(`запустил ${startedBy}`);
      if (d.processed != null && (action === "supplier_auto_match" || action === "auto_match")) {
        if (action === "supplier_auto_match") {
          parts.push(`поставщиков ${d.processed}, подтверждено ${d.confirmed ?? 0}, подсказок ${d.suggested ?? 0}${Number(d.remaining) > 0 ? `, осталось ${d.remaining}` : ""}`);
        }
      }
      if (action === "auto_match" && d.scanned != null) {
        parts.push(`платежей ${d.scanned}, применено ${d.applied ?? 0}, новых связей ${d.created ?? 0}`);
      }
      const key = str(d.key);
      if (key && action.startsWith("check_")) parts.push(key.split(":")[0] ?? "");
      return parts.filter(Boolean).join(" · ");
    },
    openFull: "Весь журнал",
  },
};

export function getSettlementExtraLabels(locale: Locale): SettlementExtraLabels {
  if (locale === "ro") {
    return { ...RU, views: { balances: "Sold", checks: "De verificat", journal: "Jurnal" } };
  }
  if (locale === "en") {
    return { ...RU, views: { balances: "Balances", checks: "To check", journal: "Journal" } };
  }
  return RU;
}
