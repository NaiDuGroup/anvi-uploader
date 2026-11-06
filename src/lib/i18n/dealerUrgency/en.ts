import type { DealerUrgencyDictionary } from "./types";

const num = (mdl: number) => (Number.isInteger(mdl) ? String(mdl) : mdl.toFixed(2));

export const dealerUrgencyEn: DealerUrgencyDictionary = {
  amount: (mdl) => `${num(mdl)} lei`,
  feeShort: (mdl) => (mdl > 0 ? `+${num(mdl)} lei` : "free"),
  free: "free",

  settingsSection: "Dealers",
  settingsFeeLabel: "Rush surcharge (dealers)",
  settingsFeeHint:
    "What a dealer pays extra for «Rush», lei. 0 = free. A dealer can get their own amount on the client card. Existing orders do not change.",

  cardTitle: "Rush orders",
  cardModeDefault: (globalFee) => `Same as everyone (${globalFee})`,
  cardModeCustom: "Own amount",
  cardModeUnavailable: "Rush not available",
  cardAmountLabel: "Surcharge, lei",
  cardHint: "The dealer sees the «Rush» checkbox when creating and editing an order. 0 = free.",
  cardSave: "Save",
  cardSaved: "Saved",
  cardSaveFailed: "Could not save",
  cardNotDealer: "Dealers only",

  checkboxLabel: "Rush",
  checkboxHint: "The order goes first in the queue — during workshop hours",
  staffSet: "Rush — set by the studio (free)",
  unavailableError: "Rush orders are not available for your account",
  goodsLine: "Items",
  feeLine: "Rush",
  includedFee: (feeText) => `incl. rush ${feeText}`,
  pendingFee: (feeText) => `rush ${feeText} — added to the price`,
  urgentChip: "Rush",

  adminBadge: (feeText) => `rush requested by dealer · ${feeText}`,
  adminFeeWaived: "surcharge waived",
  waiveButton: "Waive surcharge",
  waiveConfirmTitle: (feeText) => `Waive the rush surcharge of ${feeText}?`,
  waiveConfirmText: "The order stays rush; the order total and the dealer's debt go down.",
  waiveConfirm: "Waive surcharge",
  waiveCancel: "Cancel",
  waiveFailed: "Could not waive the surcharge",

  historyDealerOn: (feeText) => `Dealer turned rush on (${feeText})`,
  historyDealerOff: (feeText) => `Dealer turned rush off (${feeText})`,
  historyStaffOff: (feeText) => `Staff turned rush off, surcharge removed (${feeText})`,
  historyFeeWaived: (feeText) => `Staff waived the rush surcharge (${feeText})`,

  priceHint: (fee, total) => `+${num(fee)} lei rush = total ${num(total)} lei`,
  priceFieldIsGoods: "Items price; the rush surcharge is added automatically",
  invoiceLine: (orderNumber) => `Rush (order #${orderNumber})`,
};
