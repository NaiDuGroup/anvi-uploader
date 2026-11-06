import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Paynet (paynet.md) e-commerce API v2 — hosted card payment page.
 * Docs: https://docs.paynet.md/psp/ («Server-Server model»).
 *
 * Flow: `POST /auth` (Bearer token, 24 h) → `POST /api/order` registers a
 * payment for our Paynet order number and returns `paymentLink` (the hosted
 * page, signed with `?s=`) → the customer pays and comes back to
 * `LinkUrlSuccess` → Paynet POSTs a notification (header `Hash`) to the
 * callback URL configured on Paynet's side → we re-check the payment with
 * `GET /api/order/merchant/{Order}` and settle the order.
 *
 * Verified on the sandbox (ecom-api-test.paynet.md, 2026-11-06):
 * - amounts are in bani (1500 → «15.00 MDL»);
 * - `ExpiryDate` is Europe/Chisinau local time without an offset; it must be
 *   more than 5 minutes ahead (5 → 400 INVALID_PARAMETER, 6 → ok);
 * - the same `Order` + the same amount again → the SAME payment (same id and
 *   signed link); the same `Order` + another amount, or an order already
 *   paid → 500 TECHNICAL_ERROR; so every new attempt needs a new Order;
 * - registered → `status: 1`, paid → `status: 4` with `paidDate` and
 *   `amount.paidAmount` set;
 * - `Customer.NameFirst/NameLast/Email/PhoneNumber` prefill the (required)
 *   billing fields of the payment page.
 *
 * No secret ever goes to a log line.
 */

type Env = Readonly<Record<string, string | undefined>>;

export interface PaynetConfig {
  apiUrl: string;
  username: string;
  password: string;
  saleAreaCode: string;
  merchantCode: string;
  notificationSecret: string;
  /** Lifetime of a payment link, minutes (≥ 15). */
  expiryMinutes: number;
  /** Added to every Paynet order number (keeps sandbox tests apart from other merchants' numbers); 0 in production. */
  orderBase: number;
}

/** Env vars without which Paynet is off (`SHOP_PAYMENT_MODE=paynet` also required, see `paymentMode.ts`). */
export const PAYNET_REQUIRED_ENV = [
  "PAYNET_API_URL",
  "PAYNET_USERNAME",
  "PAYNET_PASSWORD",
  "PAYNET_SALE_AREA_CODE",
  "PAYNET_MERCHANT_CODE",
  "PAYNET_NOTIFICATION_SECRET",
] as const;

export const PAYNET_DEFAULT_EXPIRY_MINUTES = 120;

/** Paynet settings from the environment, or null when any required one is missing. */
export function paynetConfig(env: Env = process.env): PaynetConfig | null {
  const v = (k: string) => env[k]?.trim() ?? "";
  if (PAYNET_REQUIRED_ENV.some((k) => !v(k))) return null;
  const minutes = Number.parseInt(v("PAYNET_EXPIRY_MINUTES"), 10);
  const base = Number.parseInt(v("PAYNET_ORDER_BASE"), 10);
  return {
    apiUrl: v("PAYNET_API_URL").replace(/\/+$/, ""),
    username: v("PAYNET_USERNAME"),
    password: v("PAYNET_PASSWORD"),
    saleAreaCode: v("PAYNET_SALE_AREA_CODE"),
    merchantCode: v("PAYNET_MERCHANT_CODE"),
    notificationSecret: v("PAYNET_NOTIFICATION_SECRET"),
    expiryMinutes: Number.isFinite(minutes) ? Math.min(Math.max(minutes, 15), 7 * 24 * 60) : PAYNET_DEFAULT_EXPIRY_MINUTES,
    orderBase: Number.isFinite(base) && base > 0 ? base : 0,
  };
}

// ─── Errors ────────────────────────────────────────────────────────────────

export class PaynetError extends Error {
  constructor(
    message: string,
    /** HTTP status from Paynet (0 = network / timeout / bad JSON). */
    readonly httpStatus: number,
    /** Paynet's `code` (e.g. TECHNICAL_ERROR, NOT_FOUND_RECORD, INVALID_PARAMETER). */
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "PaynetError";
  }
}

// ─── Amounts, order numbers, refs ──────────────────────────────────────────

