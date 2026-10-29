import type {
  ImportCostKind,
  ImportDocumentKind,
  ImportPostingMode,
  ImportStatus,
  RequiredImportDocument,
} from "@/lib/imports/constants";

/** «Склад → Импорт»: list, import card, documents, costs, lines, posting. */
export interface ImportsDictionary {
  hubSection: string;
  hubTitle: string;
  hubHint: string;
  title: string;
  subtitle: string;
  newImport: string;
  empty: string;
  loading: string;
  loadFailed: string;
  back: string;
  cols: { date: string; supplier: string; order: string; goods: string; costs: string; status: string; documents: string; archive: string };
  archive: { download: string; blocked: string };
  statuses: Record<ImportStatus, string>;
  postedModes: Record<ImportPostingMode, string>;
  missing: (list: string) => string;
  allDocuments: string;
  provisional: string;
  docKinds: Record<ImportDocumentKind, string>;
  requiredDocs: Record<RequiredImportDocument, string>;
  costKinds: Record<ImportCostKind, string>;
  header: {
    title: string;
    supplierName: string;
    supplierOrderNo: string;
    proformaNo: string;
    brokerName: string;
    declarationNo: string;
    trackingNo: string;
    currency: string;
    orderedAt: string;
    arrivedAt: string;
    status: string;
    save: string;
    saving: string;
    saved: string;
    create: string;
    delete: string;
    confirmDelete: string;
  };
  notes: { title: string; placeholder: string; related: string; relatedNone: string };
  docs: {
    title: string;
    upload: string;
    uploading: string;
    kind: string;
    open: string;
    download: string;
    remove: string;
    confirmRemove: (name: string) => string;
    empty: string;
    missingTitle: string;
    readLines: string;
    tooLarge: string;
  };
  costs: {
    title: string;
    add: string;
    kind: string;
    amount: string;
    provisional: string;
    provisionalHint: string;
    excluded: string;
    excludedHint: string;
    note: string;
    remove: string;
    total: string;
    purchase: string;
    perCurrency: (currency: string) => string;
    empty: string;
  };
  lines: {
    title: string;
    empty: string;
    reading: string;
    readResult: (lines: number, matched: number) => string;
    warnings: string;
    photo: string;
    code: string;
    description: string;
    qty: string;
    price: (currency: string) => string;
    amount: (currency: string) => string;
    item: string;
    purchaseUnit: string;
    landedUnit: string;
    landedTotal: string;
    x2: string;
    x25: string;
    link: string;
    change: string;
    unlink: string;
    skip: string;
    skipped: string;
    search: string;
    nothingFound: string;
    createItem: string;
    category: string;
    name: string;
    create: string;
    withPhoto: string;
    cancel: string;
    notLinked: (n: number) => string;
    total: string;
    onStock: (qty: string) => string;
  };
  models: {
    open: (n: number) => string;
    title: string;
    hint: string;
    loading: string;
    empty: string;
    selectAll: string;
    colItem: string;
    colCategory: string;
    colName: string;
    colPrint: string;
    pieces: (n: number) => string;
    sizes: (n: number) => string;
    chooseCategory: string;
    noSublimation: string;
    printEmpty: string;
    createSelected: (n: number) => string;
    creating: string;
    created: (n: number) => string;
    failed: string;
    errors: Record<"sku_taken" | "line_already_linked" | "create_failed", string>;
    close: string;
  };
  post: {
    title: string;
    normal: string;
    normalHint: string;
    historical: string;
    historicalHint: string;
    post: string;
    repost: string;
    unpost: string;
    confirmPost: (mode: string) => string;
    confirmUnpost: string;
    posted: (mode: string, date: string) => string;
    provisionalNote: string;
    changedAfterPost: string;
  };
  errors: Record<string, string>;
  report: {
    button: string;
    title: string;
    proforma: string;
    arrivedAt: string;
    excluded: string;
    provisional: string;
    totalCosts: string;
    goodsAmount: string;
    /** Label of the «purchase / landed MDL per 1 unit of currency» box. */
    rate: (currency: string) => string;
    cols: {
      photo: string;
      code: string;
      description: string;
      qty: string;
      purchaseUnit: string;
      purchaseTotal: string;
      landedUnit: string;
      landedTotal: string;
      sell: string;
      dealer: string;
    };
    skipped: string;
    total: string;
    positions: (n: number) => string;
    method: string;
    excludedNote: (list: string) => string;
    provisionalNote: string;
    page: (n: number, total: number) => string;
  };
  errorFallback: string;
}
