/**
 * Funnel math of the admin «Сайт: заказы и воронка» report, over counts the
 * database already aggregated per session (`funnelServer.ts`). Pure.
 *
 * A step counts the SESSIONS (random per-tab ids) that had that event in the
 * period. Sessions are not forced through the steps in order (a paid order
 * page opened from the e-mail is a session of its own), so a later step may
 * exceed an earlier one; rates are then over 100 % and shown as they are.
 */

export const FUNNEL_STEPS = [
  "visit",
  "product_view",
  "add_to_cart",
  "cart_view",
  "checkout_start",
  "payment_start",
  "paid",
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export type FunnelStepCounts = Record<FunnelStep, number>;

export interface FunnelStepRow {
  step: FunnelStep;
  sessions: number;
  /** % of the previous step (null for the first step or when it is 0). */
  fromPrev: number | null;
  /** % of the first step (visits). */
  fromStart: number | null;
  /** Sessions lost since the previous step (≥ 0). */
  dropped: number;
}

/** a / b as a percentage with one decimal; null when b is 0. */
export function pct(a: number, b: number): number | null {
  if (!(b > 0)) return null;
  return Math.round((a / b) * 1000) / 10;
}

export function buildFunnel(counts: Partial<FunnelStepCounts>): FunnelStepRow[] {
  const n = (s: FunnelStep): number => Math.max(0, Math.trunc(counts[s] ?? 0));
  const start = n("visit");
  return FUNNEL_STEPS.map((step, i) => {
    const sessions = n(step);
    const prev = i > 0 ? n(FUNNEL_STEPS[i - 1]!) : null;
    return {
      step,
      sessions,
      fromPrev: prev == null ? null : pct(sessions, prev),
      fromStart: i === 0 ? null : pct(sessions, start),
      dropped: prev == null ? 0 : Math.max(0, prev - sessions),
    };
  });
}

/** Per product: sessions that viewed it, added it, and (of those that added it) reached checkout / paid. */
export interface ProductFunnelInput {
  product: string;
  category: string | null;
  views: number;
  adds: number;
  checkouts: number;
  paid: number;
}

export interface ProductFunnelRow extends ProductFunnelInput {
  name: string;
  /** adds / views, %. */
  addRate: number | null;
  /** checkouts / adds, %. */
  checkoutRate: number | null;
  /** paid / views, %. */
  paidRate: number | null;
  /** Viewed but not added (the main drop-off). */
  lostAtView: number;
  /** Added but no payment. */
  lostAfterAdd: number;
}

/**
 * Product rows with rates, the worst drop-off first: most sessions lost
 * between viewing and adding, then after adding, then by views.
 */
export function productDropOff(
  rows: readonly ProductFunnelInput[],
  names: Readonly<Record<string, string>> = {},
): ProductFunnelRow[] {
  return rows
    .map((r) => ({
      ...r,
      name: names[r.product] ?? r.product,
      addRate: pct(r.adds, r.views),
      checkoutRate: pct(r.checkouts, r.adds),
      paidRate: pct(r.paid, r.views),
      lostAtView: Math.max(0, r.views - r.adds),
      lostAfterAdd: Math.max(0, r.adds - r.paid),
    }))
    .sort(
      (a, b) =>
        b.lostAtView - a.lostAtView ||
        b.lostAfterAdd - a.lostAfterAdd ||
        b.views - a.views ||
        a.product.localeCompare(b.product),
    );
}

/** Sessions by their landing source (first event of the session). */
export interface SourceInput {
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  sessions: number;
  adds: number;
  checkouts: number;
  paid: number;
}

export interface SourceRow {
  /** utm_source, else the referrer domain; null = direct (no referrer, no utm). */
  source: string | null;
  medium: string | null;
  campaign: string | null;
  sessions: number;
  adds: number;
  checkouts: number;
  paid: number;
  /** paid / sessions, %. */
  conversion: number | null;
  /** sessions / all sessions, %. */
  share: number | null;
}

/** Group sessions by source (utm_source wins over the referrer) + medium + campaign; biggest first. */
export function sourceTable(rows: readonly SourceInput[]): SourceRow[] {
  const by = new Map<string, SourceRow>();
  let total = 0;
  for (const r of rows) {
    const source = r.utmSource ?? r.referrer ?? null;
    const medium = r.utmMedium ?? null;
    const campaign = r.utmCampaign ?? null;
    const key = JSON.stringify([source, medium, campaign]);
    const cur = by.get(key) ?? { source, medium, campaign, sessions: 0, adds: 0, checkouts: 0, paid: 0, conversion: null, share: null };
    cur.sessions += r.sessions;
    cur.adds += r.adds;
    cur.checkouts += r.checkouts;
    cur.paid += r.paid;
    by.set(key, cur);
    total += r.sessions;
  }
  return [...by.values()]
    .map((r) => ({ ...r, conversion: pct(r.paid, r.sessions), share: pct(r.sessions, total) }))
    .sort((a, b) => b.sessions - a.sessions || b.paid - a.paid || String(a.source).localeCompare(String(b.source)));
}

export interface DeviceInput {
  device: string | null;
  sessions: number;
  paid: number;
}

export interface DeviceRow {
  /** mobile | desktop | null (unknown). */
  device: string | null;
  sessions: number;
  paid: number;
  share: number | null;
  conversion: number | null;
}

export function deviceSplit(rows: readonly DeviceInput[]): DeviceRow[] {
  const by = new Map<string | null, { sessions: number; paid: number }>();
  for (const r of rows) {
    const d = r.device === "mobile" || r.device === "desktop" ? r.device : null;
    const cur = by.get(d) ?? { sessions: 0, paid: 0 };
    cur.sessions += r.sessions;
    cur.paid += r.paid;
    by.set(d, cur);
  }
  const total = [...by.values()].reduce((s, r) => s + r.sessions, 0);
  const order = (d: string | null) => (d === "mobile" ? 0 : d === "desktop" ? 1 : 2);
  return [...by.entries()]
    .map(([device, r]) => ({ device, ...r, share: pct(r.sessions, total), conversion: pct(r.paid, r.sessions) }))
    .sort((a, b) => order(a.device) - order(b.device));
}

export interface ShopFunnelReport {
  from: string;
  to: string;
  events: number;
  steps: FunnelStepRow[];
  products: ProductFunnelRow[];
  sources: SourceRow[];
  devices: DeviceRow[];
}
