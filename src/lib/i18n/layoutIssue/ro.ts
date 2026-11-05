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

  flagButton: "Necesită machetă",
  flagButtonHint: (lineCode) =>
    `Fișierul poziției ${lineCode} nu e bun: poziția se pune pe pauză, celelalte poziții ale comenzii merg mai departe`,
  modalTitle: (lineCode) => `Necesită machetă nouă · ${lineCode}`,
  modalHint:
    "Poziția se pune pe pauză și nu intră la tipar. Celelalte poziții merg mai departe. Clientul (sau studioul) va vedea motivul și comentariul.",
  reasonLabel: "Ce nu e în regulă",
  noteLabel: "Comentariu (opțional)",
  notePlaceholder: "De ex.: foto 72 dpi, e nevoie de minim 300 dpi",
  confirm: "Marchează «Necesită machetă»",
  cancel: "Anulează",
  flagFailed: "Nu s-a putut marca poziția",
  clear: "Scoate marcajul",
  clearConfirm: (lineCode) =>
    `Scoateți marcajul «Necesită machetă» de pe poziția ${lineCode}? Poziția revine în «Așteaptă» cu fișierul vechi.`,
  clearFailed: "Nu s-a putut scoate marcajul",
  waitingLabel: "Așteaptă machetă",
  waitingFor: (wait) => `așteaptă ${wait}`,
  fixedAt: (time) => `✓ Machetă corectată ${time}`,
  heldHint: "Așteaptă un fișier nou — nu intră în nicio așezare și tipar",
  sheetDownloadHeld: "Poziția așteaptă o machetă nouă",
  heldInLayout: (count) => `${count} poz. așteaptă machetă — nu sunt în așezare`,

  adminBanner: (count) => `${count} ${comenzi(count)} o machetă nouă →`,
  adminBannerHint: "Arată doar aceste comenzi",
  adminFilter: "Necesită machetă",
  adminRowLabel: (count) => (count === 1 ? "Necesită machetă" : `Necesită machetă: ${count} poz.`),
  adminNavBadgeTitle: (count) => `${count} ${comenzi(count)} o machetă nouă`,
  staffReplaceHint:
    "Înlocuiți fișierul acestei poziții în editorul comenzii — după salvare poziția revine singură în «Așteaptă».",
  staffReplaceButton: "Înlocuiește fișierul",

  historyFlagged: (lineCode, reason, note) =>
    `Poziția ${lineCode}: necesită machetă — ${reason}${note ? ` («${note}»)` : ""}`,
  historyCleared: (lineCode) => `Poziția ${lineCode}: marcajul «Necesită machetă» scos`,
  historyFixed: (lineCode, byClient) =>
    `Poziția ${lineCode}: machetă corectată de ${byClient ? "client" : "studio"}, poziția așteaptă din nou tiparul`,

  cabinetBannerOne: (orderNumber) => `Comanda #${orderNumber} așteaptă corectarea dvs.: e nevoie de o machetă nouă →`,
  cabinetBannerMany: (count) => `${count} ${comenzi(count)} corectarea dvs. →`,
  cabinetBannerHint: "Până nu înlocuiți fișierul, poziția nu se tipărește. Cu cât mai repede, cu atât primiți comanda mai devreme.",
  cabinetMenuBadgeTitle: (count) => `${count} ${comenzi(count)} o machetă nouă`,
  cabinetRowLabel: "Necesită machetă nouă",
  cabinetFilter: "Necesită machetă nouă",
  cabinetLineTitle: "Necesită machetă nouă",
  cabinetReason: "Motiv",
  cabinetWorkshopComment: "Comentariul atelierului",
  cabinetOldFile: "Fișierul actual",
  cabinetPaused: (wait) => `Comanda e pe pauză până corectați · așteaptă ${wait}`,
  cabinetOtherLinesGo: "Celelalte poziții ale comenzii sunt deja în lucru.",
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
  replaceNotFlagged: "Poziția nu mai așteaptă machetă — reîncărcați pagina",
  cabinetFixedNotice: (time) => `✓ Machetă nouă primită ${time} — poziția e din nou în coadă`,
  orderStatusKept: (codes, status) =>
    `${codes.length === 1 ? `Poziția ${codes[0]} așteaptă` : `Pozițiile ${codes.join(", ")} așteaptă`} machetă — statusul comenzii: ${status}`,
  orderStatusBlocked: (codes) =>
    `${codes.length === 1 ? `Poziția ${codes[0]} așteaptă` : `Pozițiile ${codes.join(", ")} așteaptă`} machetă — mai întâi înlocuiți fișierul sau scoateți marcajul`,
};
