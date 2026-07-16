import type { Locale } from "@/lib/i18n/types";
import {
  FISCAL_STATUS_FILTER_BUCKETS,
  fiscalStatusBucket,
  type FiscalStatusBucket,
} from "@/lib/efactura/types";

export interface ReconLabels {
  title: string;
  subtitle: string;
  tabQueue: string;
  /** Full bank ledger (all CREDIT/DEBIT). */
  tabLedger: string;
  tabDebtors: string;
  upload: string;
  uploadCard: string;
  uploadExtras: string;
  uploading: string;
  uploadHint: string;
  autoMatch: string;
  autoMatchRunning: string;
  statements: string;
  noStatements: string;
  period: string;
  rows: string;
  uploaded: string;
  queueEmpty: string;
  colDate: string;
  colPayer: string;
  colPurpose: string;
  colAmount: string;
  colSuggestion: string;
  colActions: string;
  confirm: string;
  ignore: string;
  /** Restore an IGNORED / ACT_SETTLED / legacy HISTORICAL tx to the queue. */
  restoreToQueue: string;
  unmatch: string;
  matched: string;
  ignored: string;
  filterAllDirections: string;
  filterCredits: string;
  filterDebits: string;
  colMatchStatus: string;
  colStatement: string;
  directionCredit: string;
  directionDebit: string;
  statusUnmatched: string;
  statusSuggested: string;
  statusMatched: string;
  statusIgnored: string;
  statusHistorical: string;
  statusActSettled: string;
  ledgerEmpty: string;
  noSuggestion: string;
  confidence: string;
  overpaid: string;
  /** Leftover on payment while buyer still has open fiscal invoices. */
  remainderToAllocate: string;
  /** Button: FIFO leftover onto other open FFs of the same IDNO. */
  allocateRemainder: string;
  remainderAllocatedOk: (amount: string) => string;
  perPage: string;
  pageOf: (page: number, total: number) => string;
  // Reconciliation act (ledger) + client selector + statements history
  tabAct: string;
  tabStatements: string;
  selectClient: string;
  searchClient: string;
  allClients: string;
  actEmpty: string;
  colDebit: string;
  colCredit: string;
  colBalance: string;
  colDirection: string;
  dirIn: string;
  dirOut: string;
  rowPayment: string;
  download: string;
  downloadPdf: string;
  actSearchPlaceholder: string;
  actFilterEmpty: string;
  actFilterAll: string;
  actFilterInvoices: string;
  actFilterPayments: string;
  downloadingPdf: string;
  downloadPdfFail: string;
  colFile: string;
  colUploadedBy: string;
  colTransactions: string;
  viewTransactions: string;
  statementsEmpty: string;
  actTotalInvoiced: string;
  actTotalPaid: string;
  actBalance: string;
  debtorsTitle: string;
  debtorsEmpty: string;
  colClient: string;
  colIdno: string;
  colOpenInvoices: string;
  colOutstanding: string;
  colOldestDue: string;
  overdue: string;
  overdueDays: (days: number) => string;
  totalOutstanding: string;
  act: string;
  /** Debtors: close open FFs with cash/card + receipt photo. */
  settlePos: string;
  settlePosTitle: string;
  settlePosHint: string;
  settlePosCash: string;
  settlePosCard: string;
  settlePosSelectInvoices: string;
  settlePosPhoto: string;
  settlePosPhotoHint: string;
  settlePosNote: string;
  settlePosConfirm: string;
  settlePosCancel: string;
  settlePosOk: (n: number, amount: string) => string;
  settlePosNoOpen: string;
  receiptPhoto: string;
  sortByDue: string;
  // Debtors analytics dashboard
  cardReceivable: string;
  cardCredit: string;
  cardOverdue: string;
  cardNet: string;
  sectionDebtors: string;
  sectionCreditors: string;
  agingTitle: string;
  agingCurrent: string;
  aging1_15: string;
  aging16_30: string;
  aging30plus: string;
  colCreditAmount: string;
  creditHint: string;
  creditorsEmpty: string;
  sectionOperational: string;
  operationalHint: string;
  colReceived: string;
  markNotClient: string;
  unmarkClient: string;
  operationalEmpty: string;
  operationalTotalLabel: string;
  // Fiscal invoices page
  fiscalTitle: string;
  fiscalSubtitle: string;
  sync: string;
  syncing: string;
  enrichDetails: string;
  enriching: string;
  enrichRemaining: (n: number) => string;
  enrichDone: (settled: number) => string;
  /** POS: terminal card or cash (receiptSettledAt). */
  paidByReceipt: string;
  rowReceipt: string;
  /** Synthetic debit for a paper (pre-e-Factura) fiscal invoice cited in bank purpose. */
  rowPaperInvoice: string;
  /** Synthetic debit for a manually settled HISTORICAL payment. */
  rowHistoricalInvoice: string;
  /** Short badge on paper FF rows / payments that cite them. */
  paperFiscalNote: string;
  nonLivrare: string;
  nonLivrareHint: string;
  live: string;
  mock: string;
  search: string;
  fiscalEmpty: string;
  colNumber: string;
  colStatus: string;
  colBuyer: string;
  colLinked: string;
  colPayment: string;
  /** Bank transfer (paidAt without receiptSettledAt). */
  paid: string;
  unpaid: string;
  notLinked: string;
  // toasts
  uploadOk: (n: number) => string;
  uploadFail: string;
  autoMatchOk: (
    applied: number,
    scanned: number,
    actSettled?: number,
    remaindersApplied?: number,
  ) => string;
  pulledFiscal: (n: number) => string;
  syncOk: (s: {
    accepted: number;
    searched: number;
    archiveListed: number;
    archiveCreated: number;
    statusUpdated: number;
    markedDead: number;
    enrichProcessed: number;
  }) => string;
  importPortal: string;
  importPortalHint: string;
  importAction: string;
  importFile: string;
  importOr: string;
  importing: string;
  importOk: (created: number, updated: number) => string;
  fiscalCount: (n: number) => string;
  filterAllStatuses: string;
  filterStatusSigned: string;
  filterStatusAwaiting: string;
  filterAllPayments: string;
  filterPaymentTerminal: string;
  filterPaymentTransfer: string;
  filterPaymentUnpaid: string;
  filterReset: string;
  // Detail drawer
  detailInfo: string;
  detailLines: string;
  detailPayments: string;
  fieldSupplier: string;
  fieldBuyer: string;
  fieldIssueDate: string;
  fieldTotal: string;
  fieldVat: string;
  fieldNet: string;
  fieldPaymentStatus: string;
  fieldLinkedInvoice: string;
  fieldLastSynced: string;
  colName: string;
  colQty: string;
  colUnit: string;
  colUnitPrice: string;
  colNet: string;
  colVatRate: string;
  colLineTotal: string;
  loadDetails: string;
  loadingDetails: string;
  linesUnavailable: string;
  noPayments: string;
  detailsLoaded: string;
  close: string;
  // Suppliers / outgoing payments
  suppliersTitle: string;
  suppliersSubtitle: string;
  suppliersEmpty: string;
  kindTransfers: string;
  kindCommissions: string;
  kindAll: string;
  colSupplier: string;
  colPaymentsCount: string;
  colTotalPaid: string;
  colLastPayment: string;
  colFirstPayment: string;
  totalPaidLabel: string;
  paymentsTitle: string;
  colDoc: string;
  suppliersCount: (n: number) => string;
  tabSeller: string;
  tabBuyer: string;
  actionFail: string;
}