/** MDL → bani (Paynet amounts are integers in bani). */
export function toBani(mdl: number): number {
  return Math.round(mdl * 100);
}

/** Attempts per order: Paynet order = base + orderNumber × 100 + attempt. */
export const PAYNET_ATTEMPTS = 100;

/** Paynet `Order` for our order number and payment attempt (0…99). */
export function paynetOrderNumber(orderNumber: number, attempt: number, base = 0): number {
  return base + orderNumber * PAYNET_ATTEMPTS + attempt;
}

/** Our order number and the attempt behind a Paynet `Order` (null when it is not ours). */
export function parsePaynetOrderNumber(paynetOrder: number, base = 0): { orderNumber: number; attempt: number } | null {
  if (!Number.isSafeInteger(paynetOrder)) return null;
  const n = paynetOrder - base;
  if (n < PAYNET_ATTEMPTS) return null;
  return { orderNumber: Math.floor(n / PAYNET_ATTEMPTS), attempt: n % PAYNET_ATTEMPTS };
}

/**
 * `Order.paymentRef` of a Paynet payment: `paynet:<Paynet order>:<paymentId>`
 * (both numbers are needed: the order number to re-check / re-use, the
 * payment id for staff and Paynet support).
 */
export function formatPaynetRef(paynetOrder: number, paymentId: number | string): string {
  return `paynet:${paynetOrder}:${paymentId}`;
}

export function parsePaynetRef(ref: string | null | undefined): { paynetOrder: number; paymentId: string } | null {
  const m = /^paynet:(\d{1,15}):(\d{1,20})$/.exec(ref ?? "");
  return m ? { paynetOrder: Number(m[1]), paymentId: m[2] } : null;
}

// ─── Europe/Chisinau local time ────────────────────────────────────────────

const CHISINAU = "Europe/Chisinau";
const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: CHISINAU,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function chisinauParts(d: Date): Record<string, string> {
  return Object.fromEntries(partsFmt.formatToParts(d).map((p) => [p.type, p.value]));
}

/** `YYYY-MM-DDTHH:mm:ss` wall-clock time in Chisinau (Paynet's `ExpiryDate`), DST-aware. */
export function formatChisinauTime(d: Date): string {
  const p = chisinauParts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Chisinau offset from UTC at instant `ms`, in ms (+2 h winter, +3 h summer). */
function chisinauOffsetMs(ms: number): number {
  const p = chisinauParts(new Date(ms));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Parses Paynet's local dates (`2026-11-06 18:05:20` or with `T`) as Chisinau time; null when unreadable. */
export function parseChisinauTime(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s?.trim() ?? "");
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  let ms = wall - chisinauOffsetMs(wall);
  ms = wall - chisinauOffsetMs(ms); // second pass: the offset at the real instant (DST edges)
  return Number.isFinite(ms) ? new Date(ms) : null;
}

// ─── API ───────────────────────────────────────────────────────────────────

/** The fields of a Paynet order (`POST /api/order`, `GET /api/order/…`) we use. */
export interface PaynetPayment {
  paymentId: number;
  /** Signed link from `POST /api/order`; `GET` answers it without `?s=` (not usable). */
  paymentLink: string;
  status: number;
  order: number;
  merchantCode: string;
  amount: { requestAmount: number; paidAmount: number | null };
  expiryDate: string | null;
  paidDate: string | null;
}

export const PAYNET_STATUS_REGISTERED = 1;
export const PAYNET_STATUS_PAID = 4;

/** Paid: Paynet set `paidDate` (status 4 on the sandbox) and a paid amount. */
export function isPaynetPaid(p: Pick<PaynetPayment, "status" | "paidDate" | "amount">): boolean {
  return (p.paidDate != null || p.status === PAYNET_STATUS_PAID) && (p.amount?.paidAmount ?? 0) > 0;
}

/**
 * A registered, unpaid payment the customer can still use for `amountBani`
 * for at least `marginMs` (the hosted page needs a few minutes).
 */
export function isPaynetReusable(p: PaynetPayment, amountBani: number, now: Date, marginMs = 10 * 60_000): boolean {
  if (p.status !== PAYNET_STATUS_REGISTERED || isPaynetPaid(p)) return false;
  if (p.amount?.requestAmount !== amountBani) return false;
  const exp = parseChisinauTime(p.expiryDate);
  return exp != null && exp.getTime() - now.getTime() >= marginMs;
}

function asPayment(v: unknown): PaynetPayment | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r.paymentId !== "number" || typeof r.status !== "number") return null;
  const amount = (r.amount && typeof r.amount === "object" ? r.amount : {}) as Record<string, unknown>;
  return {
    paymentId: r.paymentId,
    paymentLink: typeof r.paymentLink === "string" ? r.paymentLink : "",
    status: r.status,
    order: typeof r.order === "number" ? r.order : Number(r.order),
    merchantCode: r.merchantCode == null ? "" : String(r.merchantCode),
    amount: {
      requestAmount: Number(amount.requestAmount ?? amount.amount ?? 0),
      paidAmount: amount.paidAmount == null ? null : Number(amount.paidAmount),
    },
    expiryDate: typeof r.expiryDate === "string" ? r.expiryDate : null,
    paidDate: typeof r.paidDate === "string" && r.paidDate ? r.paidDate : null,
  };
}

