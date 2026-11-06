/**
 * Dealer «Срочно» (urgent order) surcharge: who may turn it on, what it costs
 * and how it sits in the order price. Urgency is per whole order (`Order.isPrio`).
 *
 * - Global fee: `CompanyProfile.dealerUrgencyFeeMdl` («Доплата за срочность (дилеры)», default 0).
 * - Per dealer (client card): `StudioCustomer.urgencyFeeMdl` null = «как у всех» (global),
 *   a number = own amount (0 = free), `urgencyDisabled` = «срочность недоступна».
 * - On the order: `urgencyFee` is already inside `price` (price = goods + fee) and
 *   is frozen when the dealer turns urgency on — later rate changes never touch it.
 *   `urgencyByDealerAt` marks a dealer request; staff 🔥 stays free (no fee, no marker).
 *
 * Pure and client-safe: no Prisma, no server imports.
 */

/** What the dealer is offered: no checkbox, or a checkbox with this fee. */
export type DealerUrgencyOffer = { available: false } | { available: true; feeMdl: number };

export interface DealerUrgencySettings {
  /** Global «Доплата за срочность (дилеры)» in MDL. */
  globalFeeMdl: number | string | { toString(): string } | null | undefined;
}

export interface DealerUrgencyCustomer {
  isDealer: boolean;
  /** Own amount; null / undefined = «как у всех». */
  urgencyFeeMdl?: number | string | { toString(): string } | null;
  urgencyDisabled?: boolean | null;
}

