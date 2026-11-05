/**
 * `?page=&limit=` for admin list APIs (clients, invoices). Pure.
 * `limit` defaults to `defaultLimit`, is clamped to 1…`maxLimit`; `page` is 1-based.
 */
export function parseListPage(
  searchParams: URLSearchParams,
  opts: { defaultLimit: number; maxLimit: number },
): { page: number; take: number; skip: number } {
  const rawLimit = parseInt(searchParams.get("limit") ?? "", 10);
  const take = Math.min(opts.maxLimit, Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : opts.defaultLimit));
  const rawPage = parseInt(searchParams.get("page") ?? "", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.min(rawPage, 100_000) : 1;
  return { page, take, skip: (page - 1) * take };
}

/** Number of pages for `total` rows (at least 1). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}
