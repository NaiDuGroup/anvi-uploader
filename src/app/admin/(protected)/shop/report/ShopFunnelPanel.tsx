"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ShopFunnelReport } from "@/lib/shop/analytics/funnel";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

type State = { status: "loading" } | { status: "error" } | { status: "ok"; report: ShopFunnelReport };
type Loaded = { key: string; state: State };

const TOP_ROWS = 15;

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${v.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} %`;
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {note ? <p className="mt-0.5 text-xs text-gray-500">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
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
  return (
    <td className={cn("px-2 py-1.5 align-top", right && "text-right tabular-nums", strong && "font-medium text-gray-900")}>{children}</td>
  );
}

/** Funnel section of the «Сайт: заказы и воронка» report for the chosen period (Chișinău days). */
export default function ShopFunnelPanel({ from, to }: { from: string; to: string }) {
  const { t } = useLanguageStore();
  const f = t.shopFunnel;
  const key = `${from}|${to}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // A new period shows «loading» until its answer arrives.
  const state: State = loaded?.key === key ? loaded.state : { status: "loading" };
  const [allProducts, setAllProducts] = useState(false);
  const [allSources, setAllSources] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const q = new URLSearchParams({ from, to });
    fetch(`/api/admin/shop/funnel?${q.toString()}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setLoaded({ key: `${from}|${to}`, state: { status: "ok", report: (await res.json()) as ShopFunnelReport } });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") setLoaded({ key: `${from}|${to}`, state: { status: "error" } });
      });
    return () => ctrl.abort();
  }, [from, to]);

  const csvHref = `/api/admin/shop/funnel?${new URLSearchParams({ from, to, format: "csv" }).toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{f.title}</h2>
          <p className="text-sm text-gray-500">{f.intro}</p>
          <p className="mt-1 max-w-3xl text-xs text-gray-400">{f.privacyNote}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <a href={csvHref} download>
            <Download className="mr-1.5 h-4 w-4" aria-hidden />
            {f.exportCsv}
          </a>
        </Button>
      </div>

      {state.status === "loading" ? <p className="text-sm text-gray-500">{f.loading}</p> : null}
      {state.status === "error" ? <p className="text-sm text-red-600">{f.loadError}</p> : null}
      {state.status === "ok" && state.report.events === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">{f.empty}</p>
      ) : null}

      {state.status === "ok" && state.report.events > 0 ? (
        <>
          <p className="text-xs text-gray-500">{f.eventsCount(state.report.events)}</p>
          <Card title={f.stepsHeading} note={f.stepsNote}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <Th>{f.colStep}</Th>
                    <Th right>{f.colSessions}</Th>
                    <Th>&nbsp;</Th>
                    <Th right>{f.colFromPrev}</Th>
                    <Th right>{f.colFromStart}</Th>
                    <Th right>{f.colDropped}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {state.report.steps.map((s, i) => {
                    const width = i === 0 ? 100 : Math.min(100, s.fromStart ?? 0);
                    return (
                      <tr key={s.step}>
                        <Td strong>{f.steps[s.step]}</Td>
                        <Td right strong>{s.sessions}</Td>
                        <td className="w-[30%] px-2 py-1.5">
                          <div className="h-2.5 w-full rounded-full bg-gray-100">
                            <div className="h-2.5 rounded-full bg-amber-500" style={{ width: `${Math.max(width, s.sessions > 0 ? 1 : 0)}%` }} />
                          </div>
                        </td>
                        <Td right>{fmtPct(s.fromPrev)}</Td>
                        <Td right>{fmtPct(s.fromStart)}</Td>
                        <Td right>{i === 0 ? "—" : s.dropped}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title={f.productsHeading} note={f.productsNote}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <Th>{f.colProduct}</Th>
                    <Th right>{f.colViews}</Th>
                    <Th right>{f.colAdds}</Th>
                    <Th right>{f.colAddRate}</Th>
                    <Th right>{f.colCheckouts}</Th>
                    <Th right>{f.colPaid}</Th>
                    <Th right>{f.colLostAtView}</Th>
                    <Th right>{f.colLostAfterAdd}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(allProducts ? state.report.products : state.report.products.slice(0, TOP_ROWS)).map((p) => (
                    <tr key={p.product}>
                      <Td strong>
                        {p.name}
                        {p.name !== p.product ? <span className="ml-1 text-xs font-normal text-gray-400">{p.product}</span> : null}
                      </Td>
                      <Td right>{p.views}</Td>
                      <Td right>{p.adds}</Td>
                      <Td right>{fmtPct(p.addRate)}</Td>
                      <Td right>{p.checkouts}</Td>
                      <Td right>{p.paid}</Td>
                      <Td right strong>{p.lostAtView}</Td>
                      <Td right>{p.lostAfterAdd}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {state.report.products.length > TOP_ROWS ? (
              <button type="button" className="mt-2 text-sm font-medium text-amber-700 hover:underline" onClick={() => setAllProducts((v) => !v)}>
                {allProducts ? f.showLess : f.showAll(state.report.products.length)}
              </button>
            ) : null}
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card title={f.sourcesHeading} note={f.sourcesNote}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="border-b border-gray-100">
                      <tr>
                        <Th>{f.colSource}</Th>
                        <Th>{f.colMedium}</Th>
                        <Th>{f.colCampaign}</Th>
                        <Th right>{f.colSessions}</Th>
                        <Th right>{f.colShare}</Th>
                        <Th right>{f.colPaid}</Th>
                        <Th right>{f.colConversion}</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(allSources ? state.report.sources : state.report.sources.slice(0, TOP_ROWS)).map((s) => (
                        <tr key={`${s.source}|${s.medium}|${s.campaign}`}>
                          <Td strong>{s.source ?? <span className="text-gray-500">{f.direct}</span>}</Td>
                          <Td>{s.medium ?? "—"}</Td>
                          <Td>{s.campaign ?? "—"}</Td>
                          <Td right>{s.sessions}</Td>
                          <Td right>{fmtPct(s.share)}</Td>
                          <Td right>{s.paid}</Td>
                          <Td right>{fmtPct(s.conversion)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {state.report.sources.length > TOP_ROWS ? (
                  <button type="button" className="mt-2 text-sm font-medium text-amber-700 hover:underline" onClick={() => setAllSources((v) => !v)}>
                    {allSources ? f.showLess : f.showAll(state.report.sources.length)}
                  </button>
                ) : null}
              </Card>
            </div>
            <Card title={f.devicesHeading}>
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <Th>{f.colDevice}</Th>
                    <Th right>{f.colSessions}</Th>
                    <Th right>{f.colShare}</Th>
                    <Th right>{f.colConversion}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {state.report.devices.map((d) => (
                    <tr key={d.device ?? "unknown"}>
                      <Td strong>{d.device === "mobile" ? f.deviceMobile : d.device === "desktop" ? f.deviceDesktop : f.deviceUnknown}</Td>
                      <Td right>{d.sessions}</Td>
                      <Td right>{fmtPct(d.share)}</Td>
                      <Td right>{fmtPct(d.conversion)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