/** Money value (Decimal / string / number) to a non-negative MDL amount with bani; invalid → null. */
export function toFeeMdl(value: number | string | { toString(): string } | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * The fee the dealer pays for «Срочно» right now. Non-dealers are never offered
 * dealer urgency (retail / staff orders are unchanged); a broken global value
 * counts as 0 (free) rather than blocking the dealer.
 */
export function resolveDealerUrgencyOffer(
  settings: DealerUrgencySettings,
  customer: DealerUrgencyCustomer | null | undefined,
): DealerUrgencyOffer {
  if (!customer || customer.isDealer !== true) return { available: false };
  if (customer.urgencyDisabled === true) return { available: false };
  const own = toFeeMdl(customer.urgencyFeeMdl);
  if (own !== null) return { available: true, feeMdl: own };
  return { available: true, feeMdl: toFeeMdl(settings.globalFeeMdl) ?? 0 };
}

/** Client-card mode of the per-dealer override. */
export type DealerUrgencyMode = "default" | "custom" | "unavailable";

export function dealerUrgencyMode(customer: Pick<DealerUrgencyCustomer, "urgencyFeeMdl" | "urgencyDisabled">): DealerUrgencyMode {
  if (customer.urgencyDisabled === true) return "unavailable";
  return toFeeMdl(customer.urgencyFeeMdl) === null ? "default" : "custom";
}

/** Columns written for a mode chosen on the client card (custom needs an amount ≥ 0). */
export function dealerUrgencyOverrideColumns(
  mode: DealerUrgencyMode,
  amountMdl?: number | null,
): { urgencyFeeMdl: number | null; urgencyDisabled: boolean } {
  if (mode === "unavailable") return { urgencyFeeMdl: null, urgencyDisabled: true };
  if (mode === "default") return { urgencyFeeMdl: null, urgencyDisabled: false };
  const fee = toFeeMdl(amountMdl ?? null);
  if (fee === null) throw new Error("custom_amount_required");
  return { urgencyFeeMdl: fee, urgencyDisabled: false };
}

/**
 * Urgency of an order as the dealer sees it:
 * - `dealer`: the dealer turned it on (fee frozen in `urgencyFee`);
 * - `staff`: the studio marked it 🔥 (free; the dealer cannot remove it);
 * - `off`.
 */
export type OrderUrgencyState = "off" | "dealer" | "staff";

export interface OrderUrgencyFields {
  isPrio: boolean;
  urgencyByDealerAt?: Date | string | null;
}

export function orderUrgencyState(order: OrderUrgencyFields): OrderUrgencyState {
  if (order.urgencyByDealerAt) return "dealer";
  return order.isPrio ? "staff" : "off";
}

/** Order price = goods + fee. Unpriced goods (null, the studio prices it) stay null. */
export function priceWithUrgencyFee(goodsMdl: number | null, feeMdl: number | null | undefined): number | null {
  if (goodsMdl === null) return null;
  return Math.round((goodsMdl + (feeMdl ?? 0)) * 100) / 100;
}

/** Price after the fee is taken off (waive / staff removes urgency); never below 0. */
export function priceWithoutUrgencyFee(priceMdl: number | null, feeMdl: number | null | undefined): number | null {
  if (priceMdl === null) return null;
  return Math.max(0, Math.round((priceMdl - (feeMdl ?? 0)) * 100) / 100);
}

/** Orders column patch for «dealer turned urgency on» / «urgency removed». */
export function dealerUrgencyOnColumns(feeMdl: number, userId: string, at: Date) {
  return {
    isPrio: true,
    urgencyFee: feeMdl,
    urgencyByDealerAt: at,
    urgencySetById: userId,
    urgencyFeeWaivedAt: null,
    urgencyFeeWaivedById: null,
  };
}

export const DEALER_URGENCY_OFF_COLUMNS = {
  isPrio: false,
  urgencyFee: null,
  urgencyByDealerAt: null,
  urgencySetById: null,
  urgencyFeeWaivedAt: null,
  urgencyFeeWaivedById: null,
} as const;

/**
 * Plan a dealer's urgency choice on an existing (still editable) order.
 * `wanted` undefined = keep as is. Staff urgency is never removed by the dealer.
 * Returns the fee that stays in the price and the column patch (null = no change).
 */
export function planDealerUrgencyChange(params: {
  current: OrderUrgencyFields & { urgencyFee?: number | string | { toString(): string } | null };
  wanted: boolean | undefined;
  offer: DealerUrgencyOffer;
}):
  | { kind: "keep"; feeMdl: number }
  | { kind: "on"; feeMdl: number }
  | { kind: "off"; removedFeeMdl: number }
  | { kind: "unavailable" } {
  const state = orderUrgencyState(params.current);
  const storedFee = toFeeMdl(params.current.urgencyFee) ?? 0;
  if (state === "dealer") {
    if (params.wanted === false) return { kind: "off", removedFeeMdl: storedFee };
    return { kind: "keep", feeMdl: storedFee };
  }
  if (state === "staff" || params.wanted !== true) return { kind: "keep", feeMdl: 0 };
  if (!params.offer.available) return { kind: "unavailable" };
  return { kind: "on", feeMdl: params.offer.feeMdl };
}

/** OrderLog actions of dealer urgency. */
export const URGENCY_LOG_ACTIONS = {
  dealerOn: "urgency_dealer_on",
  dealerOff: "urgency_dealer_off",
  staffOff: "urgency_staff_off",
  feeWaived: "urgency_fee_waived",
} as const;

/** Staff marker «срочно по заявке дилера · +50 лей» (null = no dealer request). */
export interface AdminDealerUrgencyView {
  feeMdl: number;
  waived: boolean;
}

export function adminDealerUrgencyView(order: {
  urgencyByDealerAt?: Date | string | null;
  urgencyFee?: number | string | { toString(): string } | null;
  urgencyFeeWaivedAt?: Date | string | null;
}): AdminDealerUrgencyView | null {
  if (!order.urgencyByDealerAt) return null;
  return { feeMdl: toFeeMdl(order.urgencyFee) ?? 0, waived: order.urgencyFeeWaivedAt != null };
}

/**
 * Staff price contract on orders with a dealer urgency fee: the fee that is
 * still charged (requested by the dealer, > 0, not waived). For such orders the
 * price staff type / see in edit fields is the GOODS price; the server stores
 * goods + fee (`staffPriceToStored`), edit fields prefill price − fee.
 */
export function chargedUrgencyFeeMdl(order: {
  urgencyByDealerAt?: Date | string | null;
  urgencyFee?: number | string | { toString(): string } | null;
}): number {
  if (!order.urgencyByDealerAt) return 0;
  const fee = toFeeMdl(order.urgencyFee) ?? 0;
  return fee > 0 ? fee : 0;
}

/** Staff-typed goods price → stored `Order.price` (null stays null). */
export function staffPriceToStored(goodsMdl: number | null, chargedFeeMdl: number): number | null {
  return priceWithUrgencyFee(goodsMdl, chargedFeeMdl > 0 ? chargedFeeMdl : null);
}

/** Stored `Order.price` → the goods price a staff edit field prefills (null stays null). */
export function storedPriceToStaff(priceMdl: number | null, chargedFeeMdl: number): number | null {
  if (priceMdl === null) return null;
  return Math.round((priceMdl - (chargedFeeMdl > 0 ? chargedFeeMdl : 0)) * 100) / 100;
}
