import type { LayoutIssueReason } from "@/lib/layoutIssue";

/** «Проблема с файлом» / «Ждёт файл» (NEEDS_LAYOUT) on an order line (step 3): workshop board, studio orders, cabinet. */
export interface LayoutIssueDictionary {
  /** Reason labels (the order-level ISSUE reasons + «Неверный размер»). */
  reasons: Record<LayoutIssueReason, string>;
  /** Waiting time: «12 мин» / «3 ч» / «2 дн». */
  waitFor: (unit: "m" | "h" | "d", value: number) => string;

  // ─── Workshop board / staff ───────────────────────────────────────────────
  /** «⋯» menu item on a line: «Проблема с файлом…» (opens the modal). */
  flagButton: string;
  flagButtonHint: (lineCode: string) => string;
  /** aria-label / tooltip of the per-line «⋯» menu button: «Ещё действия». */
  moreActions: string;
  modalTitle: (lineCode: string) => string;
  modalHint: string;
  reasonLabel: string;
  noteLabel: string;
  notePlaceholder: string;
  confirm: string;
  cancel: string;
  flagFailed: string;
  /** Board / admin: «Снять отметку». */
  clear: string;
  /** In-page confirm title: «Снять отметку «Ждёт файл» с позиции #N.i/n?». */
  clearConfirm: (lineCode: string) => string;
  /** In-page confirm body: what happens to the line. */
  clearConfirmHint: string;
  clearFailed: string;
  /** Board line label: «Ждёт файл». */
  waitingLabel: string;
  /** «ждёт 3 ч». */
  waitingFor: (wait: string) => string;
  /** «✓ Новый файл получен 14:20». */
  fixedAt: (time: string) => string;
  /** Tooltip / hint: the line is not picked by any production step. */
  heldHint: string;
  /** Business-card «Скачать макет» disabled. */
  sheetDownloadHeld: string;
  /** LF planner / film: «2 поз. ждут макет — не в раскладке». */
  heldInLayout: (count: number) => string;

  // ─── Studio orders page (admin) ───────────────────────────────────────────
  /** Red banner: «3 заказа ждут нового макета →». */
  adminBanner: (count: number) => string;
  adminBannerHint: string;
  /** Filter option «Нужен макет». */
  adminFilter: string;
  /** Order row label «Нужен макет: 1 поз.». */
  adminRowLabel: (count: number) => string;
  /** Nav badge tooltip. */
  adminNavBadgeTitle: (count: number) => string;
  /** Order detail hint on a flagged line: how the staff replace the file. */
  staffReplaceHint: string;
  /** «Заменить файл» on the flagged line (opens the staff replace dialog). */
  staffReplaceButton: string;
  /** Staff replace dialog: under the title. */
  staffReplaceDialogHint: string;
  /** Staff replace dialog: a pasted link is not read for size. */
  staffReplaceLinkNoCheck: string;
  /** Staff replace dialog: this product needs the file itself (sheet / DTF). */
  staffReplaceLinkNotAllowed: string;
  /** Staff replace dialog: toast after saving. */
  staffReplaceDone: string;

  // ─── History (OrderLog) ───────────────────────────────────────────────────
  historyFlagged: (lineCode: string, reason: string, note: string | null) => string;
  historyCleared: (lineCode: string) => string;
  historyFixed: (lineCode: string, byClient: boolean) => string;

