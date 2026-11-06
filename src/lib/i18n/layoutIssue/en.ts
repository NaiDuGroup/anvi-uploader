import type { LayoutIssueDictionary } from "./types";

const orders = (n: number) => (n === 1 ? "order is waiting" : "orders are waiting");

export const layoutIssueEn: LayoutIssueDictionary = {
  reasons: {
    fileCorrupt: "File does not open / is damaged",
    wrongFormat: "Wrong file format",
    lowQuality: "Low image quality",
    missingPages: "Pages are missing",
    wrongSize: "Wrong size",
    other: "Other",
  },
  waitFor: (unit, value) => (unit === "m" ? `${value} min` : unit === "h" ? `${value} h` : `${value} d`),

  flagButton: "Needs layout",
  flagButtonHint: (lineCode) =>
    `The file of item ${lineCode} cannot be printed: the item is paused, the rest of the order goes on`,
  modalTitle: (lineCode) => `New layout needed · ${lineCode}`,
  modalHint:
    "The item is paused and stays out of print. The other items of the order go on. The client (or the studio) sees the reason and your comment.",
  reasonLabel: "What is wrong",
  noteLabel: "Comment (optional)",
  notePlaceholder: "E.g. the photo is 72 dpi, at least 300 dpi is needed",
  confirm: "Mark «Needs layout»",
  cancel: "Cancel",
  flagFailed: "Could not mark the item",
  clear: "Remove mark",
  clearConfirm: (lineCode) => `Remove «Needs layout» from item ${lineCode}?`,
  clearConfirmHint: "The item goes back to «Waiting» with the old file.",
  clearFailed: "Could not remove the mark",
  waitingLabel: "Needs layout",
  waitingFor: (wait) => `waiting ${wait}`,
  fixedAt: (time) => `✓ Layout fixed ${time}`,
  heldHint: "Waiting for a new file — not included in any layout or print",
  sheetDownloadHeld: "The item is waiting for a new layout",
  heldInLayout: (count) => `${count} item(s) waiting for a layout — not laid out`,

  adminBanner: (count) => `${count} ${orders(count)} for a new layout →`,
  adminBannerHint: "Show only these orders",
  adminFilter: "Needs layout",
  adminRowLabel: (count) => (count === 1 ? "Needs layout" : `Needs layout: ${count} items`),
  adminNavBadgeTitle: (count) => `${count} ${orders(count)} for a new layout`,
  staffReplaceHint: "Replace this item's file — after saving it goes back to «Waiting».",
  staffReplaceButton: "Replace file",
  staffReplaceDialogHint:
    "Upload the corrected file or paste a link. The old file is archived; price, quantity and stock do not change.",
  staffReplaceLinkNoCheck: "A link is not checked for size — check the file before printing.",
  staffReplaceLinkNotAllowed: "This product needs the file itself — a link will not do.",
  staffReplaceDone: "File replaced — the item is waiting for print again",

  historyFlagged: (lineCode, reason, note) =>
    `Item ${lineCode}: needs layout — ${reason}${note ? ` («${note}»)` : ""}`,
  historyCleared: (lineCode) => `Item ${lineCode}: «Needs layout» mark removed`,
  historyFixed: (lineCode, byClient) =>
    `Item ${lineCode}: layout fixed by the ${byClient ? "client" : "studio"}, waiting for print again`,

  cabinetBannerOne: (orderNumber) => `Order #${orderNumber} is waiting for your fix: a new layout is needed →`,
  cabinetBannerMany: (count) => `${count} ${orders(count)} for your fix →`,
  cabinetBannerHint: "Until the file is replaced, this item is not printed. The sooner you replace it, the sooner you get the order.",
  cabinetMenuBadgeTitle: (count) => `${count} ${orders(count)} for a new layout`,
  cabinetRowLabel: "New layout needed",
  cabinetFilter: "New layout needed",
  cabinetLineTitle: "New layout needed",
  cabinetReason: "Reason",
  cabinetWorkshopComment: "Workshop comment",
  cabinetOldFile: "Current file",
  cabinetPaused: (wait) => `The order is paused until you fix it · waiting ${wait}`,
  cabinetOtherLinesInWork: "The other items of the order are already in production.",
  cabinetOtherLinesQueued: "The other items of the order move on in the queue.",
  replaceButton: "Replace file",
  replaceTitle: (lineCode) => `New file for item ${lineCode}`,
  replaceHint: "Upload the corrected file. Price and quantity do not change.",
  replacePick: "Choose file",
  replaceChange: "Choose another",
  replaceUploading: "Uploading…",
  replaceSaving: "Saving…",
  replaceConfirm: "Save new file",
  replaceCancel: "Cancel",
  replaceDone: "File replaced — the item is back in the workshop queue",
  replaceFailed: "Could not replace the file. Please try again.",
  replaceUploadFailed: "Could not upload the file",
  replaceTooLarge: "The artwork is larger than the ordered size — reduce it or message the studio",
  replaceNotFlagged: "This item is no longer waiting for a layout — reload the page",
  cabinetFixedNotice: (time) => `✓ New layout received ${time} — the item is back in the queue`,
  orderStatusKept: (codes, status) =>
    `${codes.length === 1 ? `Item ${codes[0]} is` : `Items ${codes.join(", ")} are`} waiting for a layout — order status: ${status}`,
  orderStatusBlocked: (codes) =>
    `${codes.length === 1 ? `Item ${codes[0]} is` : `Items ${codes.join(", ")} are`} waiting for a layout — replace the file or remove the mark first`,
};
