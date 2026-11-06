import type { DealerUrgencyDictionary } from "./types";

const num = (mdl: number) => (Number.isInteger(mdl) ? String(mdl) : mdl.toFixed(2));

export const dealerUrgencyRo: DealerUrgencyDictionary = {
  amount: (mdl) => `${num(mdl)} lei`,
  feeShort: (mdl) => (mdl > 0 ? `+${num(mdl)} lei` : "gratuit"),
  free: "gratuit",

  settingsSection: "Dealeri",
  settingsFeeLabel: "Suprataxă pentru urgență (dealeri)",
  settingsFeeHint:
    "Cât plătește în plus dealerul pentru «Urgent», lei. 0 — gratuit. Pentru un anumit dealer se poate seta o altă valoare în fișa clientului. Comenzile existente nu se schimbă.",

  cardTitle: "Urgență",
  cardModeDefault: (globalFee) => `Ca la toți (${globalFee})`,
  cardModeCustom: "Sumă proprie",
  cardModeUnavailable: "Urgența nu este disponibilă",
  cardAmountLabel: "Suprataxă, lei",
  cardHint: "Dealerul vede bifa «Urgent» la crearea și modificarea comenzii. 0 — gratuit.",
  cardSave: "Salvează",
  cardSaved: "Salvat",
  cardSaveFailed: "Nu s-a putut salva",
  cardNotDealer: "Doar pentru dealeri",

  checkboxLabel: "Urgent",
  checkboxHint: "Comanda trece prima în coadă — în programul atelierului",
  staffSet: "Urgent — marcat de studio (gratuit)",
  unavailableError: "Urgența nu este disponibilă pentru contul dvs.",
  goodsLine: "Produse",
  feeLine: "Urgență",
  includedFee: (feeText) => `inclusiv urgență ${feeText}`,
  pendingFee: (feeText) => `urgență ${feeText} — se adaugă la preț`,
  urgentChip: "Urgent",

  adminBadge: (feeText) => `urgent la cererea dealerului · ${feeText}`,
  adminFeeWaived: "suprataxă anulată",
  waiveButton: "Anulează suprataxa",
  waiveConfirmTitle: (feeText) => `Anulați suprataxa pentru urgență ${feeText}?`,
  waiveConfirmText: "Comanda rămâne urgentă, suma comenzii și datoria dealerului scad.",
  waiveConfirm: "Anulează suprataxa",
  waiveCancel: "Renunță",
  waiveFailed: "Nu s-a putut anula suprataxa",

  historyDealerOn: (feeText) => `Dealerul a activat urgența (${feeText})`,
  historyDealerOff: (feeText) => `Dealerul a scos urgența (${feeText})`,
  historyStaffOff: (feeText) => `Angajatul a scos urgența, suprataxa anulată (${feeText})`,
  historyFeeWaived: (feeText) => `Angajatul a anulat suprataxa pentru urgență (${feeText})`,

  priceHint: (fee, total) => `+${num(fee)} lei urgență = total ${num(total)} lei`,
  priceFieldIsGoods: "Prețul produselor; suprataxa de urgență se adaugă automat",
  invoiceLine: (orderNumber) => `Urgență (comanda #${orderNumber})`,
};
