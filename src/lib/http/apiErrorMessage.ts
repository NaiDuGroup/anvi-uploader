/**
 * Pure helpers behind the global error toasts (`ApiErrorToasts`): which
 * requests are watched, how a failed status becomes a friendly message, and
 * the dedupe that keeps background polling from repeating the same toast.
 *
 * No DOM / React here so it is unit-testable.
 */
import type { Locale } from "@/lib/i18n/types";
import { apiErrorsDict } from "@/lib/i18n/apiErrors";

/** Request header that turns the global toast off for one call (stripped before sending). */
export const NO_ERROR_TOAST_HEADER = "x-no-error-toast";

export type ApiErrorKind =
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "rejected"
  | "tooLarge"
  | "tooManyRequests"
  | "server"
  | "offline"
  | "generic";

export interface ApiErrorMessage {
  kind: ApiErrorKind;
  title: string;
  /** Optional second line. */
  description?: string;
  /** Stable key for dedupe / sonner `id`. */
  key: string;
}

export interface DescribeOptions {
  locale: Locale;
  /** HTTP status; `0` (or null) = the request never got a response (offline). */
  status: number | null;
  /** `error` / `message` from the JSON body, if any. */
  serverMessage?: string | null;
  /** Staff see «only the main administrator can…»; shop customers never do. */
  audience?: "staff" | "customer";
}

const CYRILLIC = /[Ѐ-ӿ]/;
const ROMANIAN = /[ăâîșțşţĂÂÎȘȚŞŢ]/;

/** English / code-like strings the API returns that must never be shown raw. */
const TECHNICAL = [
  /^(unauthori[sz]ed|forbidden|not found|internal( server)? error|bad request|failed|error)\b/i,
  /^(invalid|validation|missing|unknown|storage|request|payload)\b/i,
  /^[a-z0-9]+(_[a-z0-9]+)+$/, // snake_case codes: not_found, line_needs_layout
  /^[a-z]+$/, // single lowercase token: expired, forbidden
  /\bP\d{4}\b/, // Prisma codes
  /prisma|stack|exception|undefined|null|NaN|ECONN|ETIMEDOUT|fetch failed|<html|<!doctype/i,
  /[{}[\]<>]/,
  /^HTTP \d{3}/i,
];

/** True when the server text is safe and useful to show the user as is. */
export function isHumanReadableServerMessage(msg: string | null | undefined, locale: Locale): boolean {
  if (!msg) return false;
  const s = msg.trim();
  if (s.length < 4 || s.length > 240) return false;
  if (TECHNICAL.some((re) => re.test(s))) return false;
  // RO/RU staff: English API strings are not "human" for them — only texts
  // written in Russian/Romanian pass. The English shop accepts plain sentences.
  if (CYRILLIC.test(s) || ROMANIAN.test(s)) return true;
  return locale === "en" && /\s/.test(s);
}

/** Pick the readable text out of a JSON error body (`{ error }`, `{ message }`). */
export function serverMessageFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  for (const k of ["message", "error", "userMessage"]) {
    const v = b[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const nested = b.error;
  if (nested && typeof nested === "object" && typeof (nested as { message?: unknown }).message === "string") {
    return (nested as { message: string }).message;
  }
  return null;
}

/** Server said "superadmin only" (403) — staff get the extra hint. */
function mentionsSuperadmin(...msgs: (string | null | undefined)[]): boolean {
  return msgs.some((m) => !!m && /super\s*-?\s*admin/i.test(m));
}

export function describeApiError(opts: DescribeOptions): ApiErrorMessage {
  const t = apiErrorsDict(opts.locale);
  const status = opts.status ?? 0;
  const raw = opts.serverMessage?.trim() || null;
  const readable = isHumanReadableServerMessage(raw, opts.locale) ? raw : null;

  if (status === 0) return { kind: "offline", title: t.offline, key: "offline" };
  if (status === 401) return { kind: "unauthorized", title: t.sessionExpired, key: "401" };
  if (status === 403) {
    const superHint = opts.audience !== "customer" && mentionsSuperadmin(raw);
    return {
      kind: "forbidden",
      title: t.forbidden,
      description: superHint ? t.superadminOnly : readable ?? undefined,
      key: `403:${superHint ? "super" : readable ?? ""}`,
    };
  }
  if (status === 404) return { kind: "notFound", title: readable ?? t.notFound, key: `404:${readable ?? ""}` };
  if (status === 413) return { kind: "tooLarge", title: t.tooLarge, key: "413" };
  if (status === 429) return { kind: "tooManyRequests", title: t.tooManyRequests, key: "429" };
  if (status >= 500) {
    return { kind: "server", title: t.serverError, description: t.notSaved, key: "5xx" };
  }
  if (status === 400 || status === 409 || status === 422) {
    return { kind: "rejected", title: readable ?? t.rejected, key: `4xx:${readable ?? ""}` };
  }
  return { kind: "generic", title: readable ?? t.generic, key: `other:${status}:${readable ?? ""}` };
}

/** Same-origin `/api/` calls only; auth/login, analytics beacons and the like are left alone. */
export function shouldWatchUrl(url: string, origin: string): boolean {
  let u: URL;
  try {
    u = new URL(url, origin);
  } catch {
    return false;
  }
  if (u.origin !== origin) return false;
  const p = u.pathname;
  if (!p.startsWith("/api/")) return false;
  if (/\/(login|logout|register|otp|verify|reset-password|turnstile)(\/|$)/.test(p)) return false;
  if (p.startsWith("/api/auth/") || p.startsWith("/api/cabinet/auth/")) return false;
  if (p === "/api/shop/e") return false; // storefront funnel beacon
  return true;
}

export type WatchDecision = "toast" | "skip";

/**
 * Which failures get a toast. Mutations (POST/PUT/PATCH/DELETE) — always.
 * GET is mostly page loads and background polling that already render their
 * own empty/error states, so it only reports an expired session.
 */
export function decideToast(method: string, status: number | null): WatchDecision {
  const m = method.toUpperCase();
  const s = status ?? 0;
  if (s === 401) return "toast";
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return "skip";
  return "toast";
}

/**
 * Throttle: the same key is shown at most once per window. The offline toast
 * stays muted until `reset("offline")` (next successful response / `online`).
 */
export function createErrorDeduper(opts: { windowMs: number; stickyKeys?: string[]; now?: () => number }) {
  const shown = new Map<string, number>();
  const sticky = new Set(opts.stickyKeys ?? []);
  const now = opts.now ?? (() => Date.now());
  return {
    /** True if the toast may be shown now (and records it). */
    take(key: string): boolean {
      const t = now();
      const last = shown.get(key);
      if (last !== undefined && (sticky.has(key) || t - last < opts.windowMs)) return false;
      shown.set(key, t);
      return true;
    },
    reset(key: string) {
      shown.delete(key);
    },
  };
}

/** Friendly one-line text for a failed response, for components that show the error inline. */
export async function friendlyErrorText(
  res: Response | null,
  locale: Locale,
  audience: "staff" | "customer" = "staff",
): Promise<string> {
  let serverMessage: string | null = null;
  if (res) {
    try {
      serverMessage = serverMessageFromBody(await res.clone().json());
    } catch {
      serverMessage = null;
    }
  }
  const m = describeApiError({ locale, status: res ? res.status : 0, serverMessage, audience });
  return m.description ? `${m.title}. ${m.description}` : m.title;
}