const RO: ReconLabels = {
  title: "Reconciliere plăți",
  subtitle: "Încărcați extrasul bancar și potriviți încasările cu conturile.",
  tabQueue: "De reconciliat",
  tabLedger: "Jurnal",
  tabDebtors: "Debitori",
  upload: "Încarcă extras (CSV)",
  uploadCard: "Încarcă extras card (CSV)",
  uploadExtras: "Încarcă extras (TXT)",
  uploading: "Se încarcă...",
  uploadHint: "Format acceptat: extras MAIB (.csv)",
  autoMatch: "Potrivire automată",
  autoMatchRunning: "Se potrivește...",
  statements: "Extrase",
  noStatements: "Niciun extras încărcat.",
  period: "Perioadă",
  rows: "rânduri",
  uploaded: "Încărcat",
  queueEmpty: "Nicio încasare de revizuit.",
  colDate: "Data",
  colPayer: "Plătitor",
  colPurpose: "Destinație",
  colAmount: "Sumă",
  colSuggestion: "Sugestie",
  colActions: "Acțiuni",
  confirm: "Confirmă",
  ignore: "Ignoră",
  restoreToQueue: "Înapoi în coadă",
  unmatch: "Anulează",
  matched: "Potrivit",
  ignored: "Ignorat",
  filterAllDirections: "Toate (dir.)",
  filterCredits: "Încasări",
  filterDebits: "Plăți",
  colMatchStatus: "Status",
  colStatement: "Extras",
  directionCredit: "Încasare",
  directionDebit: "Plată",
  statusUnmatched: "Nereconciliat",
  statusSuggested: "Sugestie",
  statusMatched: "Potrivit",
  statusIgnored: "Ignorat / operațional",
  statusHistorical: "FF veche",
  statusActSettled: "Pe act (=0)",
  ledgerEmpty: "Nicio tranzacție pentru filtrele selectate.",
  noSuggestion: "Fără sugestie",
  confidence: "încredere",
  overpaid: "Supraplată",
  remainderToAllocate: "Rest de alocat",
  allocateRemainder: "Alocă restul",
  remainderAllocatedOk: (amount) => `Rest alocat: ${amount}.`,
  perPage: "Pe pagină",
  pageOf: (p, t) => `${p} din ${t}`,
  tabAct: "Act de verificare",
  tabStatements: "Extrase",
  selectClient: "Alegeți clientul",
  searchClient: "Căutare după nume sau cod fiscal...",
  allClients: "Toți clienții",
  actEmpty: "Selectați un client pentru a vedea actul.",
  colDebit: "Debit",
  colCredit: "Credit",
  colBalance: "Sold",
  colDirection: "Tip",
  dirIn: "Încasare",
  dirOut: "Plată",
  rowPayment: "Încasare",
  download: "Descarcă PDF",
  downloadPdf: "Descarcă PDF",
  actSearchPlaceholder: "Căutare factură, sumă, destinație...",
  actFilterEmpty: "Nicio înregistrare după filtru.",
  actFilterAll: "Toate",
  actFilterInvoices: "Facturi",
  actFilterPayments: "Încasări",
  downloadingPdf: "Se descarcă...",
  downloadPdfFail: "Nu s-a putut descărca PDF-ul.",
  colFile: "Fișier",
  colUploadedBy: "Încărcat de",
  colTransactions: "Tranzacții",
  viewTransactions: "Vezi tranzacțiile",
  statementsEmpty: "Niciun extras încărcat.",
  actTotalInvoiced: "Total facturat",
  actTotalPaid: "Total achitat",
  actBalance: "Sold de plată",
  debtorsTitle: "Solduri debitori",
  debtorsEmpty: "Niciun debitor. Toate conturile sunt achitate.",
  colClient: "Client",
  colIdno: "Cod fiscal",
  colOpenInvoices: "Conturi deschise",
  colOutstanding: "Datorie",
  colOldestDue: "Scadență",
  overdue: "Restant",
  overdueDays: (d) => `Restant de ${d} zile`,
  totalOutstanding: "Total de încasat",
  act: "Act de verificare",
  settlePos: "Închide",
  settlePosTitle: "Închide cu numerar / card",
  settlePosHint:
    "Marchează facturile selectate ca achitate la POS. Fotografia bonului este obligatorie.",
  settlePosCash: "Numerar",
  settlePosCard: "Card",
  settlePosSelectInvoices: "Facturi deschise",
  settlePosPhoto: "Foto bon",
  settlePosPhotoHint: "JPG, PNG sau WEBP",
  settlePosNote: "Notă (opțional)",
  settlePosConfirm: "Închide",
  settlePosCancel: "Anulează",
  settlePosOk: (n, amount) => `Închise ${n} facturi · ${amount}.`,
  settlePosNoOpen: "Nu există facturi deschise pentru acest client.",
  receiptPhoto: "Bon / chitanță",
  sortByDue: "Sortează după scadență",
  cardReceivable: "De încasat",
  cardCredit: "Plăți în avans / fără factură",
  cardOverdue: "Restanțe",
  cardNet: "Sold net",
  sectionDebtors: "Ne datorează",
  sectionCreditors: "Avansuri / fără factură",
  agingTitle: "Vechimea restanțelor",
  agingCurrent: "În termen",
  aging1_15: "1–15 zile",
  aging16_30: "16–30 zile",
  aging30plus: "30+ zile",
  colCreditAmount: "Supraplată",
  creditHint: "Achitat mai mult decât facturat — posibil lipsește o factură fiscală",
  creditorsEmpty: "Nu există supraplăți.",
  sectionOperational: "Operaționale",
  operationalHint:
    "Bani de la terminal/bancă — bonurile fiscale sunt deja emise, factura nu este necesară",
  colReceived: "Încasat",
  markNotClient: "Nu e client",
  unmarkClient: "Restaurează",
  operationalEmpty: "Nu există înregistrări operaționale.",
  operationalTotalLabel: "Total operațional",
  fiscalTitle: "Facturi fiscale (e-Factura)",
  fiscalSubtitle: "Facturi fiscale sincronizate din serviciul e-Factura.",
  sync: "Sincronizează",
  syncing: "Se sincronizează...",
  enrichDetails: "Încarcă detalii (B/f)",
  enriching: "Se încarcă detalii...",
  enrichRemaining: (n) => `Rămase de încărcat: ${n}`,
  enrichDone: (s) => `Gata. Achitate prin bon fiscal: ${s}`,
  paidByReceipt: "Achitat (terminal / numerar)",
  rowReceipt: "Bon fiscal",
  rowPaperInvoice: "FF pe hârtie",
  rowHistoricalInvoice: "FF veche",
  paperFiscalNote: "în afara e-Factura",
  nonLivrare: "Non-livrare",
  nonLivrareHint: "Nu este factură de livrare — exclusă din reconciliere",
  live: "Conectat",
  mock: "Demo (mock)",
  search: "Caută...",
  fiscalEmpty: "Nicio factură fiscală. Apăsați Sincronizează.",
  colNumber: "Număr",
  colStatus: "Statut",
  colBuyer: "Cumpărător",
  colLinked: "Cont legat",
  colPayment: "Plată",
  paid: "Achitat (transfer)",
  unpaid: "Neachitat",
  notLinked: "Nelegat",
  uploadOk: (n) => `Import reușit: ${n} tranzacții.`,
  uploadFail: "Încărcarea a eșuat.",
  autoMatchOk: (a, s, act, rem) => {
    const parts = [`Potrivire automată: ${a} din ${s} aplicate`];
    if (act && act > 0) parts.push(`${act} închise pe act`);
    if (rem && rem > 0) parts.push(`${rem} resturi alocate`);
    return `${parts.join("; ")}.`;
  },
  pulledFiscal: (n) => `Preluate din e-Factura: ${n} facturi noi.`,
  syncOk: (s) =>
    `Sync OK: API ${s.accepted} · search ${s.searched} · arhivă +${s.archiveCreated} (din ${s.archiveListed}) · statusuri ${s.statusUpdated}${s.markedDead ? ` (${s.markedDead} respinse/anulate)` : ""} · detalii ${s.enrichProcessed}.`,
  importPortal: "Backfill portal",
  importPortalHint:
    "Backfill rar: CSV/HTML din «Finalizate» / «Trimise» dacă Sync a omis ceva. În mod normal ajunge Sync + cron (zilnic).",
  importAction: "Importă",
  importFile: "Încarcă CSV (Registrul FF)",
  importOr: "sau lipiți HTML mai jos",
  importing: "Se importă…",
  importOk: (c, u) => `Import: ${c} adăugate, ${u} actualizate.`,
  fiscalCount: (n) => `${n} facturi`,
  filterAllStatuses: "Toate statusurile",
  filterStatusSigned: "Semnată",
  filterStatusAwaiting: "Așteaptă semnătura",
  filterAllPayments: "Toate (plată)",
  filterPaymentTerminal: "Terminal / numerar",
  filterPaymentTransfer: "Transfer",
  filterPaymentUnpaid: "Neachitat",
  filterReset: "Resetează",
  detailInfo: "Detalii",
  detailLines: "Produse și servicii",
  detailPayments: "Plăți",
  fieldSupplier: "Furnizor",
  fieldBuyer: "Cumpărător",
  fieldIssueDate: "Data emiterii",
  fieldTotal: "Total",
  fieldVat: "TVA",
  fieldNet: "Fără TVA",
  fieldPaymentStatus: "Status plată",
  fieldLinkedInvoice: "Cont legat",
  fieldLastSynced: "Sincronizat",
  colName: "Denumire",
  colQty: "Cant.",
  colUnit: "U.M.",
  colUnitPrice: "Preț unitar",
  colNet: "Fără TVA",
  colVatRate: "TVA %",
  colLineTotal: "Total",
  loadDetails: "Încarcă detalii din e-Factura",
  loadingDetails: "Se încarcă…",
  linesUnavailable: "Liniile nu sunt disponibile. Încarcă detaliile din e-Factura.",
  noPayments: "Nicio plată alocată.",
  detailsLoaded: "Detalii încărcate din e-Factura.",
  close: "Închide",
  suppliersTitle: "Furnizori / Plăți",
  suppliersSubtitle: "Plăți efectuate din extrasele bancare, grupate pe companie.",
  suppliersEmpty: "Niciun furnizor găsit.",
  kindTransfers: "Transferuri furnizori",
  kindCommissions: "Comisioane bancare",
  kindAll: "Toate",
  colSupplier: "Furnizor",
  colPaymentsCount: "Plăți",
  colTotalPaid: "Total plătit",
  colLastPayment: "Ultima plată",
  colFirstPayment: "Prima plată",
  totalPaidLabel: "Total plătit",
  paymentsTitle: "Plăți",
  colDoc: "Document",
  suppliersCount: (n) => `${n} furnizori`,
  tabSeller: "Sunt vânzător",
  tabBuyer: "Sunt cumpărător",
  actionFail: "Operațiunea a eșuat.",
};

