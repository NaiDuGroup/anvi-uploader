/** Invoice line items of one order, one per invoice (an order may be billed as several lines). */
export function uniqueByInvoice<T extends { invoice: { id: string } }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((li) => {
    if (seen.has(li.invoice.id)) return false;
    seen.add(li.invoice.id);
    return true;
  });
}
