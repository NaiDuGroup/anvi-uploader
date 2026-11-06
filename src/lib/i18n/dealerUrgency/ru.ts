import type { DealerUrgencyDictionary } from "./types";

const num = (mdl: number) => (Number.isInteger(mdl) ? String(mdl) : mdl.toFixed(2));

export const dealerUrgencyRu: DealerUrgencyDictionary = {
  amount: (mdl) => `${num(mdl)} лей`,
  feeShort: (mdl) => (mdl > 0 ? `+${num(mdl)} лей` : "бесплатно"),
  free: "бесплатно",

  settingsSection: "Дилеры",
  settingsFeeLabel: "Доплата за срочность (дилеры)",
  settingsFeeHint:
    "Сколько дилер доплачивает за «Срочно», лей. 0 — бесплатно. Для отдельного дилера можно задать своё значение в карточке клиента. Уже созданные заказы не меняются.",

  cardTitle: "Срочность",
  cardModeDefault: (globalFee) => `Как у всех (${globalFee})`,
  cardModeCustom: "Своя сумма",
  cardModeUnavailable: "Срочность недоступна",
  cardAmountLabel: "Доплата, лей",
  cardHint: "Дилер видит галочку «Срочно» при создании и изменении заказа. 0 — бесплатно.",
  cardSave: "Сохранить",
  cardSaved: "Сохранено",
  cardSaveFailed: "Не удалось сохранить",
  cardNotDealer: "Только для дилеров",

  checkboxLabel: "Срочно",
  checkboxHint: "Заказ идёт первым в очереди — в рабочее время цеха",
  staffSet: "Срочно — отметила студия (бесплатно)",
  unavailableError: "Срочность для вашего аккаунта недоступна",
  goodsLine: "Товары",
  feeLine: "Срочность",
  includedFee: (feeText) => `в т.ч. срочность ${feeText}`,
  pendingFee: (feeText) => `срочность ${feeText} — добавится к цене`,
  urgentChip: "Срочно",

  adminBadge: (feeText) => `срочно по заявке дилера · ${feeText}`,
  adminFeeWaived: "доплата снята",
  waiveButton: "Снять доплату",
  waiveConfirmTitle: (feeText) => `Снять доплату за срочность ${feeText}?`,
  waiveConfirmText: "Заказ останется срочным, сумма заказа и долг дилера уменьшатся.",
  waiveConfirm: "Снять доплату",
  waiveCancel: "Отмена",
  waiveFailed: "Не удалось снять доплату",

  historyDealerOn: (feeText) => `Дилер включил срочность (${feeText})`,
  historyDealerOff: (feeText) => `Дилер снял срочность (${feeText})`,
  historyStaffOff: (feeText) => `Сотрудник снял срочность, доплата снята (${feeText})`,
  historyFeeWaived: (feeText) => `Сотрудник снял доплату за срочность (${feeText})`,

  priceHint: (fee, total) => `+${num(fee)} лей срочность = итог ${num(total)} лей`,
  priceFieldIsGoods: "Цена товаров; доплата за срочность добавится сама",
  invoiceLine: (orderNumber) => `Срочность (заказ #${orderNumber})`,
};