const RU: ReconLabels = {
  title: "Сверка платежей",
  subtitle: "Загрузите банковскую выписку и сопоставьте поступления со счетами.",
  tabQueue: "Очередь",
  tabLedger: "Журнал",
  tabDebtors: "Должники",
  upload: "Загрузить выписку (CSV)",
  uploadCard: "Загрузить по карте (CSV)",
  uploadExtras: "Загрузить extras (TXT)",
  uploading: "Загрузка...",
  uploadHint: "Поддерживается формат MAIB (.csv)",
  autoMatch: "Авто-сопоставление",
  autoMatchRunning: "Сопоставление...",
  statements: "Выписки",
  noStatements: "Выписки не загружены.",
  period: "Период",
  rows: "строк",
  uploaded: "Загружено",
  queueEmpty: "Нет поступлений для проверки.",
  colDate: "Дата",
  colPayer: "Плательщик",
  colPurpose: "Назначение",
  colAmount: "Сумма",
  colSuggestion: "Предложение",
  colActions: "Действия",
  confirm: "Подтвердить",
  ignore: "Игнорировать",
  restoreToQueue: "Вернуть в очередь",
  unmatch: "Отменить",
  matched: "Сопоставлено",
  ignored: "Игнорировано",
  filterAllDirections: "Все (направление)",
  filterCredits: "Приходы",
  filterDebits: "Расходы",
  colMatchStatus: "Статус",
  colStatement: "Выписка",
  directionCredit: "Приход",
  directionDebit: "Расход",
  statusUnmatched: "Не сверено",
  statusSuggested: "Предложение",
  statusMatched: "Сверено",
  statusIgnored: "Игнор / операционные",
  statusHistorical: "Старая ФФ",
  statusActSettled: "По акту (=0)",
  ledgerEmpty: "Нет транзакций по выбранным фильтрам.",
  noSuggestion: "Нет предложения",
  confidence: "уверенность",
  overpaid: "Переплата",
  remainderToAllocate: "Остаток к разносу",
  allocateRemainder: "Разнести остаток",
  remainderAllocatedOk: (amount) => `Остаток разнесён: ${amount}.`,
  perPage: "На странице",
  pageOf: (p, t) => `${p} из ${t}`,
  tabAct: "Акт сверки",
  tabStatements: "Выписки",
  selectClient: "Выберите клиента",
  searchClient: "Поиск по названию или фискальному коду...",
  allClients: "Все клиенты",
  actEmpty: "Выберите клиента, чтобы увидеть акт.",
  colDebit: "Дебет",
  colCredit: "Кредит",
  colBalance: "Сальдо",
  colDirection: "Тип",
  dirIn: "Приход",
  dirOut: "Расход",
  rowPayment: "Оплата",
  download: "Скачать PDF",
  downloadPdf: "Скачать PDF",
  actSearchPlaceholder: "Поиск фактуры, суммы, назначения...",
  actFilterEmpty: "Нет записей по фильтру.",
  actFilterAll: "Все",
  actFilterInvoices: "Фактуры",
  actFilterPayments: "Оплаты",
  downloadingPdf: "Скачивание...",
  downloadPdfFail: "Не удалось скачать PDF.",
  colFile: "Файл",
  colUploadedBy: "Загрузил",
  colTransactions: "Транзакций",
  viewTransactions: "Показать транзакции",
  statementsEmpty: "Выписки не загружены.",
  actTotalInvoiced: "Всего выставлено",
  actTotalPaid: "Всего оплачено",
  actBalance: "Остаток к оплате",
  debtorsTitle: "Балансы должников",
  debtorsEmpty: "Должников нет. Все счета оплачены.",
  colClient: "Клиент",
  colIdno: "Фискальный код",
  colOpenInvoices: "Открытые счета",
  colOutstanding: "Долг",
  colOldestDue: "Срок оплаты",
  overdue: "Просрочено",
  overdueDays: (d) => `Просрочено на ${d} дн.`,
  totalOutstanding: "Итого к получению",
  act: "Акт сверки",
  settlePos: "Закрыть",
  settlePosTitle: "Закрыть кэшем / картой",
  settlePosHint:
    "Отметить выбранные фактуры как оплаченные на кассе. Фото чека обязательно.",
  settlePosCash: "Кэш",
  settlePosCard: "Карта",
  settlePosSelectInvoices: "Открытые фактуры",
  settlePosPhoto: "Фото чека",
  settlePosPhotoHint: "JPG, PNG или WEBP",
  settlePosNote: "Заметка (необязательно)",
  settlePosConfirm: "Закрыть",
  settlePosCancel: "Отмена",
  settlePosOk: (n, amount) => `Закрыто фактур: ${n} · ${amount}.`,
  settlePosNoOpen: "Нет открытых фактур у этого клиента.",
  receiptPhoto: "Чек",
  sortByDue: "Сортировать по сроку",
  cardReceivable: "Нам должны",
  cardCredit: "Переплаты / нет фактуры",
  cardOverdue: "Просрочено",
  cardNet: "Чистый баланс",
  sectionDebtors: "Нам должны",
  sectionCreditors: "Переплаты / нет фактуры",
  agingTitle: "Срок просрочки",
  agingCurrent: "В сроке",
  aging1_15: "1–15 дн.",
  aging16_30: "16–30 дн.",
  aging30plus: "30+ дн.",
  colCreditAmount: "Переплата",
  creditHint: "Оплачено больше, чем выставлено — возможно, не выписана фактура",
  creditorsEmpty: "Переплат нет.",
  sectionOperational: "Операционные",
  operationalHint:
    "Деньги с терминала/банка — чеки уже выбиты, фактура не требуется",
  colReceived: "Поступило",
  markNotClient: "Не клиент",
  unmarkClient: "Вернуть",
  operationalEmpty: "Операционных записей нет.",
  operationalTotalLabel: "Итого операционные",
  fiscalTitle: "Фискальные фактуры (e-Factura)",
  fiscalSubtitle: "Фискальные фактуры, синхронизированные из сервиса e-Factura.",
  sync: "Синхронизировать",
  syncing: "Синхронизация...",
  enrichDetails: "Дозагрузить детали (B/f)",
  enriching: "Дозагрузка деталей...",
  enrichRemaining: (n) => `Осталось загрузить: ${n}`,
  enrichDone: (s) => `Готово. Оплачено по бону: ${s}`,
  paidByReceipt: "Оплачено (терминал / кэш)",
  rowReceipt: "Бон фискал",
  rowPaperInvoice: "Бумажная FF",
  rowHistoricalInvoice: "Старая ФФ",
  paperFiscalNote: "вне e-Factura",
  nonLivrare: "Non-livrare",
  nonLivrareHint: "Не фактура на поставку — исключена из сверки",
  live: "Подключено",
  mock: "Демо (mock)",
  search: "Поиск...",
  fiscalEmpty: "Нет фактур. Нажмите Синхронизировать.",
  colNumber: "Номер",
  colStatus: "Статус",
  colBuyer: "Покупатель",
  colLinked: "Связанный счёт",
  colPayment: "Оплата",
  paid: "Оплачено (перевод)",
  unpaid: "Не оплачено",
  notLinked: "Не связан",
  uploadOk: (n) => `Импортировано: ${n} транзакций.`,
  uploadFail: "Ошибка загрузки.",
  autoMatchOk: (a, s, act, rem) => {
    const parts = [`Авто-сопоставление: применено ${a} из ${s}`];
    if (act && act > 0) parts.push(`по акту закрыто ${act}`);
    if (rem && rem > 0) parts.push(`разнесено остатков ${rem}`);
    return `${parts.join("; ")}.`;
  },
  pulledFiscal: (n) => `Подтянуто из e-Factura: ${n} новых фактур.`,
  syncOk: (s) =>
    `Sync OK: API ${s.accepted} · search ${s.searched} · архив +${s.archiveCreated} (из ${s.archiveListed}) · статусы ${s.statusUpdated}${s.markedDead ? ` (${s.markedDead} откл./аннул.)` : ""} · детали ${s.enrichProcessed}.`,
  importPortal: "Backfill портала",
  importPortalHint:
    "Редкий backfill: CSV/HTML из «Завершённые» / «Отправлено», если Sync что-то пропустил. Обычно хватает Sync + ежедневного cron.",
  importAction: "Импортировать",
  importFile: "Загрузить CSV (Registrul FF)",
  importOr: "или вставьте HTML ниже",
  importing: "Импорт…",
  importOk: (c, u) => `Импорт: добавлено ${c}, обновлено ${u}.`,
  fiscalCount: (n) => `${n} фактур`,
  filterAllStatuses: "Все статусы",
  filterStatusSigned: "Подписана",
  filterStatusAwaiting: "Ожидает подписи",
  filterAllPayments: "Все (оплата)",
  filterPaymentTerminal: "Терминал / кэш",
  filterPaymentTransfer: "Перевод",
  filterPaymentUnpaid: "Не оплачено",
  filterReset: "Сбросить",
  detailInfo: "Реквизиты",
  detailLines: "Товары и услуги",
  detailPayments: "Платежи",
  fieldSupplier: "Поставщик",
  fieldBuyer: "Покупатель",
  fieldIssueDate: "Дата выдачи",
  fieldTotal: "Всего",
  fieldVat: "НДС",
  fieldNet: "Без НДС",
  fieldPaymentStatus: "Статус оплаты",
  fieldLinkedInvoice: "Связанный счёт",
  fieldLastSynced: "Синхронизировано",
  colName: "Наименование",
  colQty: "Кол-во",
  colUnit: "Ед.",
  colUnitPrice: "Цена за ед.",
  colNet: "Без НДС",
  colVatRate: "НДС %",
  colLineTotal: "Сумма",
  loadDetails: "Загрузить детали из e-Factura",
  loadingDetails: "Загрузка…",
  linesUnavailable: "Строки недоступны. Загрузите детали из e-Factura.",
  noPayments: "Нет привязанных платежей.",
  detailsLoaded: "Детали загружены из e-Factura.",
  close: "Закрыть",
  suppliersTitle: "Поставщики / Оплаты",
  suppliersSubtitle: "Исходящие платежи из банковских выписок, сгруппированные по компаниям.",
  suppliersEmpty: "Поставщики не найдены.",
  kindTransfers: "Переводы поставщикам",
  kindCommissions: "Банковские комиссии",
  kindAll: "Все",
  colSupplier: "Поставщик",
  colPaymentsCount: "Платежей",
  colTotalPaid: "Всего оплачено",
  colLastPayment: "Последняя оплата",
  colFirstPayment: "Первая оплата",
  totalPaidLabel: "Всего оплачено",
  paymentsTitle: "Платежи",
  colDoc: "Документ",
  suppliersCount: (n) => `${n} поставщиков`,
  tabSeller: "Я Продавец",
  tabBuyer: "Я Покупатель",
  actionFail: "Операция не удалась.",
};

