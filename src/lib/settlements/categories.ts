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
  /** What the category would be without the manual row (for «Авто: …» in the picker). */
  autoCategory: CounterpartyCategoryCode | null;
  autoSource: Exclude<CategorySource, "manual"> | null;
}

type AutoCategory = Pick<ResolvedCategory, "category" | "source" | "service">;

/**
 * Built-in default > operational IDNO («не клиент» in Сверка) > guessed from
 * invoices > none. With invoices on both sides the larger invoiced turnover
 * wins (sales → customer, purchases → supplier; a tie stays supplier).
 */
function autoCategoryOf(input: {
  idno: string;
  hasPurchaseInvoices: boolean;
  hasSalesInvoices: boolean;
  operational: boolean;
  salesInvoiced?: number;
  purchasesInvoiced?: number;
}): AutoCategory {
  const builtIn = DEFAULT_COUNTERPARTY_CATEGORIES[input.idno];
  if (builtIn) return { category: builtIn, source: "default", service: SERVICE_CATEGORIES.has(builtIn) };
  if (input.operational) return { category: "other", source: "operational", service: true };
  if (input.hasPurchaseInvoices && input.hasSalesInvoices) {
    const sales = Math.abs(input.salesInvoiced ?? 0);
    const purchases = Math.abs(input.purchasesInvoiced ?? 0);
    if (sales > purchases) return { category: "customer", source: "auto", service: false };
    return { category: "supplier", source: "auto", service: false };
  }
  if (input.hasPurchaseInvoices) return { category: "supplier", source: "auto", service: false };
  if (input.hasSalesInvoices) return { category: "customer", source: "auto", service: false };
  return { category: null, source: null, service: false };
}

/**
 * Manual row > built-in default > operational IDNO > guessed from invoices
 * (see `autoCategoryOf`) > none. Pass the invoiced totals so a party with
 * invoices both ways gets the side with the larger turnover.
 */
export function resolveCategory(input: {
  idno: string;
  manual: CounterpartyCategoryCode | null | undefined;
  hasPurchaseInvoices: boolean;
  hasSalesInvoices: boolean;
  operational: boolean;
  /** Our invoices to them (any unit, compared with `purchasesInvoiced`). */
  salesInvoiced?: number;
  /** Their invoices to us. */
  purchasesInvoiced?: number;
}): ResolvedCategory {
  const auto = autoCategoryOf(input);
  const autoPart = { autoCategory: auto.category, autoSource: auto.source as ResolvedCategory["autoSource"] };
  if (input.manual) {
    return { category: input.manual, source: "manual", service: SERVICE_CATEGORIES.has(input.manual), ...autoPart };
  }
  return { ...auto, ...autoPart };
}
