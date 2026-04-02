export const ORDER_PAGE_SIZE_OPTIONS = [15, 30, 50, 100] as const;

export type OrderPageSize = (typeof ORDER_PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_ORDER_PAGE_SIZE: OrderPageSize = 15;

const ALLOWED = new Set<number>(ORDER_PAGE_SIZE_OPTIONS);

export function normalizeOrderPageLimit(raw: unknown): OrderPageSize {
  if (raw === undefined || raw === null || raw === "") {
    return DEFAULT_ORDER_PAGE_SIZE;
  }
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || !ALLOWED.has(n)) {
    return DEFAULT_ORDER_PAGE_SIZE;
  }
  return n as OrderPageSize;
}