const EN: ReconLabels = {
  title: "Payment reconciliation",
  subtitle: "Upload the bank statement and match incoming payments to invoices.",
  tabQueue: "Queue",
  tabLedger: "Ledger",
  tabDebtors: "Debtors",
  upload: "Upload statement (CSV)",
  uploadCard: "Upload card statement (CSV)",
  uploadExtras: "Upload extras (TXT)",
  uploading: "Uploading...",
  uploadHint: "Supported format: MAIB statement (.csv)",
  autoMatch: "Auto-match",
  autoMatchRunning: "Matching...",
  statements: "Statements",
  noStatements: "No statements uploaded.",
  period: "Period",
  rows: "rows",
  uploaded: "Uploaded",
  queueEmpty: "No incoming payments to review.",
  colDate: "Date",
  colPayer: "Payer",
  colPurpose: "Purpose",
  colAmount: "Amount",
  colSuggestion: "Suggestion",
  colActions: "Actions",
  confirm: "Confirm",
  ignore: "Ignore",
  restoreToQueue: "Restore to queue",
  unmatch: "Unmatch",
  matched: "Matched",
  ignored: "Ignored",
  filterAllDirections: "All (direction)",
  filterCredits: "Credits",
  filterDebits: "Debits",
  colMatchStatus: "Status",
  colStatement: "Statement",
  directionCredit: "Credit",
  directionDebit: "Debit",
  statusUnmatched: "Unmatched",
  statusSuggested: "Suggested",
  statusMatched: "Matched",
  statusIgnored: "Ignored / operational",
  statusHistorical: "Old FF",
  statusActSettled: "Settled by act (=0)",
  ledgerEmpty: "No transactions for the selected filters.",
  noSuggestion: "No suggestion",
  confidence: "confidence",
  overpaid: "Overpaid",
  remainderToAllocate: "Remainder to allocate",
  allocateRemainder: "Allocate remainder",
  remainderAllocatedOk: (amount) => `Remainder allocated: ${amount}.`,
  perPage: "Per page",
  pageOf: (p, t) => `${p} of ${t}`,
  tabAct: "Reconciliation act",
  tabStatements: "Statements",
  selectClient: "Select a client",
  searchClient: "Search by name or fiscal code...",
  allClients: "All clients",
  actEmpty: "Select a client to view the act.",
  colDebit: "Debit",
  colCredit: "Credit",
  colBalance: "Balance",
  colDirection: "Type",
  dirIn: "Incoming",
  dirOut: "Outgoing",
  rowPayment: "Payment",
  download: "Download PDF",
  downloadPdf: "Download PDF",
  actSearchPlaceholder: "Search invoice, amount, purpose...",
  actFilterEmpty: "No entries match the filter.",
  actFilterAll: "All",
  actFilterInvoices: "Invoices",
  actFilterPayments: "Payments",
  downloadingPdf: "Downloading...",
  downloadPdfFail: "Could not download the PDF.",
  colFile: "File",
  colUploadedBy: "Uploaded by",
  colTransactions: "Transactions",
  viewTransactions: "View transactions",
  statementsEmpty: "No statements uploaded.",
  actTotalInvoiced: "Total invoiced",
  actTotalPaid: "Total paid",
  actBalance: "Balance due",
  debtorsTitle: "Debtor balances",
  debtorsEmpty: "No debtors. All invoices are paid.",
  colClient: "Client",
  colIdno: "Fiscal code",
  colOpenInvoices: "Open invoices",
  colOutstanding: "Outstanding",
  colOldestDue: "Due date",
  overdue: "Overdue",
  overdueDays: (d) => `Overdue by ${d} days`,
  totalOutstanding: "Total receivable",
  act: "Reconciliation act",
  settlePos: "Close",
  settlePosTitle: "Close with cash / card",
  settlePosHint:
    "Mark selected invoices as paid at POS. Receipt photo is required.",
  settlePosCash: "Cash",
  settlePosCard: "Card",
  settlePosSelectInvoices: "Open invoices",
  settlePosPhoto: "Receipt photo",
  settlePosPhotoHint: "JPG, PNG, or WEBP",
  settlePosNote: "Note (optional)",
  settlePosConfirm: "Close",
  settlePosCancel: "Cancel",
  settlePosOk: (n, amount) => `Closed ${n} invoices · ${amount}.`,
  settlePosNoOpen: "No open invoices for this client.",
  receiptPhoto: "Receipt",
  sortByDue: "Sort by due date",
  cardReceivable: "Receivable",
  cardCredit: "Overpaid / no invoice",
  cardOverdue: "Overdue",
  cardNet: "Net balance",
  sectionDebtors: "They owe us",
  sectionCreditors: "Overpaid / no invoice",
  agingTitle: "Overdue aging",
  agingCurrent: "Current",
  aging1_15: "1–15 days",
  aging16_30: "16–30 days",
  aging30plus: "30+ days",
  colCreditAmount: "Overpayment",
  creditHint: "Paid more than invoiced — a fiscal invoice may be missing",
  creditorsEmpty: "No overpayments.",
  sectionOperational: "Operational",
  operationalHint:
    "Terminal/bank money — fiscal receipts already issued, no invoice needed",
  colReceived: "Received",
  markNotClient: "Not a client",
  unmarkClient: "Restore",
  operationalEmpty: "No operational entries.",
  operationalTotalLabel: "Operational total",
  fiscalTitle: "Fiscal invoices (e-Factura)",
  fiscalSubtitle: "Fiscal invoices synced from the e-Factura service.",
  sync: "Sync",
  syncing: "Syncing...",
  enrichDetails: "Load details (B/f)",
  enriching: "Loading details...",
  enrichRemaining: (n) => `Remaining to load: ${n}`,
  enrichDone: (s) => `Done. Settled by receipt: ${s}`,
  paidByReceipt: "Paid (terminal / cash)",
  rowReceipt: "Fiscal receipt",
  rowPaperInvoice: "Paper FF",
  rowHistoricalInvoice: "Old FF",
  paperFiscalNote: "outside e-Factura",
  nonLivrare: "Non-livrare",
  nonLivrareHint: "Not a delivery invoice — excluded from reconciliation",
  live: "Connected",
  mock: "Demo (mock)",
  search: "Search...",
  fiscalEmpty: "No fiscal invoices. Press Sync.",
  colNumber: "Number",
  colStatus: "Status",
  colBuyer: "Buyer",
  colLinked: "Linked invoice",
  colPayment: "Payment",
  paid: "Paid (transfer)",
  unpaid: "Unpaid",
  notLinked: "Not linked",
  uploadOk: (n) => `Imported ${n} transactions.`,
  uploadFail: "Upload failed.",
  autoMatchOk: (a, s, act, rem) => {
    const parts = [`Auto-match: applied ${a} of ${s}`];
    if (act && act > 0) parts.push(`${act} closed by act`);
    if (rem && rem > 0) parts.push(`${rem} remainders allocated`);
    return `${parts.join("; ")}.`;
  },
  pulledFiscal: (n) => `Pulled ${n} new invoices from e-Factura.`,
  syncOk: (s) =>
    `Sync OK: API ${s.accepted} · search ${s.searched} · archive +${s.archiveCreated} (of ${s.archiveListed}) · statuses ${s.statusUpdated}${s.markedDead ? ` (${s.markedDead} rejected/cancelled)` : ""} · details ${s.enrichProcessed}.`,
  importPortal: "Portal backfill",
  importPortalHint:
    "Rare backfill: CSV/HTML from «Completed» / «Sent» if Sync missed something. Normally Sync + daily cron is enough.",
  importAction: "Import",
  importFile: "Upload CSV (Registrul FF)",
  importOr: "or paste HTML below",
  importing: "Importing…",
  importOk: (c, u) => `Imported: ${c} added, ${u} updated.`,
  fiscalCount: (n) => `${n} invoices`,
  filterAllStatuses: "All statuses",
  filterStatusSigned: "Signed",
  filterStatusAwaiting: "Awaiting signature",
  filterAllPayments: "All (payment)",
  filterPaymentTerminal: "Terminal / cash",
  filterPaymentTransfer: "Transfer",
  filterPaymentUnpaid: "Unpaid",
  filterReset: "Reset",
  detailInfo: "Details",
  detailLines: "Goods & services",
  detailPayments: "Payments",
  fieldSupplier: "Supplier",
  fieldBuyer: "Buyer",
  fieldIssueDate: "Issue date",
  fieldTotal: "Total",
  fieldVat: "VAT",
  fieldNet: "Net",
  fieldPaymentStatus: "Payment status",
  fieldLinkedInvoice: "Linked invoice",
  fieldLastSynced: "Synced",
  colName: "Name",
  colQty: "Qty",
  colUnit: "Unit",
  colUnitPrice: "Unit price",
  colNet: "Net",
  colVatRate: "VAT %",
  colLineTotal: "Total",
  loadDetails: "Load details from e-Factura",
  loadingDetails: "Loading…",
  linesUnavailable: "Line items unavailable. Load details from e-Factura.",
  noPayments: "No payments allocated.",
  detailsLoaded: "Details loaded from e-Factura.",
  close: "Close",
  suppliersTitle: "Suppliers / Payments",
  suppliersSubtitle: "Outgoing payments from bank statements, grouped by company.",
  suppliersEmpty: "No suppliers found.",
  kindTransfers: "Supplier transfers",
  kindCommissions: "Bank fees",
  kindAll: "All",
  colSupplier: "Supplier",
  colPaymentsCount: "Payments",
  colTotalPaid: "Total paid",
  colLastPayment: "Last payment",
  colFirstPayment: "First payment",
  totalPaidLabel: "Total paid",
  paymentsTitle: "Payments",
  colDoc: "Document",
  suppliersCount: (n) => `${n} suppliers`,
  tabSeller: "I'm the seller",
  tabBuyer: "I'm the buyer",
  actionFail: "Action failed.",
};

