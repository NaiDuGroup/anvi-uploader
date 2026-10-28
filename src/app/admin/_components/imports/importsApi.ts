/** Client helpers for `/api/admin/imports/**`. */

export class ImportClientError extends Error {
  constructor(public readonly code: string, public readonly extra: Record<string, unknown> = {}) {
    super(code);
    this.name = "ImportClientError";
  }
}

export async function importFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string } & Record<string, unknown>;
    throw new ImportClientError(d.error ?? `http_${res.status}`, d);
  }
  return data as T;
}

export const importSwrFetcher = <T,>(url: string): Promise<T> => importFetch<T>(url);

export function errorText(e: unknown, errors: Record<string, string>, fallback: string): string {
  if (e instanceof ImportClientError) {
    const base: string = errors[e.code] ?? `${fallback}: ${e.code}`;
    const codes = e.extra.codes;
    return Array.isArray(codes) && codes.length ? `${base}: ${codes.slice(0, 8).join(", ")}${codes.length > 8 ? "…" : ""}` : base;
  }
  return fallback;
}

export function formatMdl(n: number, locale: string, digits = 2): string {
  return n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
