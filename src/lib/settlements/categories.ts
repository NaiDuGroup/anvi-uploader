import type { CategorySource, CounterpartyCategoryCode } from "./types";

/**
 * Built-in categories for well-known fiscal codes (like `operational.ts`).
 * A `counterparty_categories` row for the same IDNO overrides these.
 */
export const DEFAULT_COUNTERPARTY_CATEGORIES: Readonly<Record<string, CounterpartyCategoryCode>> = {
  "1006601000037": "tax", // Ministerul Finanțelor — Trezoreria (taxes)
  "1023600000396": "own", // ANVI-STUDIO GROUP — own accounts, loan repayments
  "1002600003778": "bank", // BC MAIB — fees, acquiring
  "2007002016402": "staff", // DUNAI ANATOLIE — director
  "1022600043213": "courier", // EVS EXPRESS — courier / cash on delivery
};

/** Not trading parties: their payments are neither supplier payments nor debts. */
export const SERVICE_CATEGORIES: ReadonlySet<CounterpartyCategoryCode> = new Set([
  "tax",
  "own",
  "bank",
  "staff",
  "courier",
]);

export interface ResolvedCategory {
  category: CounterpartyCategoryCode | null;
  source: CategorySource | null;
  /** True when the party stays out of balances and supplier payments. */
  service: boolean;
}

/**
 * Manual row > built-in default > guessed from invoices (purchase → supplier,
 * sales → customer) > operational IDNO («не клиент» in Сверка) > none.
 */
export function resolveCategory(input: {
  idno: string;
  manual: CounterpartyCategoryCode | null | undefined;
  hasPurchaseInvoices: boolean;
  hasSalesInvoices: boolean;
  operational: boolean;
}): ResolvedCategory {
  if (input.manual) {
    return { category: input.manual, source: "manual", service: SERVICE_CATEGORIES.has(input.manual) };
  }
  const builtIn = DEFAULT_COUNTERPARTY_CATEGORIES[input.idno];
  if (builtIn) return { category: builtIn, source: "default", service: SERVICE_CATEGORIES.has(builtIn) };
  if (input.operational) return { category: "other", source: "operational", service: true };
  if (input.hasPurchaseInvoices) return { category: "supplier", source: "auto", service: false };
  if (input.hasSalesInvoices) return { category: "customer", source: "auto", service: false };
  return { category: null, source: null, service: false };
}
