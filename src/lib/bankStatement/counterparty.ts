/**
 * MAIB prefixes counterparty names with a resident flag "(R)" or "(R) ".
 * Strip it and collapse whitespace so names group/display consistently.
 */
export function normalizeCounterparty(name: string | null): string {
  return (name ?? "").replace(/^\(R\)\s*/, "").replace(/\s+/g, " ").trim();
}
