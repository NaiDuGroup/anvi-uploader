/** Dealer «Срочно» surcharge: settings, client card, cabinet checkbox / totals, staff badge + waive, history, invoices. */
export interface DealerUrgencyDictionary {
  /** Amount with the currency word: «50 лей» / «50 lei». */
  amount: (mdl: number) => string;
  /** «+50 лей» or «бесплатно» (0). */
  feeShort: (mdl: number) => string;
  free: string;

  // ─── Settings ─────────────────────────────────────────────────────────────
  settingsSection: string;
  settingsFeeLabel: string;
  settingsFeeHint: string;

  // ─── Client card (per-dealer override) ────────────────────────────────────
  cardTitle: string;
  cardModeDefault: (globalFee: string) => string;
  cardModeCustom: string;
  cardModeUnavailable: string;
  cardAmountLabel: string;
  cardHint: string;
  cardSave: string;
  cardSaved: string;
  cardSaveFailed: string;
  cardNotDealer: string;

  // ─── Cabinet (dealer) ─────────────────────────────────────────────────────
  checkboxLabel: string;
  checkboxHint: string;
  /** Urgency set by the studio: shown checked and locked. */
  staffSet: string;
  unavailableError: string;
  goodsLine: string;
  feeLine: string;
  /** Cabinet order detail / list under the price: «в т.ч. срочность +50 лей». */
  includedFee: (feeText: string) => string;
  /** Price not set yet: «срочность +30 лей — добавится к цене». */
  pendingFee: (feeText: string) => string;
  urgentChip: string;

  // ─── Staff ────────────────────────────────────────────────────────────────
  /** «срочно по заявке дилера · +50 лей». */
  adminBadge: (feeText: string) => string;
  adminFeeWaived: string;
  waiveButton: string;
  waiveConfirmTitle: (feeText: string) => string;
  waiveConfirmText: string;
  waiveConfirm: string;
  waiveCancel: string;
  waiveFailed: string;

  // ─── History ──────────────────────────────────────────────────────────────
  historyDealerOn: (feeText: string) => string;
  historyDealerOff: (feeText: string) => string;
  historyStaffOff: (feeText: string) => string;
  historyFeeWaived: (feeText: string) => string;

  /** Staff price fields of an order with a dealer fee: «+30 лей срочность = итог 130 лей». */
  priceHint: (feeMdl: number, totalMdl: number) => string;
  /** Tooltip: the field is the goods price, the fee is added on save. */
  priceFieldIsGoods: string;

  // ─── Invoices ─────────────────────────────────────────────────────────────
  invoiceLine: (orderNumber: number) => string;
}