export function getReconLabels(locale: Locale): ReconLabels {
  if (locale === "ru") return RU;
  if (locale === "en") return EN;
  return RO;
}

const FISCAL_BUCKET_LABELS: Record<
  FiscalStatusBucket,
  Record<Locale, string>
> = {
  draft: { ro: "Ciornă", ru: "Черновик", en: "Draft" },
  signed: { ro: "Semnată", ru: "Подписана", en: "Signed" },
  awaiting_signature: {
    ro: "Așteaptă semnătura",
    ru: "Ожидает подписи",
    en: "Awaiting signature",
  },
  rejected: { ro: "Respinsă", ru: "Отклонена", en: "Rejected" },
  cancelled: { ro: "Anulată", ru: "Аннулирована", en: "Cancelled" },
};

/** Filter keys for the sales list (no draft). */
export { FISCAL_STATUS_FILTER_BUCKETS as EFACTURA_STATUS_FILTER_BUCKETS };

export function eFacturaStatusBucketLabel(
  bucket: FiscalStatusBucket,
  locale: Locale,
): string {
  return FISCAL_BUCKET_LABELS[bucket][locale];
}

/** Collapsed label: signed vs awaiting signature (dead statuses if present). */
export function eFacturaStatusLabel(status: number, locale: Locale): string {
  const bucket = fiscalStatusBucket(status);
  if (bucket === "unknown") return String(status);
  return FISCAL_BUCKET_LABELS[bucket][locale];
}

export function formatMoney(value: string | null, currency: string, locale: Locale): string {
  if (value == null) return "—";
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return value;
  const tag = locale === "ru" ? "ru-RU" : locale === "en" ? "en-US" : "ro-RO";
  return `${n.toLocaleString(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}
