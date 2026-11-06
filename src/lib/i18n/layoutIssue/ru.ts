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

  flagButton: "Проблема с файлом…",
  flagButtonHint: (lineCode) =>
    `Файл позиции ${lineCode} не годится: позиция встанет на паузу, остальные позиции заказа идут дальше`,
  moreActions: "Ещё действия",
  modalTitle: (lineCode) => `Проблема с файлом · ${lineCode}`,
  modalHint:
    "Позиция встанет на паузу и не попадёт в печать. Остальные позиции заказа идут дальше. Клиент (или студия) увидит причину и ваш комментарий.",
  reasonLabel: "Что не так",
  noteLabel: "Комментарий (необязательно)",
  notePlaceholder: "Например: фото 72 dpi, нужно не меньше 300 dpi",
  confirm: "Отметить: ждёт файл",
  cancel: "Отмена",
  flagFailed: "Не удалось отметить позицию",
  clear: "Снять отметку",
  clearConfirm: (lineCode) => `Снять отметку «Ждёт файл» с позиции ${lineCode}?`,
  clearConfirmHint: "Позиция вернётся в «Ждёт» со старым файлом.",
  clearFailed: "Не удалось снять отметку",
  waitingLabel: "Ждёт файл",
  waitingFor: (wait) => `ждёт ${wait}`,
  fixedAt: (time) => `✓ Новый файл получен ${time}`,
  heldHint: "Ждёт новый файл — не попадает ни в одну раскладку и печать",
  sheetDownloadHeld: "Позиция ждёт новый файл",
  heldInLayout: (count) => `${count} поз. ждут файл — не в раскладке`,

  adminBanner: (count) =>
    `${count} ${plural(count, ["заказ ждёт", "заказа ждут", "заказов ждут"])} файл →`,
  adminBannerHint: "Показать только эти заказы",
  adminFilter: "Ждёт файл",
  adminRowLabel: (count) => (count === 1 ? "Ждёт файл" : `Ждут файл: ${count} поз.`),
  adminNavBadgeTitle: (count) =>
    `${count} ${plural(count, ["заказ ждёт", "заказа ждут", "заказов ждут"])} файл`,
  staffReplaceHint: "Замените файл этой позиции — после сохранения она вернётся в «Ждёт».",
  staffReplaceButton: "Заменить файл",
  staffReplaceDialogHint:
    "Загрузите исправленный файл или вставьте ссылку. Старый файл уйдёт в архив; цена, количество и склад не меняются.",
  staffReplaceLinkNoCheck: "Размер по ссылке не проверяется — проверьте файл перед печатью.",
  staffReplaceLinkNotAllowed: "Для этой продукции нужен сам файл — ссылка не подойдёт.",
  staffReplaceDone: "Файл заменён — позиция снова ждёт печати",

  historyFlagged: (lineCode, reason, note) =>
    `Позиция ${lineCode}: проблема с файлом — ${reason}${note ? ` («${note}»)` : ""}`,
  historyCleared: (lineCode) => `Позиция ${lineCode}: отметка «Ждёт файл» снята`,
  historyFixed: (lineCode, byClient) =>
    `Позиция ${lineCode}: файл заменён ${byClient ? "клиентом" : "студией"}, позиция снова ждёт печати`,

  cabinetBannerOne: (orderNumber) => `Заказ #${orderNumber}: цех просит заменить файл →`,
  cabinetBannerMany: (count) =>
    `${count} ${plural(count, ["заказ ждёт", "заказа ждут", "заказов ждут"])} замены файла →`,
  cabinetBannerHint: "Пока файл не заменён, эта позиция не печатается. Чем раньше замените — тем раньше получите заказ.",
  cabinetMenuBadgeTitle: (count) =>
    `${count} ${plural(count, ["заказ ждёт", "заказа ждут", "заказов ждут"])} замены файла`,
  cabinetRowLabel: "Цех просит заменить файл",
  cabinetFilter: "Цех просит заменить файл",
  cabinetLineTitle: "Цех просит заменить файл",
  cabinetReason: "Причина",
  cabinetWorkshopComment: "Комментарий цеха",
  cabinetOldFile: "Текущий файл",
  cabinetPaused: (wait) => `Позиция на паузе, пока файл не заменён · ждёт ${wait}`,
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
  replaceNotFlagged: "Эта позиция уже не ждёт файл — обновите страницу",
  cabinetFixedNotice: (time) => `✓ Новый файл получен ${time} — позиция снова в очереди`,
  orderStatusKept: (codes, status) =>
    `${codes.length === 1 ? `Позиция ${codes[0]} ждёт` : `Позиции ${codes.join(", ")} ждут`} файл — статус заказа: ${status}`,
  orderStatusBlocked: (codes) =>
    `${codes.length === 1 ? `Позиция ${codes[0]} ждёт` : `Позиции ${codes.join(", ")} ждут`} файл — сначала замените файл или снимите отметку`,

  linePill: { waiting: "Ждёт", printing: "Печатается", done: "Готово", needsLayout: "Ждёт файл" },
  linesDoneSummary: (done, total) => `Готово ${done} из ${total}`,
  ownerReplaceButton: "Заменить файл",
  ownerReplaceTitle: (lineCode) => `Заменить файл позиции ${lineCode}`,
  ownerReplaceHint:
    "Позиция ещё не в работе — можно загрузить другой файл. Старый уйдёт в архив; цена, количество и склад не меняются.",
  ownerReplaceDone: "Файл заменён — цех получит новый",
  ownerReplaceStarted: "Цех уже начал печатать эту позицию — файл больше не изменить. Напишите цеху в чат.",
  ownerReplaceLocked: "Этот заказ уже нельзя изменить из кабинета. Напишите цеху в чат.",
  lineInWorkHint: "Уже в работе — файл не изменить",
  cabinetOwnerReplacedNotice: (time) => `Файл заменён ${time}`,
  ownerReplacedAt: (byDealer, time) => `Файл заменён ${byDealer ? "дилером" : "клиентом"} ${time}`,
  historyOwnerReplaced: (lineCode, byDealer) =>
    `Позиция ${lineCode}: файл заменён ${byDealer ? "дилером" : "клиентом"} до начала печати`,
  lockedWaitingFilesHint:
    "Файлы позиций, которые ещё ждут печати, можно заменить — кнопка «Заменить» у файла.",
  replaceFileButton: "Заменить",
  replaceFileTarget: (fileName) => `Заменяем файл: ${fileName}`,
  replacePickFileHint: "Нажмите «Заменить» у файла, который нужно исправить — остальные файлы останутся как есть.",
  replaceFileGone: "Этот файл уже заменён или удалён — обновили заказ, выберите файл ещё раз.",
  staffReplacePickFile: "Какой файл заменить?",
  staffReplacePickFileRequired: "Выберите файл, который заменяете",
  historyFixedFile: (lineCode, byClient, oldName, newName) =>
    `Позиция ${lineCode}: файл ${oldName} заменён на ${newName} ${byClient ? "клиентом" : "студией"}, позиция снова ждёт печати`,
  historyOwnerReplacedFile: (lineCode, byDealer, oldName, newName) =>
    `Позиция ${lineCode}: файл ${oldName} заменён на ${newName} ${byDealer ? "дилером" : "клиентом"} до начала печати`,
};
