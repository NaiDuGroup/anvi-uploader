import type { LayoutIssueDictionary } from "./types";

const comenzi = (n: number) => (n === 1 ? "comandă așteaptă" : "comenzi așteaptă");

export const layoutIssueRo: LayoutIssueDictionary = {
  reasons: {
    fileCorrupt: "Fișierul nu se deschide / este deteriorat",
    wrongFormat: "Format de fișier greșit",
    lowQuality: "Calitate slabă a imaginii",
    missingPages: "Lipsesc pagini",
    wrongSize: "Dimensiune greșită",
    other: "Altele",
  },
  waitFor: (unit, value) => (unit === "m" ? `${value} min` : unit === "h" ? `${value} h` : `${value} zile`),

  flagButton: "Problemă cu fișierul…",
  flagButtonHint: (lineCode) =>
    `Fișierul poziției ${lineCode} nu e bun: poziția se pune pe pauză, celelalte poziții ale comenzii merg mai departe`,
  moreActions: "Mai multe acțiuni",
  modalTitle: (lineCode) => `Problemă cu fișierul · ${lineCode}`,
  modalHint:
    "Poziția se pune pe pauză și nu intră la tipar. Celelalte poziții merg mai departe. Clientul (sau studioul) va vedea motivul și comentariul.",
  reasonLabel: "Ce nu e în regulă",
  noteLabel: "Comentariu (opțional)",
  notePlaceholder: "De ex.: foto 72 dpi, e nevoie de minim 300 dpi",
  confirm: "Marchează: așteaptă fișier",
  cancel: "Anulează",
  flagFailed: "Nu s-a putut marca poziția",
  clear: "Scoate marcajul",
  clearConfirm: (lineCode) => `Scoateți marcajul «Așteaptă fișier» de pe poziția ${lineCode}?`,
  clearConfirmHint: "Poziția revine în «Așteaptă» cu fișierul vechi.",
  clearFailed: "Nu s-a putut scoate marcajul",
  waitingLabel: "Așteaptă fișier",
  waitingFor: (wait) => `așteaptă ${wait}`,
  fixedAt: (time) => `✓ Fișier nou primit ${time}`,
  heldHint: "Așteaptă un fișier nou — nu intră în nicio așezare și tipar",
  sheetDownloadHeld: "Poziția așteaptă un fișier nou",
  heldInLayout: (count) => `${count} poz. așteaptă fișier — nu sunt în așezare`,

  adminBanner: (count) => `${count} ${comenzi(count)} fișier →`,
  adminBannerHint: "Arată doar aceste comenzi",
  adminFilter: "Așteaptă fișier",
  adminRowLabel: (count) => (count === 1 ? "Așteaptă fișier" : `Așteaptă fișier: ${count} poz.`),
  adminNavBadgeTitle: (count) => `${count} ${comenzi(count)} fișier`,
  staffReplaceHint: "Înlocuiți fișierul acestei poziții — după salvare revine în «Așteaptă».",
  staffReplaceButton: "Înlocuiește fișierul",
  staffReplaceDialogHint:
    "Încărcați fișierul corectat sau lipiți un link. Fișierul vechi se arhivează; prețul, cantitatea și stocul nu se schimbă.",
  staffReplaceLinkNoCheck: "Dimensiunea nu se verifică pentru un link — verificați fișierul înainte de tipar.",
  staffReplaceLinkNotAllowed: "Pentru acest produs e nevoie de fișierul însuși — un link nu e potrivit.",
  staffReplaceDone: "Fișierul a fost înlocuit — poziția așteaptă din nou tiparul",

  historyFlagged: (lineCode, reason, note) =>
    `Poziția ${lineCode}: problemă cu fișierul — ${reason}${note ? ` («${note}»)` : ""}`,
  historyCleared: (lineCode) => `Poziția ${lineCode}: marcajul «Așteaptă fișier» scos`,
  historyFixed: (lineCode, byClient) =>
    `Poziția ${lineCode}: fișier înlocuit de ${byClient ? "client" : "studio"}, poziția așteaptă din nou tiparul`,

  cabinetBannerOne: (orderNumber) => `Comanda #${orderNumber}: atelierul cere înlocuirea fișierului →`,
  cabinetBannerMany: (count) => `${count} ${comenzi(count)} înlocuirea fișierului →`,
  cabinetBannerHint: "Până nu înlocuiți fișierul, poziția nu se tipărește. Cu cât mai repede, cu atât primiți comanda mai devreme.",
  cabinetMenuBadgeTitle: (count) => `${count} ${comenzi(count)} înlocuirea fișierului`,
  cabinetRowLabel: "Atelierul cere înlocuirea fișierului",
  cabinetFilter: "Atelierul cere înlocuirea fișierului",
  cabinetLineTitle: "Atelierul cere înlocuirea fișierului",
  cabinetReason: "Motiv",
  cabinetWorkshopComment: "Comentariul atelierului",
  cabinetOldFile: "Fișierul actual",
  cabinetPaused: (wait) => `Poziția e pe pauză până se înlocuiește fișierul · așteaptă ${wait}`,
  cabinetOtherLinesInWork: "Celelalte poziții ale comenzii sunt deja în lucru.",
  cabinetOtherLinesQueued: "Celelalte poziții ale comenzii merg mai departe la rând.",
  replaceButton: "Înlocuiește fișierul",
  replaceTitle: (lineCode) => `Fișier nou pentru poziția ${lineCode}`,
  replaceHint: "Încărcați fișierul corectat. Prețul și cantitatea nu se schimbă.",
  replacePick: "Alege fișierul",
  replaceChange: "Alege altul",
  replaceUploading: "Se încarcă…",
  replaceSaving: "Se salvează…",
  replaceConfirm: "Salvează fișierul nou",
  replaceCancel: "Anulează",
  replaceDone: "Fișier înlocuit — poziția e din nou în coada atelierului",
  replaceFailed: "Nu s-a putut înlocui fișierul. Încercați din nou.",
  replaceUploadFailed: "Nu s-a putut încărca fișierul",
  replaceTooLarge: "Macheta e mai mare decât dimensiunea comandată — micșorați-o sau scrieți studioului",
  replaceNotFlagged: "Poziția nu mai așteaptă fișier — reîncărcați pagina",
  cabinetFixedNotice: (time) => `✓ Fișier nou primit ${time} — poziția e din nou în coadă`,
  orderStatusKept: (codes, status) =>
    `${codes.length === 1 ? `Poziția ${codes[0]} așteaptă` : `Pozițiile ${codes.join(", ")} așteaptă`} fișier — statusul comenzii: ${status}`,
  orderStatusBlocked: (codes) =>
    `${codes.length === 1 ? `Poziția ${codes[0]} așteaptă` : `Pozițiile ${codes.join(", ")} așteaptă`} fișier — mai întâi înlocuiți fișierul sau scoateți marcajul`,

  linePill: { waiting: "În așteptare", printing: "Se tipărește", done: "Gata", needsLayout: "Așteaptă fișier" },
  linesDoneSummary: (done, total) => `Gata ${done} din ${total}`,
  ownerReplaceButton: "Înlocuiește fișierul",
  ownerReplaceTitle: (lineCode) => `Înlocuiește fișierul poziției ${lineCode}`,
  ownerReplaceHint:
    "Poziția nu este încă în lucru — puteți încărca alt fișier. Cel vechi trece în arhivă; prețul, cantitatea și stocul nu se schimbă.",
  ownerReplaceDone: "Fișier înlocuit — atelierul îl va primi pe cel nou",
  ownerReplaceStarted: "Atelierul a început deja această poziție — fișierul nu mai poate fi schimbat. Scrieți atelierului în chat.",
  ownerReplaceLocked: "Această comandă nu mai poate fi modificată din cabinet. Scrieți atelierului în chat.",
  lineInWorkHint: "Deja în lucru — fișierul nu poate fi schimbat",
  cabinetOwnerReplacedNotice: (time) => `Fișier înlocuit ${time}`,
  ownerReplacedAt: (byDealer, time) => `Fișier înlocuit de ${byDealer ? "dealer" : "client"} ${time}`,
  historyOwnerReplaced: (lineCode, byDealer) =>
    `Poziția ${lineCode}: fișier înlocuit de ${byDealer ? "dealer" : "client"} înainte de tipar`,
  lockedWaitingFilesHint:
    "Fișierele pozițiilor care încă așteaptă tiparul pot fi înlocuite — butonul «Înlocuiește» de lângă fișier.",
  replaceFileButton: "Înlocuiește",
  replaceFileTarget: (fileName) => `Înlocuim fișierul: ${fileName}`,
  replacePickFileHint: "Apăsați «Înlocuiește» la fișierul care trebuie corectat — celelalte fișiere rămân neschimbate.",
  replaceFileGone: "Acest fișier a fost deja înlocuit sau șters — am actualizat comanda, alegeți din nou fișierul.",
  staffReplacePickFile: "Ce fișier înlocuim?",
  staffReplacePickFileRequired: "Alegeți fișierul pe care îl înlocuiți",
  historyFixedFile: (lineCode, byClient, oldName, newName) =>
    `Poziția ${lineCode}: fișierul ${oldName} înlocuit cu ${newName} de ${byClient ? "client" : "studio"}, poziția așteaptă din nou tiparul`,
  historyOwnerReplacedFile: (lineCode, byDealer, oldName, newName) =>
    `Poziția ${lineCode}: fișierul ${oldName} înlocuit cu ${newName} de ${byDealer ? "dealer" : "client"} înainte de tipar`,
};