const TIMEOUT_MS = 15_000;

let tokenCache: { key: string; token: string; expiresAt: number } | null = null;

/** For tests. */
export function clearPaynetTokenCache(): void {
  tokenCache = null;
}

async function paynetFetch(cfg: PaynetConfig, path: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${cfg.apiUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    const timeout = (e as { name?: string })?.name === "TimeoutError";
    throw new PaynetError(timeout ? `paynet_timeout ${path}` : `paynet_network ${path}`, 0, timeout ? "TIMEOUT" : "NETWORK");
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function errorOf(path: string, status: number, body: unknown): PaynetError {
  const b = (body && typeof body === "object" ? body : {}) as { code?: unknown; details?: unknown };
  const code = typeof b.code === "string" ? b.code : null;
  const details = typeof b.details === "string" ? `: ${b.details.slice(0, 200)}` : "";
  return new PaynetError(`paynet ${path} → ${status}${code ? ` ${code}` : ""}${details}`, status, code);
}

async function getToken(cfg: PaynetConfig): Promise<string> {
  const key = `${cfg.apiUrl}|${cfg.username}`;
  if (tokenCache && tokenCache.key === key && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const { status, body } = await paynetFetch(cfg, "/auth", {
    method: "POST",
    body: JSON.stringify({ grantType: "password", username: cfg.username, password: cfg.password }),
  });
  const b = (body ?? {}) as { access_token?: unknown; expires_in?: unknown };
  if (status !== 200 || typeof b.access_token !== "string" || !b.access_token) throw errorOf("/auth", status, body);
  const ttl = typeof b.expires_in === "number" && b.expires_in > 0 ? b.expires_in * 1000 : 3_600_000;
  tokenCache = { key, token: b.access_token, expiresAt: Date.now() + ttl };
  return b.access_token;
}

/** Authorized call; on 401 the token is fetched again and the call retried once. */
async function authed(cfg: PaynetConfig, path: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  for (let i = 0; ; i++) {
    const token = await getToken(cfg);
    const r = await paynetFetch(cfg, path, { ...init, headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 401 || i > 0) return r;
    tokenCache = null;
  }
}

export type PaynetLang = "RO" | "RU" | "EN";

export interface PaynetCreateInput {
  paynetOrder: number;
  amountBani: number;
  /** One service line, e.g. «Comanda ANVI #123». */
  title: string;
  lang: PaynetLang;
  successUrl: string;
  cancelUrl: string;
  customer: { code: string; firstName?: string; lastName?: string; email?: string | null; phone?: string | null };
  now?: Date;
}

/**
 * `POST /api/order`. Same `Order` + same amount → Paynet answers the existing
 * payment (with its signed link). Throws {@link PaynetError} otherwise.
 */
export async function createPaynetOrder(cfg: PaynetConfig, input: PaynetCreateInput): Promise<PaynetPayment> {
  const now = input.now ?? new Date();
  const c = input.customer;
  const body = {
    Order: input.paynetOrder,
    SaleAreaCode: cfg.saleAreaCode,
    LinkUrlSuccess: input.successUrl,
    LinkUrlCancel: input.cancelUrl,
    Currency: 498,
    ExpiryDate: formatChisinauTime(new Date(now.getTime() + cfg.expiryMinutes * 60_000)),
    MoneyType: "All",
    Lang: input.lang,
    Customer: {
      Code: c.code,
      ...(c.firstName ? { NameFirst: c.firstName.slice(0, 50) } : {}),
      ...(c.lastName ? { NameLast: c.lastName.slice(0, 50) } : {}),
      ...(c.email ? { Email: c.email } : {}),
      ...(c.phone ? { PhoneNumber: c.phone } : {}),
    },
    Services: [{ Name: input.title, Description: input.title, Amount: input.amountBani }],
  };
  const { status, body: res } = await authed(cfg, "/api/order", { method: "POST", body: JSON.stringify(body) });
  const p = status === 200 ? asPayment(res) : null;
  if (!p || !p.paymentLink) throw errorOf("/api/order", status, res);
  return p;
}

/** `GET /api/order/merchant/{Order}`; null when Paynet has no such order (404). */
export async function getPaynetOrder(cfg: PaynetConfig, paynetOrder: number): Promise<PaynetPayment | null> {
  const path = `/api/order/merchant/${encodeURIComponent(String(paynetOrder))}`;
  const { status, body } = await authed(cfg, path, { method: "GET" });
  if (status === 404) return null;
  const p = status === 200 ? asPayment(body) : null;
  if (!p) throw errorOf(path, status, body);
  return p;
}

/** `GET /api/order/{paymentId}`; null on 404. */
export async function getPaynetPayment(cfg: PaynetConfig, paymentId: number | string): Promise<PaynetPayment | null> {
  const path = `/api/order/${encodeURIComponent(String(paymentId))}`;
  const { status, body } = await authed(cfg, path, { method: "GET" });
  if (status === 404) return null;
  const p = status === 200 ? asPayment(body) : null;
  if (!p) throw errorOf(path, status, body);
  return p;
}

// ─── Notification ──────────────────────────────────────────────────────────

/** A notification with every field as the string that goes into the hash. */
export interface PaynetNotification {
  eventId: string;
  /** As sent (Paid / PAID, Fail / FAIL…): compare case-insensitively. */
  eventType: string;
  eventDate: string;
  payment: { id: string; externalId: string; merchant: string; customer: string; statusDate: string; amount: string };
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (obj[k] != null) return obj[k];
  const lower = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) {
    const v = lower.get(k.toLowerCase());
    if (v != null) return v;
  }
  return undefined;
}

const str = (v: unknown): string => (v == null ? "" : String(v));

/** Paynet sends `Id`/`ExternalId` (docs: `ID`/`ExternalID`); any casing is accepted. Null when there is no `Payment`. */
export function normalizePaynetNotification(raw: unknown): PaynetNotification | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const p = pick(r, "Payment");
  if (!p || typeof p !== "object") return null;
  const pay = p as Record<string, unknown>;
  return {
    eventId: str(pick(r, "Eventid", "EventId", "EventID")),
    eventType: str(pick(r, "EventType")),
    eventDate: str(pick(r, "EventDate")),
    payment: {
      id: str(pick(pay, "ID", "Id")),
      externalId: str(pick(pay, "ExternalID", "ExternalId")),
      merchant: str(pick(pay, "Merchant")),
      customer: str(pick(pay, "Customer")),
      statusDate: str(pick(pay, "StatusDate")),
      amount: str(pick(pay, "Amount")),
    },
  };
}

/**
 * `Base64(MD5(EventDate + Eventid + EventType + Payment.Amount + Payment.Customer
 * + Payment.ExternalID + Payment.ID + Payment.Merchant + Payment.StatusDate + secret))`,
 * UTF-8. Every hashed field we get is ASCII (dates, numbers, the merchant code,
 * our numeric customer code), where UTF-8 and windows-1251 (the old API) agree.
 */
export function paynetNotificationHash(n: PaynetNotification, secret: string): string {
  const prepared =
    n.eventDate + n.eventId + n.eventType + n.payment.amount + n.payment.customer + n.payment.externalId + n.payment.id + n.payment.merchant + n.payment.statusDate;
  return createHash("md5").update(prepared + secret, "utf8").digest("base64");
}

/** Constant-time check of the `Hash` header. */
export function verifyPaynetNotificationHash(n: PaynetNotification, header: string | null | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const a = Buffer.from(paynetNotificationHash(n, secret));
  const b = Buffer.from(header.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}
