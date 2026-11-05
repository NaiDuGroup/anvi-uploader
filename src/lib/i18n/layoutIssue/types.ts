import type { LayoutIssueReason } from "@/lib/layoutIssue";

/** «Нужен макет» on an order line (step 3): workshop board, studio orders, cabinet. */
export interface LayoutIssueDictionary {
  /** Reason labels (the order-level ISSUE reasons + «Неверный размер»). */
  reasons: Record<LayoutIssueReason, string>;
  /** Waiting time: «12 мин» / «3 ч» / «2 дн». */
  waitFor: (unit: "m" | "h" | "d", value: number) => string;

  // ─── Workshop board / staff ───────────────────────────────────────────────
  /** Board line button: «⚠ Нужен макет». */
  flagButton: string;
  flagButtonHint: (lineCode: string) => string;
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
  clearConfirm: (lineCode: string) => string;
  clearFailed: string;
  /** Board line label: «Ждёт макет». */
  waitingLabel: string;
  /** «ждёт 3 ч». */
  waitingFor: (wait: string) => string;
  /** «✓ Макет исправлен 14:20». */
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
  /** «Изменить файл» link on the flagged line (opens the order editor). */
  staffReplaceButton: string;

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
  cabinetOtherLinesGo: string;
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
}
