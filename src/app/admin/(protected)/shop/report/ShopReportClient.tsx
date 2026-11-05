"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateRangeFilter } from "@/app/admin/_components/DateRangeFilter";
import { SHOP_REPORT_CATEGORIES } from "@/lib/shop/lineProduct";
import type { ShopOrdersReport } from "@/lib/shop/report/orders";
import { addDays, dayKeyOf, weekKeyOf, type ShopReportGranularity } from "@/lib/shop/report/period";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import ShopFunnelPanel from "./ShopFunnelPanel";

type State = { status: "loading" } | { status: "error" } | { status: "ok"; report: ShopOrdersReport };

function money(v: number): string {
  return `${v.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MDL`;
}

function Card({ title, note, children, className }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5", className)}>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {note ? <p className="mt-0.5 text-xs text-gray-500">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th className={cn("whitespace-nowrap px-2 py-2 text-xs font-medium uppercase tracking-wide text-gray-500", right ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

function Td({ children, right, strong }: { children: ReactNode; right?: boolean; strong?: boolean }) {
  return <td className={cn("px-2 py-1.5 align-top", right && "text-right tabular-nums", strong && "font-medium text-gray-900")}>{children}</td>;
}

/** Bar of a share (0–1), for the split tables. */
function Bar({ share }: { share: number }) {
  return (
    <div className="h-1.5 w-full min-w-[4rem] rounded-full bg-gray-100">
      <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />
    </div>
  );
}

export default function ShopReportClient() {
  const { t, locale } = useLanguageStore();
  const r = t.shopReport;
  const today = dayKeyOf(new Date());
  const [from, setFrom] = useState(() => addDays(today, -29));
  const [to, setTo] = useState(today);
  const [includeTest, setIncludeTest] = useState(false);
  const [gran, setGran] = useState<ShopReportGranularity>("day");
  const lang = locale === "ro" || locale === "en" ? locale : "ru";
  const key = `${from}|${to}|${includeTest ? 1 : 0}|${lang}`;
  const [loaded, setLoaded] = useState<{ key: string; state: State } | null>(null);
  const state: State = loaded?.key === key ? loaded.state : { status: "loading" };

  useEffect(() => {
    const ctrl = new AbortController();
    const k = `${from}|${to}|${includeTest ? 1 : 0}|${lang}`;
    const q = new URLSearchParams({ from, to, lang, ...(includeTest ? { includeTest: "1" } : {}) });
    fetch(`/api/admin/shop/report?${q.toString()}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setLoaded({ key: k, state: { status: "ok", report: (await res.json()) as ShopOrdersReport } });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") setLoaded({ key: k, state: { status: "error" } });
      });
    return () => ctrl.abort();
  }, [from, to, includeTest, lang]);

  const presets: { label: string; from: string }[] = [
    { label: r.presetToday, from: today },
    { label: r.presetWeek, from: weekKeyOf(today) },
    { label: r.presetMonth, from: `${today.slice(0, 7)}-01` },
    { label: r.preset30, from: addDays(today, -29) },
    { label: r.presetYear, from: `${today.slice(0, 4)}-01-01` },
  ];
  const csvHref = `/api/admin/shop/report?${new URLSearchParams({ from, to, format: "csv", ...(includeTest ? { includeTest: "1" } : {}) }).toString()}`;

  const catName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of SHOP_REPORT_CATEGORIES) m.set(c.slug, locale === "ro" ? c.ro : locale === "en" ? c.en : c.ru);
    return (slug: string | null) => (slug ? (m.get(slug) ?? slug) : r.uncategorized);
  }, [locale, r.uncategorized]);
  const deliveryName = (m: string): string =>
    m === "pickup"
      ? r.deliveryPickup
      : m === "courier_chisinau"
        ? r.deliveryCourierChisinau
        : m === "courier_moldova"
          ? r.deliveryCourierMoldova
          : r.deliveryOther;

  const report = state.status === "ok" ? state.report : null;
  const s = report?.summary;
  const series = report ? report.series[gran].filter((b) => gran !== "day" || b.orders > 0 || report.series.day.length <= 31) : [];

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{r.title}</h2>
          <p className="mt-0.5 max-w-3xl text-sm text-gray-500">{r.intro}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setFrom(p.from);
                setTo(today);
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                from === p.from && to === today ? "border-amber-300 bg-amber-50 text-amber-900" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
              )}
            >
              {p.label}
            </button>
          ))}
          <DateRangeFilter
            dateFrom={from}
            dateTo={to}
            onChange={(f, tt) => {
              if (f) setFrom(f);
              setTo(tt || f || to);
            }}
            locale={locale}
            t={t}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700" title={r.includeTestHint}>
          <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
          {r.includeTest}
          {s && s.testOrders > 0 && !includeTest ? <span className="text-xs text-gray-400">({s.testOrders})</span> : null}
        </label>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <a href={csvHref} download>
            <Download className="mr-1.5 h-4 w-4" aria-hidden />
            {r.exportCsv}
          </a>
        </Button>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-gray-900">
          {r.ordersHeading}
          {includeTest ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">{r.testIncludedBadge}</span> : null}
        </h2>
        {state.status === "loading" ? <p className="text-sm text-gray-500">{r.loading}</p> : null}
        {state.status === "error" ? <p className="text-sm text-red-600">{r.loadError}</p> : null}
        {report && s ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label={r.kpiOrders} value={String(s.orders)} />
              <Kpi label={r.kpiPaidOrders} value={String(s.paid)} />
              <Kpi label={r.kpiRevenue} value={money(s.revenue)} hint={r.kpiRevenueHint} />
              <Kpi label={r.kpiAov} value={money(s.aov)} />
              <Kpi label={r.kpiUnpaid} value={String(s.unpaid)} hint={s.unpaid ? money(s.unpaidAmount) : undefined} />
              <Kpi label={r.kpiDiscount} value={money(s.discount)} hint={s.promoOrders ? `${s.promoOrders} ×` : undefined} />
            </div>
            {s.orders === 0 ? <p className="text-sm text-gray-500">{r.empty}</p> : null}

            <Card title={r.byPeriodHeading}>
              <div className="mb-3 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                {(["day", "week", "month"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGran(g)}
                    className={cn("rounded-md px-3 py-1 text-sm", gran === g ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800")}
                  >
                    {g === "day" ? r.granDay : g === "week" ? r.granWeek : r.granMonth}
                  </button>
                ))}
              </div>
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <Th>{r.colPeriod}</Th>
                      <Th right>{r.colOrders}</Th>
                      <Th right>{r.colPaid}</Th>
                      <Th right>{r.colUnpaid}</Th>
                      <Th right>{r.colRevenue}</Th>
                      <Th right>{r.colAov}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {series.map((b) => (
                      <tr key={b.key}>
                        <Td strong>{gran === "week" ? `${b.key} – ${addDays(b.key, 6)}` : b.key}</Td>
                        <Td right>{b.orders}</Td>
                        <Td right>{b.paid}</Td>
                        <Td right>{b.unpaid}</Td>
                        <Td right>{b.revenue.toLocaleString("ru-RU")}</Td>
                        <Td right>{b.aov ? b.aov.toLocaleString("ru-RU") : "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title={r.deliveryHeading}>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <Th>{r.deliveryHeading}</Th>
                      <Th right>{r.colOrders}</Th>
                      <Th right>{r.colPaid}</Th>
                      <Th right>{r.colRevenue}</Th>
                      <Th>{""}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.delivery.map((d) => (
                      <tr key={d.method}>
                        <Td strong>{deliveryName(d.method)}</Td>
                        <Td right>{d.orders}</Td>
                        <Td right>{d.paid}</Td>
                        <Td right>{d.revenue.toLocaleString("ru-RU")}</Td>
                        <Td>
                          <Bar share={s.orders ? d.orders / s.orders : 0} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <Card title={r.customersHeading} note={r.customersHint}>
                <div className="grid grid-cols-2 gap-3">
                  <Kpi label={r.customersNew} value={String(report.customers.new)} hint={money(report.customers.newRevenue)} />
                  <Kpi label={r.customersReturning} value={String(report.customers.returning)} hint={money(report.customers.returningRevenue)} />
                </div>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title={r.topProductsHeading} note={r.revenueBasisNote}>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <Th>{r.colProduct}</Th>
                      <Th>{r.colCategory}</Th>
                      <Th right>{r.colQty}</Th>
                      <Th right>{r.colRevenue}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.topProducts.map((p) => (
                      <tr key={`${p.slug}|${p.name}`}>
                        <Td strong>{p.name}</Td>
                        <Td>{catName(p.category)}</Td>
                        <Td right>{p.qty}</Td>
                        <Td right>{p.amount.toLocaleString("ru-RU")}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <Card title={r.topCategoriesHeading} note={r.revenueBasisNote}>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <Th>{r.colCategory}</Th>
                      <Th right>{r.colLines}</Th>
                      <Th right>{r.colQty}</Th>
                      <Th right>{r.colRevenue}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.topCategories.map((c) => (
                      <tr key={c.category ?? "-"}>
                        <Td strong>{catName(c.category)}</Td>
                        <Td right>{c.lines}</Td>
                        <Td right>{c.qty}</Td>
                        <Td right>{c.amount.toLocaleString("ru-RU")}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </>
        ) : null}
      </section>

      <ShopFunnelPanel from={from} to={to} />
    </main>
  );
}
