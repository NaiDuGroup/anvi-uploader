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
  };
  success: {
    title: string;
    message: string;
    copyLink: string;
    viewStatus: string;
  };
  admin: {
    title: string;
    searchPlaceholder: string;
    noOrders: string;
    loadingOrders: string;
    order: string;
    take: string;
    workshop: string;
    ready: string;
    issue: string;
    filesCount: (count: number) => string;
  };
  statuses: {
    NEW: string;
    IN_PROGRESS: string;
    ASSIGNED: string;
    SENT_TO_WORKSHOP: string;
    WORKSHOP_PRINTING: string;
    READY: string;
    ISSUE: string;
  };
  clientStatuses: {
    inProgress: string;
    ready: string;
  };
  track: {
    title: string;
    errorTitle: string;
  };
}
