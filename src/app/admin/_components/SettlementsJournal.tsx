"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetcher } from "@/lib/swr/fetcher";
import { useDebounce } from "@/hooks/useDebounce";
import { AUDIT_ACTIONS, type AuditLogResponse } from "@/lib/settlements/auditTypes";
import type { SettlementExtraLabels } from "@/lib/settlements/checkLabels";
import { cn } from "@/lib/utils";

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Europe/Chisinau",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * «Журнал». `idno` fixed = compact block on the counterparty card (last
 * entries, link to the full journal); otherwise the full filterable view.
 */
export default function SettlementsJournal({
  X,
  money,
  idno: fixedIdno,
  initialIdno,
  refreshKey,
  names,
}: {
  X: SettlementExtraLabels;
  money: (n: number) => string;
  idno?: string;
  initialIdno?: string;
  refreshKey?: number;
  names?: ReadonlyMap<string, string>;
}) {
  const J = X.journal;
  const actionLabel = (e: { action: string; details: Record<string, unknown> | null }) =>
    e.action === "unconfirm" && e.details?.previousStatus === "rejected"
      ? J.unrejectAction
      : ((J.actions as Record<string, string>)[e.action] ?? e.action);
  const compact = Boolean(fixedIdno);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [user, setUser] = useState("");
  const [idnoInput, setIdnoInput] = useState(initialIdno ?? "");
  const debouncedIdno = useDebounce(idnoInput.trim(), 300);
  const idno = fixedIdno ?? debouncedIdno;

  const qs = new URLSearchParams();
  if (idno) qs.set("idno", idno);
  if (action) qs.set("action", action);
  if (user) qs.set("user", user);
  qs.set("page", String(page));
  qs.set("pageSize", compact ? "10" : "50");
  if (refreshKey) qs.set("r", String(refreshKey));
  const { data, isLoading, error } = useSWR<AuditLogResponse>(
    `/api/admin/settlements/journal?${qs.toString()}`,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const selectCls =
    "h-9 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-800 focus:border-gray-400 focus:outline-none";

  const partyCell = (v: string | null) =>
    v ? (
      <Link href={`/admin/bookkeeping/settlements/${encodeURIComponent(v)}`} className="hover:underline">
        <span className="block text-gray-900">{names?.get(v) ?? v}</span>
        {names?.get(v) ? <span className="block text-[11px] text-gray-400">{v}</span> : null}
      </Link>
    ) : (
      <span className="text-gray-400">—</span>
    );

  return (
    <div className={cn(compact ? "rounded-xl border border-gray-200 bg-white p-3 shadow-sm" : "space-y-3")}>
      {compact ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-medium text-gray-900">{J.recentTitle}</div>
          <Link
            href={`/admin/bookkeeping/settlements?view=journal&idno=${encodeURIComponent(fixedIdno!)}`}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
          >
            {J.openFull}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <>
          <p className="max-w-3xl text-sm text-gray-500">{J.hint}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              className={selectCls}
              aria-label={J.colAction}
            >
              <option value="">{J.allActions}</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {J.actions[a]}
                </option>
              ))}
            </select>
            <select
              value={user}
              onChange={(e) => {
                setUser(e.target.value);
                setPage(1);
              }}
              className={selectCls}
              aria-label={J.colUser}
            >
              <option value="">{J.allUsers}</option>
              <option value="auto">{J.autoUser}</option>
              {(data?.users ?? []).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <div className="relative sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={idnoInput}
                onChange={(e) => {
                  setIdnoInput(e.target.value);
                  setPage(1);
                }}
                placeholder={J.idnoFilter}
                className="h-9 pl-8 text-xs"
              />
            </div>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : null}
          </div>
        </>
      )}

      {error ? (
        <p className="text-sm text-rose-700">{X.checks.unavailable}</p>
      ) : !data ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : data.entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">{J.empty}</p>
      ) : (
        <>
          {/* Phone / compact: list */}
          <ul
            className={cn(
              "divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white",
              !compact && "md:hidden",
            )}
          >
            {data.entries.map((e) => (
              <li key={e.id} className="px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">
                    {formatAt(e.at)} · {e.userName ?? J.autoUser}
                  </span>
                  {e.amount != null ? <span className="shrink-0 tabular-nums text-gray-800">{money(e.amount)}</span> : null}
                </div>
                <div className="font-medium text-gray-900">
                  {actionLabel(e)}
                  {!compact && e.counterpartyIdno ? (
                    <Link
                      href={`/admin/bookkeeping/settlements/${encodeURIComponent(e.counterpartyIdno)}`}
                      className="ml-1 font-normal text-gray-500 hover:underline"
                    >
                      · {names?.get(e.counterpartyIdno) ?? e.counterpartyIdno}
                    </Link>
                  ) : null}
                </div>
                {J.details(e.action, e.details) ? (
                  <div className="truncate text-gray-500">{J.details(e.action, e.details)}</div>
                ) : null}
              </li>
            ))}
          </ul>

          {!compact ? (
            <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold text-gray-500">
                  <tr>
                    <th className="px-3 py-2.5 text-left">{J.colAt}</th>
                    <th className="px-3 py-2.5 text-left">{J.colUser}</th>
                    <th className="px-3 py-2.5 text-left">{J.colAction}</th>
                    <th className="px-3 py-2.5 text-left">{J.colParty}</th>
                    <th className="px-3 py-2.5 text-right">{J.colAmount}</th>
                    <th className="px-3 py-2.5 text-left">{J.colDetails}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.entries.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50/60">
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-500">{formatAt(e.at)}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-700">{e.userName ?? J.autoUser}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs font-medium text-gray-900">
                        {actionLabel(e)}
                      </td>
                      <td className="px-3 py-1.5 text-xs">{partyCell(e.counterpartyIdno)}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs tabular-nums text-gray-800">
                        {e.amount != null ? money(e.amount) : ""}
                      </td>
                      <td className="max-w-[28rem] truncate px-3 py-1.5 text-xs text-gray-500" title={J.details(e.action, e.details)}>
                        {J.details(e.action, e.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {/* Full view: page X of Y + total always; compact card block only when it pages. */}
          {pages > 1 || !compact ? (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-gray-600">
              {pages > 1 ? (
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  {J.prev}
                </Button>
              ) : null}
              <span className="tabular-nums">{J.page(Math.min(data.page, pages), pages, data.total)}</span>
              {pages > 1 ? (
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  {J.next}
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
