import type { LayoutIssueDictionary } from "./types";

function plural(n: number, forms: readonly [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const i = m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2;
  return forms[i]!;
}

export const layoutIssueRu: LayoutIssueDictionary = {
  reasons: {
    fileCorrupt: "Файл не открывается / повреждён",
    wrongFormat: "Неверный формат файла",
    lowQuality: "Низкое качество изображения",
    missingPages: "Не хватает страниц",
    wrongSize: "Неверный размер",
    other: "Другое",
  },
  waitFor: (unit, value) => (unit === "m" ? `${value} мин` : unit === "h" ? `${value} ч` : `${value} дн`),

  flagButton: "Нужен макет",
  flagButtonHint: (lineCode) =>
    `Файл позиции ${lineCode} не годится: позиция встанет на паузу, остальные позиции заказа идут дальше`,
  modalTitle: (lineCode) => `Нужен новый макет · ${lineCode}`,
  modalHint:
    "Позиция встанет на паузу и не попадёт в печать. Остальные позиции заказа идут дальше. Клиент (или студия) увидит причину и ваш комментарий.",
  reasonLabel: "Что не так",
  noteLabel: "Комментарий (необязательно)",
  notePlaceholder: "Например: фото 72 dpi, нужно не меньше 300 dpi",
  confirm: "Отметить «Нужен макет»",
  cancel: "Отмена",
  flagFailed: "Не удалось отметить позицию",
  clear: "Снять отметку",
  clearConfirm: (lineCode) => `Снять отметку «Нужен макет» с позиции ${lineCode}?`,
  clearConfirmHint: "Позиция вернётся в «Ждёт» со старым файлом.",
  clearFailed: "Не удалось снять отметку",
  waitingLabel: "Ждёт макет",
  waitingFor: (wait) => `ждёт ${wait}`,
  fixedAt: (time) => `✓ Макет исправлен ${time}`,
  heldHint: "Ждёт новый файл — не попадает ни в одну раскладку и печать",
  sheetDownloadHeld: "Позиция ждёт новый макет",
  heldInLayout: (count) => `${count} поз. ждут макет — не в раскладке`,

  adminBanner: (count) =>
    `${count} ${plural(count, ["заказ ждёт", "заказа ждут", "заказов ждут"])} нового макета →`,
  adminBannerHint: "Показать только эти заказы",
  adminFilter: "Нужен макет",
  adminRowLabel: (count) => (count === 1 ? "Нужен макет" : `Нужен макет: ${count} поз.`),
  adminNavBadgeTitle: (count) =>
    `${count} ${plural(count, ["заказ ждёт", "заказа ждут", "заказов ждут"])} нового макета`,
  staffReplaceHint: "Замените файл этой позиции — после сохранения она вернётся в «Ждёт».",
  staffReplaceButton: "Заменить файл",
  staffReplaceDialogHint:
    "Загрузите исправленный файл или вставьте ссылку. Старый файл уйдёт в архив; цена, количество и склад не меняются.",
  staffReplaceLinkNoCheck: "Размер по ссылке не проверяется — проверьте файл перед печатью.",
  staffReplaceLinkNotAllowed: "Для этой продукции нужен сам файл — ссылка не подойдёт.",
  staffReplaceDone: "Файл заменён — позиция снова ждёт печати",

  historyFlagged: (lineCode, reason, note) =>
    `Позиция ${lineCode}: нужен макет — ${reason}${note ? ` («${note}»)` : ""}`,
  historyCleared: (lineCode) => `Позиция ${lineCode}: отметка «Нужен макет» снята`,
  historyFixed: (lineCode, byClient) =>
    `Позиция ${lineCode}: макет исправлен ${byClient ? "клиентом" : "студией"}, позиция снова ждёт печати`,

  cabinetBannerOne: (orderNumber) => `Заказ #${orderNumber} ждёт вашего исправления: нужен новый макет →`,
  cabinetBannerMany: (count) =>
    `${count} ${plural(count, ["заказ ждёт", "заказа ждут", "заказов ждут"])} вашего исправления →`,
  cabinetBannerHint: "Пока файл не заменён, эта позиция не печатается. Чем раньше замените — тем раньше получите заказ.",
  cabinetMenuBadgeTitle: (count) =>
    `${count} ${plural(count, ["заказ ждёт", "заказа ждут", "заказов ждут"])} нового макета`,
  cabinetRowLabel: "Нужен новый макет",
  cabinetFilter: "Нужен новый макет",
  cabinetLineTitle: "Нужен новый макет",
  cabinetReason: "Причина",
  cabinetWorkshopComment: "Комментарий цеха",
  cabinetOldFile: "Текущий файл",
  cabinetPaused: (wait) => `Заказ стоит на паузе, пока вы не исправите · ждёт ${wait}`,
  cabinetOtherLinesInWork: "Остальные позиции заказа уже в работе.",
  cabinetOtherLinesQueued: "Остальные позиции заказа идут дальше по очереди.",
  replaceButton: "Заменить файл",
  replaceTitle: (lineCode) => `Новый файл для позиции ${lineCode}`,
  replaceHint: "Загрузите исправленный файл. Цена и количество не меняются.",
  replacePick: "Выбрать файл",
  replaceChange: "Выбрать другой",
  replaceUploading: "Загрузка…",
  replaceSaving: "Сохранение…",
  replaceConfirm: "Сохранить новый файл",
  replaceCancel: "Отмена",
  replaceDone: "Файл заменён — позиция снова в очереди цеха",
  replaceFailed: "Не удалось заменить файл. Попробуйте ещё раз.",
  replaceUploadFailed: "Не удалось загрузить файл",
  replaceTooLarge: "Макет больше заказанного размера — уменьшите его или напишите студии",
  replaceNotFlagged: "Эта позиция уже не ждёт макет — обновите страницу",
  cabinetFixedNotice: (time) => `✓ Новый макет получен ${time} — позиция снова в очереди`,
  orderStatusKept: (codes, status) =>
    `${codes.length === 1 ? `Позиция ${codes[0]} ждёт` : `Позиции ${codes.join(", ")} ждут`} макет — статус заказа: ${status}`,
  orderStatusBlocked: (codes) =>
    `${codes.length === 1 ? `Позиция ${codes[0]} ждёт` : `Позиции ${codes.join(", ")} ждут`} макет — сначала замените файл или снимите отметку`,
};
