"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DateRangeFilter } from "@/app/admin/_components/DateRangeFilter";
import { PRODUCT_TYPE_UI } from "@/app/admin/_components/workshopBoard/productTypeUi";
import { ADMIN_STATUSES } from "@/app/admin/_lib/orderStatus";
import { addDays, dayKeyOf } from "@/lib/shop/report/period";
import {
  TERMINAL_STATUSES,
  UNKNOWN_USER_ID,
  WAITING_CLIENT_STATUSES,
  formatDurationSec,
  isWaitingClientStatus,
  share,
  slowestStatus,
  visibleStatusRows,
  type DurationStats,
} from "@/lib/workshopAnalytics/pure";
import type { StatusTimeRow, WorkshopAnalyticsReport } from "@/lib/workshopAnalytics/types";
import { isBoardSectionKey } from "@/lib/workshopBoard/types";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

type State = { status: "loading" } | { status: "error" } | { status: "ok"; report: WorkshopAnalyticsReport };

const LINE_STATUSES = ["WAITING", "NEEDS_LAYOUT", "PRINTING", "DONE"] as const;

function pct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`;
}

function fmtDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(locale === "ro" ? "ro-RO" : locale === "en" ? "en-GB" : "ru-RU", {
    timeZone: "Europe/Chisinau",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Card({ title, note, children, className }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5", className)}>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {note ? <p className="mt-0.5 text-xs text-gray-500">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone === "warn" ? "text-red-600" : "text-gray-900")}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return (
    <th className={cn("whitespace-nowrap px-2 py-2 text-xs font-medium uppercase tracking-wide text-gray-500", right ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

function Td({ children, right, strong }: { children?: ReactNode; right?: boolean; strong?: boolean }) {
  return <td className={cn("px-2 py-1.5 align-top", right && "text-right tabular-nums", strong && "font-medium text-gray-900")}>{children}</td>;
}

function Bar({ value, tone = "amber" }: { value: number; tone?: "amber" | "red" | "sky" | "gray" }) {
  const color = tone === "red" ? "bg-red-500" : tone === "sky" ? "bg-sky-500" : tone === "gray" ? "bg-gray-300" : "bg-amber-500";
  return (
    <div className="h-1.5 w-full min-w-[3rem] rounded-full bg-gray-100">
      <div className={cn("h-1.5 rounded-full", color)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

function Table({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full text-sm text-gray-700">{children}</table>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-gray-400">{text}</p>;
}

export default function WorkshopAnalyticsClient() {
  const { t, locale } = useLanguageStore();
  const w = t.workshopAnalytics;
  const today = dayKeyOf(new Date());
  const [from, setFrom] = useState(() => addDays(today, -29));
  const [to, setTo] = useState(today);
  const [includeTest, setIncludeTest] = useState(false);
  const [level, setLevel] = useState<"order" | "line">("order");
  const [section, setSection] = useState<string | null>(null);
  const key = `${from}|${to}|${includeTest ? 1 : 0}`;
  const [loaded, setLoaded] = useState<{ key: string; state: State } | null>(null);
  const state: State = loaded?.key === key ? loaded.state : { status: "loading" };

  useEffect(() => {
    const ctrl = new AbortController();
    const k = `${from}|${to}|${includeTest ? 1 : 0}`;
    const q = new URLSearchParams({ from, to, ...(includeTest ? { includeTest: "1" } : {}) });
    fetch(`/api/admin/workshop-analytics?${q.toString()}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setLoaded({ key: k, state: { status: "ok", report: (await res.json()) as WorkshopAnalyticsReport } });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") setLoaded({ key: k, state: { status: "error" } });
      });
    return () => ctrl.abort();
  }, [from, to, includeTest]);

  const presets = [
    { label: w.preset7, from: addDays(today, -6) },
    { label: w.preset30, from: addDays(today, -29) },
    { label: w.preset90, from: addDays(today, -89) },
  ];

  const sectionName = useMemo(
    () => (key: string) => {
      if (isBoardSectionKey(key)) return PRODUCT_TYPE_UI[key].label(t);
      if (key === "mixed") return w.sectionMixed;
      if (key === "set_box") return t.giftSet.typeLabel;
      return key;
    },
    [t, w.sectionMixed],
  );
  const statusName = (s: string): string =>
    (t.statuses as Record<string, string>)[s] ?? (t.lineStatus as unknown as Record<string, string>)[s] ?? s;
  const dur = (sec: number | null | undefined) => formatDurationSec(sec, w.durUnits);

  const report = state.status === "ok" ? state.report : null;

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-gray-900">{w.title}</h2>
          <p className="mt-0.5 max-w-3xl text-sm text-gray-500">{w.intro}</p>
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
        <label className="inline-flex items-center gap-2 text-sm text-gray-700" title={w.excludeTestHint}>
          <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={!includeTest} onChange={(e) => setIncludeTest(!e.target.checked)} />
          {w.excludeTest}
        </label>
        {report ? (
          <p className="text-xs text-gray-500 sm:max-w-[60%] sm:text-right">
            {w.dataNote(fmtDate(report.logSince.orderLog, locale), fmtDate(report.logSince.lineStatus, locale))}
          </p>
        ) : null}
      </div>

      {state.status === "loading" ? <p className="text-sm text-gray-500">{w.loading}</p> : null}
      {state.status === "error" ? <p className="text-sm text-red-600">{w.loadError}</p> : null}

      {report ? (
        <>
          {/* 1. KPI */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label={w.kpiCreated} value={String(report.kpi.created)} />
            <Kpi label={w.kpiDelivered} value={String(report.kpi.delivered)} hint={w.kpiDeliveredHint} />
            <Kpi
              label={w.kpiProblems}
              value={pct(share(report.kpi.problemOrders, report.kpi.created))}
              hint={`${report.kpi.problemOrders} · ${w.kpiProblemsHint}`}
              tone={share(report.kpi.problemOrders, report.kpi.created) > 0.05 ? "warn" : undefined}
            />
            <Kpi label={w.kpiUrgent} value={pct(share(report.kpi.urgentOrders, report.kpi.created))} hint={String(report.kpi.urgentOrders)} />
            <Kpi label={w.kpiLead} value={dur(report.kpi.leadDelivered.medianSec)} hint={w.kpiLeadHint} />
            <Kpi label={w.kpiReady} value={dur(report.kpi.leadReady.medianSec)} hint={w.kpiReadyHint} />
          </div>

          {/* 2. Time in status */}
          <StatusTimeCard
            report={report}
            level={level}
            setLevel={setLevel}
            section={section}
            setSection={setSection}
            sectionName={sectionName}
            statusName={statusName}
            dur={dur}
          />

          {/* 3. File problems */}
          <Card title={w.fileHeading} note={w.fileNote}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              <MiniStat label={w.kpiProblems} value={`${report.fileProblems.problemOrders} (${pct(share(report.fileProblems.problemOrders, report.kpi.created))})`} />
              <MiniStat
                label={w.problemsFile}
                value={`${report.fileProblems.fileOrders} (${pct(share(report.fileProblems.fileOrders, report.fileProblems.problemOrders))})`}
                hint={w.problemsFileHint}
              />
              <MiniStat
                label={w.problemsOther}
                value={`${report.fileProblems.otherOrders} (${pct(share(report.fileProblems.otherOrders, report.fileProblems.problemOrders))})`}
                hint={w.problemsOtherHint}
              />
              <MiniStat label={w.issueOrders} value={String(report.fileProblems.issueOrders)} />
              <MiniStat label={w.flaggedOrders} value={String(report.fileProblems.flaggedOrders)} />
              <MiniStat label={w.issueTime} value={dur(report.fileProblems.issueTime.medianSec)} />
              <MiniStat
                label={w.lineResolve}
                value={dur(report.fileProblems.lineResolve.medianSec)}
                hint={report.fileProblems.lineFlags ? `${w.lineFlags}: ${report.fileProblems.lineFlags}` : undefined}
              />
            </div>
            <div className="mt-5 grid gap-6 lg:grid-cols-3">
              <div className="min-w-0">
                <h4 className="mb-2 text-sm font-semibold text-gray-800">{w.byReason}</h4>
                {report.fileProblems.reasons.length === 0 ? (
                  <Empty text={w.noData} />
                ) : (
                  <Table>
                    <thead>
                      <tr className="border-b border-gray-100">
                        <Th>{w.colReason}</Th>
                        <Th>{w.colSource}</Th>
                        <Th right>{w.count}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.fileProblems.reasons.map((r) => (
                        <tr key={`${r.source}|${r.code}`} className="border-b border-gray-50">
                          <Td strong>
                            {r.source === "line"
                              ? ((t.layoutIssue.reasons as Record<string, string>)[r.code] ?? r.code)
                              : ((t.admin.issueReasons as Record<string, string>)[r.code] ?? r.code)}
                          </Td>
                          <Td>{r.source === "line" ? w.reasonSourceLine : w.reasonSourceOrder}</Td>
                          <Td right>{r.count}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
                {report.fileProblems.customTexts.length > 0 ? (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-medium text-gray-500">{w.customTexts}</p>
                    <ul className="space-y-1 text-xs text-gray-600">
                      {report.fileProblems.customTexts.map((c) => (
                        <li key={c.text} className="flex gap-2">
                          <span className="min-w-0 flex-1 break-words">«{c.text}»</span>
                          <span className="shrink-0 tabular-nums text-gray-400">×{c.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="min-w-0">
                <h4 className="mb-2 text-sm font-semibold text-gray-800">{w.bySection}</h4>
                <ProblemTable
                  rows={report.fileProblems.bySection.map((r) => ({ key: r.section, name: sectionName(r.section), orders: r.orders, problems: r.problems }))}
                  nameCol={w.colSection}
                  w={w}
                />
              </div>
              <div className="min-w-0">
                <h4 className="mb-2 text-sm font-semibold text-gray-800">{w.byDealer}</h4>
                <ProblemTable
                  rows={report.fileProblems.byDealer.map((r) => ({ key: r.clientId, name: r.name, orders: r.orders, problems: r.problems }))}
                  nameCol={w.colDealer}
                  w={w}
                />
              </div>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            {/* 4. Rework */}
            <Card title={w.reworkHeading} note={w.reworkNote}>
              {report.rework.rows.length === 0 ? (
                <Empty text={w.noData} />
              ) : (
                <Table>
                  <thead>
                    <tr className="border-b border-gray-100">
                      <Th>{w.colSection}</Th>
                      <Th right>{w.colReplaced}</Th>
                      <Th right>{w.colLayoutFixed}</Th>
                      <Th right>{w.colSwaps}</Th>
                      <Th right>{w.colDealerEdits}</Th>
                      <Th right>{w.colReworkOrders}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rework.rows.map((r) => (
                      <tr key={r.section} className="border-b border-gray-50">
                        <Td strong>{sectionName(r.section)}</Td>
                        <Td right>{r.fileReplaced}</Td>
                        <Td right>{r.layoutFixed}</Td>
                        <Td right>{r.fileSwaps}</Td>
                        <Td right>{r.dealerEdits}</Td>
                        <Td right>
                          {r.reworkOrders}
                          {r.orders > 0 ? <span className="ml-1 text-xs text-gray-400">({pct(share(r.reworkOrders, r.orders))})</span> : null}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            {/* 5. Cancellations */}
            <Card title={w.cancelHeading} note={w.cancelNote}>
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label={w.deletedByStaff} value={String(report.cancellations.deleted)} />
                <MiniStat label={w.cancelledByDealer} value={String(report.cancellations.cancelledByDealer)} />
                <MiniStat label={w.restored} value={String(report.cancellations.restored)} />
              </div>
              {report.cancellations.byStage.length > 0 ? (
                <div className="mt-4">
                  <Table>
                    <thead>
                      <tr className="border-b border-gray-100">
                        <Th>{w.colStage}</Th>
                        <Th right>{w.deletedByStaff}</Th>
                        <Th right>{w.cancelledByDealer}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.cancellations.byStage.map((r) => (
                        <tr key={r.stage} className="border-b border-gray-50">
                          <Td strong>{statusName(r.stage)}</Td>
                          <Td right>{r.deleted}</Td>
                          <Td right>{r.cancelledByDealer}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ) : null}
            </Card>
          </div>

          {/* 6. Load */}
          <LoadCard report={report} sectionName={sectionName} locale={locale} />

          <div className="grid gap-6 xl:grid-cols-2">
            {/* 7. Urgent */}
            <Card title={w.urgentHeading} note={w.urgentNote}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MiniStat label={w.urgentShare} value={pct(share(report.urgent.orders, report.kpi.created))} hint={String(report.urgent.orders)} />
                <MiniStat label={w.leadUrgent} value={dur(report.urgent.leadUrgent.medianSec)} hint={statsHint(report.urgent.leadUrgent, w, dur)} />
                <MiniStat label={w.leadNormal} value={dur(report.urgent.leadNormal.medianSec)} hint={statsHint(report.urgent.leadNormal, w, dur)} />
              </div>
            </Card>

            {/* 8. Staff */}
            <Card title={w.staffHeading} note={w.staffNote}>
              {report.staff.length === 0 ? (
                <Empty text={w.noData} />
              ) : (
                <Table>
                  <thead>
                    <tr className="border-b border-gray-100">
                      <Th>{w.colUser}</Th>
                      <Th right>{w.colStatusChanges}</Th>
                      <Th right>{w.colLineChanges}</Th>
                      <Th right>{w.colFlags}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.staff.map((r) => (
                      <tr key={r.userId} className="border-b border-gray-50">
                        <Td strong>{r.userId === UNKNOWN_USER_ID ? <span className="text-gray-500">{w.unknownUser}</span> : r.name || "—"}</Td>
                        <Td right>{r.statusChanges}</Td>
                        <Td right>{r.lineChanges}</Td>
                        <Td right>{r.flags}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </main>
  );
}

type Dict = ReturnType<typeof useLanguageStore.getState>["t"]["workshopAnalytics"];

function statsHint(s: DurationStats, w: Dict, dur: (sec: number | null) => string): string | undefined {
  return s.count > 0 ? `${w.p90}: ${dur(s.p90Sec)} · n=${s.count}` : undefined;
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-gray-50 px-3 py-2">
      <p className="break-words text-xs text-gray-500 [hyphens:auto]">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-gray-900">{value}</p>
      {hint ? <p className="text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

function ProblemTable({
  rows,
  nameCol,
  w,
}: {
  rows: { key: string; name: string; orders: number; problems: number }[];
  nameCol: string;
  w: Dict;
}) {
  if (rows.length === 0) return <Empty text={w.noData} />;
  return (
    <Table>
      <thead>
        <tr className="border-b border-gray-100">
          <Th>{nameCol}</Th>
          <Th right>{w.colOrders}</Th>
          <Th right>{w.colProblems}</Th>
          <Th>{w.share}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-gray-50">
            <Td strong>{r.name}</Td>
            <Td right>{r.orders}</Td>
            <Td right>{r.problems}</Td>
            <td className="px-2 py-1.5 align-middle">
              <div className="flex items-center gap-2">
                <Bar value={share(r.problems, r.orders)} tone="red" />
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-gray-500">{pct(share(r.problems, r.orders))}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function StatusTimeCard({
  report,
  level,
  setLevel,
  section,
  setSection,
  sectionName,
  statusName,
  dur,
}: {
  report: WorkshopAnalyticsReport;
  level: "order" | "line";
  setLevel: (l: "order" | "line") => void;
  section: string | null;
  setSection: (s: string | null) => void;
  sectionName: (k: string) => string;
  statusName: (s: string) => string;
  dur: (sec: number | null) => string;
}) {
  const { t } = useLanguageStore();
  const w = t.workshopAnalytics;
  const all = level === "order" ? report.orderStatusTime : report.lineStatusTime;
  const sections = [...new Set(all.filter((r) => r.section != null).map((r) => r.section as string))].sort(
    (a, b) => sectionName(a).localeCompare(sectionName(b)),
  );
  const activeSection = section && sections.includes(section) ? section : null;
  const order: readonly string[] = level === "order" ? ADMIN_STATUSES : LINE_STATUSES;
  const rows: StatusTimeRow[] = visibleStatusRows(all)
    .filter((r) => r.section === activeSection)
    .sort((a, b) => (order.indexOf(a.status) + 100) % 100 - ((order.indexOf(b.status) + 100) % 100));
  const slowest =
    activeSection == null
      ? level === "order"
        ? report.slowestOrderStatus
        : report.slowestLineStatus
      : slowestStatus(rows);
  // Bars scale to work statuses only (client waiting can be days long).
  const maxMedian = Math.max(
    1,
    ...rows.filter((r) => !TERMINAL_STATUSES.includes(r.status) && !WAITING_CLIENT_STATUSES.includes(r.status)).map((r) => r.medianSec ?? 0),
  );

  return (
    <Card title={w.statusTimeHeading} note={w.statusTimeNote}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {(["order", "line"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              className={cn("rounded-md px-3 py-1 text-sm", level === l ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800")}
            >
              {l === "order" ? w.orderLevel : w.lineLevel}
            </button>
          ))}
        </div>
        {sections.length > 0 ? (
          <div className="flex min-w-0 flex-wrap gap-1">
            {[null, ...sections].map((s) => (
              <button
                key={s ?? "all"}
                type="button"
                onClick={() => setSection(s)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  activeSection === s ? "border-amber-300 bg-amber-50 text-amber-900" : "border-gray-200 text-gray-600 hover:bg-gray-50",
                )}
              >
                {s == null ? w.allSections : sectionName(s)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <Empty text={level === "line" ? w.noLineData : w.noData} />
      ) : (
        <Table>
          <thead>
            <tr className="border-b border-gray-100">
              <Th>{w.colStatus}</Th>
              <Th right>{w.median}</Th>
              <Th />
              <Th right>{w.p90}</Th>
              <Th right>{w.count}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSlow = r.status === slowest;
              const waiting = isWaitingClientStatus(r.status);
              return (
                <tr key={r.status} className={cn("border-b border-gray-50", isSlow && "bg-red-50")}>
                  <Td strong>
                    {statusName(r.status)}
                    {isSlow ? <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">{w.slowest}</span> : null}
                    {waiting ? (
                      <span className="ml-2 whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-normal text-gray-500">{w.waitingClient}</span>
                    ) : null}
                  </Td>
                  <Td right strong>{dur(r.medianSec)}</Td>
                  <td className="w-1/3 px-2 py-1.5 align-middle">
                    {!TERMINAL_STATUSES.includes(r.status) ? (
                      <Bar value={Math.min(1, (r.medianSec ?? 0) / maxMedian)} tone={isSlow ? "red" : waiting ? "gray" : "amber"} />
                    ) : null}
                  </td>
                  <Td right>{dur(r.p90Sec)}</Td>
                  <Td right>{r.count}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function LoadCard({
  report,
  sectionName,
  locale,
}: {
  report: WorkshopAnalyticsReport;
  sectionName: (k: string) => string;
  locale: string;
}) {
  const { t } = useLanguageStore();
  const w = t.workshopAnalytics;
  const heatMax = Math.max(1, ...report.load.heatmap.flat());
  // Hours with any orders (keeps the grid narrow at phone width); at least 8–20.
  const usedHours = report.load.heatmap[0]!.map((_, h) => h).filter((h) => report.load.heatmap.some((row) => row[h]! > 0));
  const hFrom = Math.min(8, ...usedHours);
  const hTo = Math.max(20, ...usedHours);
  const hours = Array.from({ length: hTo - hFrom + 1 }, (_, i) => hFrom + i);
  const dayMax = Math.max(1, ...report.load.days.map((d) => Math.max(d.orders, d.lines)));
  const dl = locale === "ro" ? "ro-RO" : locale === "en" ? "en-GB" : "ru-RU";
  const dayLabel = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(dl, { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <Card title={w.loadHeading} note={w.loadNote}>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="min-w-0">
          <h4 className="mb-2 text-sm font-semibold text-gray-800">{w.heatmapTitle}</h4>
          <div className="overflow-x-auto">
            <div
              className="grid gap-0.5 text-[10px] text-gray-500"
              style={{ gridTemplateColumns: `2rem repeat(${hours.length}, minmax(1.1rem, 1fr))` }}
            >
              <div />
              {hours.map((h) => (
                <div key={h} className="text-center tabular-nums">
                  {h}
                </div>
              ))}
              {report.load.heatmap.map((row, d) => (
                <div key={d} className="contents">
                  <div className="pr-1 text-right leading-5">{w.weekdays[d]}</div>
                  {hours.map((h) => {
                    const v = row[h]!;
                    return (
                      <div
                        key={h}
                        title={`${w.weekdays[d]} ${h}:00 — ${v}`}
                        className="h-5 rounded-sm"
                        style={{ backgroundColor: v > 0 ? `rgba(217, 119, 6, ${0.12 + 0.88 * (v / heatMax)})` : "rgb(243 244 246)" }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <h4 className="mb-2 flex flex-wrap items-center gap-3 text-sm font-semibold text-gray-800">
            {w.perDayTitle}
            <span className="inline-flex items-center gap-1 text-xs font-normal text-gray-500">
              <span className="h-2 w-2 rounded-sm bg-amber-500" />
              {w.ordersLegend}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-normal text-gray-500">
              <span className="h-2 w-2 rounded-sm bg-sky-300" />
              {w.linesLegend}
            </span>
          </h4>
          <div className="overflow-x-auto">
            <div className="flex h-40 items-end gap-px" style={{ minWidth: `${report.load.days.length * 8}px` }}>
              {report.load.days.map((d) => (
                <div
                  key={d.day}
                  className="flex h-full flex-1 items-end gap-px"
                  title={w.dayTooltip(dayLabel(d.day), d.orders, d.lines)}
                  role="img"
                  aria-label={w.dayTooltip(dayLabel(d.day), d.orders, d.lines)}
                >
                  <div className="flex-1 rounded-t-sm bg-amber-500" style={{ height: `${(d.orders / dayMax) * 100}%` }} />
                  <div className="flex-1 rounded-t-sm bg-sky-300" style={{ height: `${(d.lines / dayMax) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-gray-400">
              <span>{report.load.days[0] ? dayLabel(report.load.days[0].day) : ""}</span>
              <span>{report.load.days.length ? dayLabel(report.load.days[report.load.days.length - 1]!.day) : ""}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h4 className="mb-2 text-sm font-semibold text-gray-800">{w.sectionsTitle}</h4>
        {report.load.sections.length === 0 ? (
          <Empty text={w.noData} />
        ) : (
          <Table>
            <thead>
              <tr className="border-b border-gray-100">
                <Th>{w.colSection}</Th>
                <Th right>{w.colOrders}</Th>
                <Th right>{w.colLines}</Th>
                <Th right>{w.colPerDay}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(() => {
                const maxLines = Math.max(1, ...report.load.sections.map((s) => s.lines));
                return report.load.sections.map((s) => (
                  <tr key={s.section} className="border-b border-gray-50">
                    <Td strong>{sectionName(s.section)}</Td>
                    <Td right>{s.orders}</Td>
                    <Td right>{s.lines}</Td>
                    <Td right>{(s.lines / Math.max(1, report.period.days)).toLocaleString(dl, { maximumFractionDigits: 1 })}</Td>
                    <td className="w-1/4 px-2 py-1.5 align-middle">
                      <Bar value={s.lines / maxLines} tone="sky" />
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </Table>
        )}
      </div>
    </Card>
  );
}
