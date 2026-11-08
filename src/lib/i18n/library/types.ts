/** Error codes the library API returns (`{ error, code }`); the UI shows these texts. */
export type LibraryErrorCode =
  | "file_not_found"
  | "is_link"
  | "source_missing"
  | "client_not_found"
  | "already_in_library"
  | "archived_in_library"
  | "not_found"
  | "invalid"
  | "forbidden"
  | "no_files"
  | "save_failed"
  | "delete_failed"
  | "copy_failed";

/** «Библиотека макетов»: page, dialogs, wizard picker, «Повторить заказ», order-file badges. */
export interface LibraryDictionary {
  // ─── Page ────────────────────────────────────────────────────────────────
  pageTitle: string;
  pageIntro: string;
  archiveToggle: string;
  searchPlaceholder: string;
  searchAria: string;
  clearSearch: string;
  filterAll: string;
  filterCommon: string;
  filterClient: string;
  pickClientFirst: string;
  found: (n: number) => string;
  emptyArchive: string;
  emptySearch: string;
  emptyCommon: string;
  emptyClient: string;
  emptyAll: string;
  showMore: string;
  openFile: string;
  download: string;
  edit: string;
  archive: string;
  restore: string;
  deleteForever: string;
  /** Owner chip of a studio-wide item. */
  common: string;
  commonHint: string;
  clientFallback: string;
  /** «ещё не использован» / «использован 3 раза». */
  uses: (n: number) => string;
  /** Short form in the picker: «использован 3×». */
  usesShort: (n: number) => string;
  /** «из заказа #0012». */
  fromOrder: (orderNumber: string) => string;
  noFile: string;
  close: string;
  cancel: string;

  archiveConfirmTitle: string;
  archiveConfirmText: (title: string) => string;
  archiveConfirm: string;
  archivedNotice: (title: string) => string;
  restoredNotice: (title: string) => string;
  deletedNotice: (title: string) => string;
  undo: string;
  deleteConfirmTitle: string;
  deleteConfirmText: (title: string) => string;
  deleteConfirm: string;
  /** Workshop: view, download and save only. */
  readOnlyHint: string;

  // ─── Edit / save dialogs ─────────────────────────────────────────────────
  editTitle: string;
  titleLabel: string;
  tagsLabel: string;
  tagsPlaceholder: string;
  tagsHint: string;
  save: string;
  ownerLegend: string;
  orderClient: string;
  currentClient: string;
  otherClient: string;
  clientLabel: string;
  chooseClient: string;
  saveTitle: string;
  saveAllTitle: (orderNumber: string) => string;
  fileLabel: (fileName: string) => string;
  orderFilesInfo: (n: number) => string;
  savedOne: string;
  savedMany: (n: number) => string;
  skipped: (n: number) => string;
  openLibrary: string;
  done: string;

  // ─── Order files ─────────────────────────────────────────────────────────
  inLibraryBadge: string;
  inLibraryTitle: string;
  saveToLibrary: string;
  saveToLibraryTitle: string;
  saveAllLink: string;
  archivedBadge: string;
  archivedTitle: string;
  restoreFailed: string;

  // ─── Wizard picker ───────────────────────────────────────────────────────
  pickerTitle: string;
  pickerSearch: string;
  pickerAllClients: (hasClient: boolean) => string;
  pickerNothing: string;
  pickerEmpty: string;
  pickerClientSection: (clientName: string | null) => string;
  pickerAll: string;
  pickerCommon: string;
  inOrder: string;
  inOrderTitle: string;
  addedAgain: (title: string) => string;

  // ─── Wizard rows / «Повторить заказ» ─────────────────────────────────────
  fromLibrary: string;
  addFromLibrary: string;
  reuseLibrary: string;
  reuseLink: string;
  reuseStorage: string;
  removeFile: string;
  missingFile: string;
  missingFileGone: string;
  expiredPhotos: (n: number) => string;
  repeatOrder: string;
  repeatLoading: string;
  repeatMissing: string;
  repeatOk: string;
  repeatFilesFailed: string;

  // ─── Hint after «готов / выдан» ──────────────────────────────────────────
  hintTitle: string;
  hintText: (orderNumber: string, n: number) => string;
  hintAction: string;
  hintDismiss: string;

  // ─── File facts ──────────────────────────────────────────────────────────
  meta: {
    /** Number locale («ru-RU», «ro-RO», «en-GB»). */
    numberLocale: string;
    mb: string;
    kb: string;
    cm: string;
    pages: (n: number) => string;
  };

  errors: Record<LibraryErrorCode, string>;
  inUse: (references: number) => string;
  requestFailed: string;
  network: string;
}
