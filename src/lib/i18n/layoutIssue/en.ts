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

  flagButton: "File problem…",
  flagButtonHint: (lineCode) =>
    `The file of item ${lineCode} cannot be printed: the item is paused, the rest of the order goes on`,
  moreActions: "More actions",
  modalTitle: (lineCode) => `File problem · ${lineCode}`,
  modalHint:
    "The item is paused and stays out of print. The other items of the order go on. The client (or the studio) sees the reason and your comment.",
  reasonLabel: "What is wrong",
  noteLabel: "Comment (optional)",
  notePlaceholder: "E.g. the photo is 72 dpi, at least 300 dpi is needed",
  confirm: "Mark: waiting for file",
  cancel: "Cancel",
  flagFailed: "Could not mark the item",
  clear: "Remove mark",
  clearConfirm: (lineCode) => `Remove «Waiting for file» from item ${lineCode}?`,
  clearConfirmHint: "The item goes back to «Waiting» with the old file.",
  clearFailed: "Could not remove the mark",
  waitingLabel: "Waiting for file",
  waitingFor: (wait) => `waiting ${wait}`,
  fixedAt: (time) => `✓ New file received ${time}`,
  heldHint: "Waiting for a new file — not included in any layout or print",
  sheetDownloadHeld: "The item is waiting for a new file",
  heldInLayout: (count) => `${count} item(s) waiting for a file — not laid out`,

  adminBanner: (count) => `${count} ${orders(count)} for a file →`,
  adminBannerHint: "Show only these orders",
  adminFilter: "Waiting for file",
  adminRowLabel: (count) => (count === 1 ? "Waiting for file" : `Waiting for file: ${count} items`),
  adminNavBadgeTitle: (count) => `${count} ${orders(count)} for a file`,
  staffReplaceHint: "Replace this item's file — after saving it goes back to «Waiting».",
  staffReplaceButton: "Replace file",
  staffReplaceDialogHint:
    "Upload the corrected file or paste a link. The old file is archived; price, quantity and stock do not change.",
  staffReplaceLinkNoCheck: "A link is not checked for size — check the file before printing.",
  staffReplaceLinkNotAllowed: "This product needs the file itself — a link will not do.",
  staffReplaceDone: "File replaced — the item is waiting for print again",

  historyFlagged: (lineCode, reason, note) =>
    `Item ${lineCode}: file problem — ${reason}${note ? ` («${note}»)` : ""}`,
  historyCleared: (lineCode) => `Item ${lineCode}: «Waiting for file» mark removed`,
  historyFixed: (lineCode, byClient) =>
    `Item ${lineCode}: file replaced by the ${byClient ? "client" : "studio"}, waiting for print again`,

  cabinetBannerOne: (orderNumber) => `Order #${orderNumber}: the workshop asks to replace the file →`,
  cabinetBannerMany: (count) => `${count} ${orders(count)} for a file replacement →`,
  cabinetBannerHint: "Until the file is replaced, this item is not printed. The sooner you replace it, the sooner you get the order.",
  cabinetMenuBadgeTitle: (count) => `${count} ${orders(count)} for a file replacement`,
  cabinetRowLabel: "Workshop asks to replace the file",
  cabinetFilter: "Workshop asks to replace the file",
  cabinetLineTitle: "Workshop asks to replace the file",
  cabinetReason: "Reason",
  cabinetWorkshopComment: "Workshop comment",
  cabinetOldFile: "Current file",
  cabinetPaused: (wait) => `The item is paused until the file is replaced · waiting ${wait}`,
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
  replaceNotFlagged: "This item is no longer waiting for a file — reload the page",
  cabinetFixedNotice: (time) => `✓ New file received ${time} — the item is back in the queue`,
  orderStatusKept: (codes, status) =>
    `${codes.length === 1 ? `Item ${codes[0]} is` : `Items ${codes.join(", ")} are`} waiting for a file — order status: ${status}`,
  orderStatusBlocked: (codes) =>
    `${codes.length === 1 ? `Item ${codes[0]} is` : `Items ${codes.join(", ")} are`} waiting for a file — replace the file or remove the mark first`,

  linePill: { waiting: "Waiting", printing: "Printing", done: "Done", needsLayout: "Waiting for file" },
  linesDoneSummary: (done, total) => `Done ${done} of ${total}`,
  ownerReplaceButton: "Replace file",
  ownerReplaceTitle: (lineCode) => `Replace the file of item ${lineCode}`,
  ownerReplaceHint:
    "This item is not in work yet — you can upload another file. The old one is archived; price, quantity and stock do not change.",
  ownerReplaceDone: "File replaced — the workshop will get the new one",
  ownerReplaceStarted: "The workshop has already started this item — the file can no longer be changed. Write to the workshop in the chat.",
  ownerReplaceLocked: "This order can no longer be changed from the cabinet. Write to the workshop in the chat.",
  lineInWorkHint: "Already in work — the file cannot be changed",
  cabinetOwnerReplacedNotice: (time) => `File replaced ${time}`,
  ownerReplacedAt: (byDealer, time) => `File replaced by the ${byDealer ? "dealer" : "client"} ${time}`,
  historyOwnerReplaced: (lineCode, byDealer) =>
    `Item ${lineCode}: file replaced by the ${byDealer ? "dealer" : "client"} before printing`,
  lockedWaitingFilesHint:
    "Files of items still waiting to print can be replaced — use «Replace» next to the file.",
  replaceFileButton: "Replace",
  replaceFileTarget: (fileName) => `Replacing file: ${fileName}`,
  replacePickFileHint: "Press «Replace» next to the file that needs fixing — the other files stay as they are.",
  replaceFileGone: "This file was already replaced or removed — the order is refreshed, pick the file again.",
  staffReplacePickFile: "Which file to replace?",
  staffReplacePickFileRequired: "Pick the file you are replacing",
  historyFixedFile: (lineCode, byClient, oldName, newName) =>
    `Item ${lineCode}: file ${oldName} replaced with ${newName} by the ${byClient ? "client" : "studio"}, waiting for print again`,
  historyOwnerReplacedFile: (lineCode, byDealer, oldName, newName) =>
    `Item ${lineCode}: file ${oldName} replaced with ${newName} by the ${byDealer ? "dealer" : "client"} before printing`,
};
