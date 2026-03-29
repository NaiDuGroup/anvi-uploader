export type Locale = "ro" | "ru" | "en";

export const LOCALES: Locale[] = ["ro", "ru", "en"];

export const LOCALE_LABELS: Record<Locale, string> = {
  ro: "Română",
  ru: "Русский",
  en: "English",
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  ro: "🇲🇩",
  ru: "🇷🇺",
  en: "🇬🇧",
};

export const DEFAULT_LOCALE: Locale = "ro";

export interface TranslationDictionary {
  common: {
    orderId: string;
    status: string;
    phone: string;
    files: string;
    file: string;
    created: string;
    actions: string;
    refresh: string;
    submit: string;
    submitting: string;
    copied: string;
    loading: string;
    submitted: string;
  };
  upload: {
    title: string;
    subtitle: string;
    dragDrop: string;
    browseFiles: string;
    addMore: string;
    phoneLabel: string;
    phonePlaceholder: string;
    phoneError: string;
    submitOrder: string;
    colorOption: string;
    bwOption: string;
    stepFiles: string;
    stepDetails: string;
    stepConfirm: string;
    next: string;
    back: string;
    paperSize: string;
    paperA0: string;
    paperA1: string;
    paperA2: string;
    paperA3: string;
    paperA4: string;
    paperA5: string;
    paperA6: string;
    paperOther: string;
    notesLabel: string;
    notesPlaceholder: string;
    applyAll: string;
    sameSettings: string;
    differentSettings: string;
    copiesLabel: string;
    gdprTitle: string;
    gdprBody: string;
    gdprConsent: string;
    gdprSubmit: string;
  };
  privacy: {
    bannerText: string;
    learnMore: string;
    modalTitle: string;
    modalBody: string;
    modalClose: string;
    successReminder: string;
  };
  success: {
    title: string;
    message: string;
    copyLink: string;
    viewStatus: string;
  };
  admin: {
    title: string;
    workshopTitle: string;
    searchPlaceholder: string;
    noOrders: string;
    loadingOrders: string;
    order: string;
    take: string;
    workshop: string;
    ready: string;
    issue: string;
    startPrinting: string;
    filesCount: (count: number) => string;
    downloadAll: string;
    takenBy: string;
    specs: string;
    notes: string;
    allSameSettings: string;
    color: string;
    bw: string;
    copies: string;
    paper: string;
    pages: string;
    pagesCount: (n: number) => string;
    issueModalTitle: string;
    issueReasons: {
      fileCorrupt: string;
      wrongFormat: string;
      lowQuality: string;
      missingPages: string;
      other: string;
    };
    issueReasonPlaceholder: string;
    issueConfirm: string;
    returnToWork: string;
    deliver: string;
    received: string;
    comments: string;
    noComments: string;
    commentPlaceholder: string;
    sendComment: string;
    newComments: string;
    loggedInAs: string;
    roleAdmin: string;
    roleWorkshop: string;
    newOrder: string;
    createOrder: string;
    clientName: string;
    clientNamePlaceholder: string;
    clientPhonePlaceholder: string;
    filterAll: string;
    filterMine: string;
    filterWorkshop: string;
    orderCreated: string;
    creatingOrder: string;
    createdByLabel: string;
    editOrder: string;
    deleteOrder: string;
    deleteConfirm: string;
    deleteConfirmText: string;
    cancel: string;
    save: string;
    saving: string;
  };
  statuses: {
    NEW: string;
    IN_PROGRESS: string;
    SENT_TO_WORKSHOP: string;
    WORKSHOP_PRINTING: string;
    WORKSHOP_READY: string;
    RETURNED_TO_STUDIO: string;
    DELIVERED: string;
    ISSUE: string;
  };
  clientStatuses: {
    inProgress: string;
    ready: string;
    issue: string;
  };
  track: {
    title: string;
    errorTitle: string;
    issueMessage: string;
  };
  login: {
    title: string;
    nameLabel: string;
    namePlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    submitButton: string;
    loggingIn: string;
    error: string;
    logout: string;
  };
}