  // ─── Cabinet (dealer / client) ────────────────────────────────────────────
  /** Banner, one order: «Заказ #9751 ждёт вашего исправления: нужен новый макет →». */
  cabinetBannerOne: (orderNumber: number) => string;
  /** Banner, several orders: «3 заказа ждут вашего исправления →». */
  cabinetBannerMany: (count: number) => string;
  cabinetBannerHint: string;
  /** Orders menu badge tooltip. */
  cabinetMenuBadgeTitle: (count: number) => string;
  /** List row / status filter: «Нужен новый макет». */
  cabinetRowLabel: string;
  cabinetFilter: string;
  /** Order detail, flagged line. */
  cabinetLineTitle: string;
  cabinetReason: string;
  cabinetWorkshopComment: string;
  cabinetOldFile: string;
  /** «Заказ стоит на паузе, пока вы не исправите · ждёт 3 ч». */
  cabinetPaused: (wait: string) => string;
  /** Another line of the order is printing or printed. */
  cabinetOtherLinesInWork: string;
  /** The other lines all still wait in the queue. */
  cabinetOtherLinesQueued: string;
  replaceButton: string;
  replaceTitle: (lineCode: string) => string;
  replaceHint: string;
  replacePick: string;
  replaceChange: string;
  replaceUploading: string;
  replaceSaving: string;
  replaceConfirm: string;
  replaceCancel: string;
  replaceDone: string;
  replaceFailed: string;
  replaceUploadFailed: string;
  replaceTooLarge: string;
  replaceNotFlagged: string;
  /** Line after the fix: «✓ Новый макет получен 14:20 — позиция снова в очереди». */
  cabinetFixedNotice: (time: string) => string;

  // ─── Order-level status write («Весь заказ», admin status dropdown) ──────
  /** The write kept these lines: «Позиция #9751.1/4 ждёт макет — статус заказа: Печатается в цеху». */
  orderStatusKept: (lineCodes: readonly string[], statusLabel: string) => string;
  /** Refused (409): «Позиция #9751.1/4 ждёт макет — сначала замените файл или снимите отметку». */
  orderStatusBlocked: (lineCodes: readonly string[]) => string;

  // ─── Step 4: per-line status + owner replace on a waiting line ────────────
  /** Cabinet per-position status pill. */
  linePill: { waiting: string; printing: string; done: string; needsLayout: string };
  /** «Готово 1 из 3» next to the order status while positions are mixed. */
  linesDoneSummary: (done: number, total: number) => string;
  /** Small secondary button on a waiting position. */
  ownerReplaceButton: string;
  /** Dialog title on a waiting position (no «нужен новый макет»). */
  ownerReplaceTitle: (lineCode: string) => string;
  ownerReplaceHint: string;
  ownerReplaceDone: string;
  /** 409 line_started: the workshop started the position meanwhile. */
  ownerReplaceStarted: string;
  /** 409 order_locked. */
  ownerReplaceLocked: string;
  /** Muted hint on a printing / done position. */
  lineInWorkHint: string;
  /** Cabinet: «Файл заменён 14:20». */
  cabinetOwnerReplacedNotice: (time: string) => string;
  /** Board / admin list: «Файл заменён дилером 14:20». */
  ownerReplacedAt: (byDealer: boolean, time: string) => string;
  /** History (OrderLog `line_file_replaced`). */
  historyOwnerReplaced: (lineCode: string, byDealer: boolean) => string;
  /** Dealer's locked plaque: the files of waiting positions can still be replaced. */
  lockedWaitingFilesHint: string;
  // ─── Per-file replace (a line with several files) ──────────────────────────
  /** Small «Заменить» button next to one file of a position. */
  replaceFileButton: string;
  /** Dialog line naming the file being replaced. */
  replaceFileTarget: (fileName: string) => string;
  /** Flagged position with several files: press «Заменить» next to the file to fix. */
  replacePickFileHint: string;
  /** 404 file_not_in_line: the file was replaced / removed meanwhile. */
  replaceFileGone: string;
  /** Staff dialog: heading of the file picker. */
  staffReplacePickFile: string;
  /** Staff dialog: no file picked on a line with several files. */
  staffReplacePickFileRequired: string;
  /** History (`line_layout_fixed` naming the file). */
  historyFixedFile: (lineCode: string, byClient: boolean, oldName: string, newName: string) => string;
  /** History (`line_file_replaced` naming the file). */
  historyOwnerReplacedFile: (lineCode: string, byDealer: boolean, oldName: string, newName: string) => string;
}
