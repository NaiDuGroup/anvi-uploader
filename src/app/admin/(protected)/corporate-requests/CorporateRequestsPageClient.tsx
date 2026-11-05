"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Paperclip, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { CORPORATE_STATUSES, type CorporateInterest } from "@/lib/corporate/requestRules";
import type { listCorporateRequests } from "@/lib/corporate/requests";
import { dateTime, quantityLabel, shortDate, statusClass } from "./corporateUi";

type ListData = Awaited<ReturnType<typeof listCorporateRequests>>;

export default function CorporateRequestsPageClient({
  data,
  assignees,
  filters,
}: {
  data: ListData | null;
  assignees: { id: string; name: string }[];
  filters: { status: string; q: string; assignee: string };
}) {
  const { t } = useLanguageStore();
  const c = t.corporate;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [rowError, setRowError] = useState<string | null>(null);
  const assigneeName = new Map(assignees.map((a) => [a.id, a.name]));

  const go = (patch: Partial<{ status: string; q: string; assignee: string; page: number }>) => {
    const next = { ...filters, page: 1, ...patch };
    const sp = new URLSearchParams();
    if (next.status && next.status !== "open") sp.set("status", next.status);
    if (next.q.trim()) sp.set("q", next.q.trim());
    if (next.assignee) sp.set("assignee", next.assignee);
    if (next.page > 1) sp.set("page", String(next.page));
    const qs = sp.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  };

  // Search as you type (debounced).
  useEffect(() => {
    if (q === filters.q) return;
    const h = setTimeout(() => go({ q }), 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const changeStatus = async (id: string, status: string) => {
    setRowError(null);
    const res = await fetch(`/api/admin/corporate-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (!res?.ok) {
      setRowError(c.saveFailed);
      return;
    }
    startTransition(() => router.refresh());
  };

  const openCount = data ? data.counts.new + data.counts.in_work + data.counts.offer_sent : 0;
  const allCount = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  const chips: { key: string; label: string; count: number }[] = [
    { key: "open", label: c.filterOpen, count: openCount },
    ...CORPORATE_STATUSES.map((s) => ({ key: s, label: c.statuses[s], count: data?.counts[s] ?? 0 })),
    { key: "all", label: c.filterAll, count: allCount },
  ];
  const productsText = (products: string[]) =>
    products.map((p) => c.interests[p as CorporateInterest] ?? p).join(", ");

  return (
    <main className={cn("mx-auto max-w-[1600px] px-4 py-6", pending && "opacity-70")}>
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-gray-900">{c.listTitle}</h1>
        <p className="mt-1 text-sm text-gray-500">{c.listIntro}</p>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {chips.map((ch) => (
          <button
            key={ch.key}
            type="button"
            onClick={() => go({ status: ch.key })}
            aria-pressed={filters.status === ch.key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filters.status === ch.key
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
            )}
          >
            {ch.label}
            <span className="rounded-full bg-gray-100 px-1.5 text-[11px] text-gray-600">{ch.count}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.searchPlaceholder} className="pl-10" />
        </div>
        <select
          value={filters.assignee}
          onChange={(e) => go({ assignee: e.target.value })}
          className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
          aria-label={c.colAssignee}
        >
          <option value="">{c.assigneeAll}</option>
          <option value="none">{c.assigneeNone}</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {data ? <span className="text-sm text-gray-500">{c.totalCount(data.total)}</span> : null}
      </div>

      {!data ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {c.loadError}
        </div>
      ) : data.rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">{c.empty}</div>
      ) : (
        <>
          {rowError ? (
            <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              {rowError}
            </div>
          ) : null}
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">{c.colNumber}</th>
                  <th className="px-4 py-3">{c.colDate}</th>
                  <th className="px-4 py-3">{c.colCompany}</th>
                  <th className="px-4 py-3">{c.colContact}</th>
                  <th className="px-4 py-3">{c.colProducts}</th>
                  <th className="px-4 py-3">{c.colQuantity}</th>
                  <th className="px-4 py-3">{c.colDeadline}</th>
                  <th className="px-4 py-3">{c.colAssignee}</th>
                  <th className="px-4 py-3">{c.colStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3 font-semibold">
                      <Link href={`/admin/corporate-requests/${r.id}`} className="text-amber-800 hover:underline">
                        {r.number}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{dateTime(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/corporate-requests/${r.id}`} className="font-medium text-gray-900 hover:underline">
                        {r.companyName}
                      </Link>
                      {r.fileCount ? (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-gray-500" title={c.filesCount(r.fileCount)}>
                          <Paperclip className="h-3 w-3" />
                          {r.fileCount}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>{r.contactName}</div>
                      <div className="text-xs text-gray-500">{r.phone}</div>
                    </td>
                    <td className="max-w-[260px] px-4 py-3 text-gray-700">{productsText(r.products)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{quantityLabel(r.quantity)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{shortDate(r.deadline)}</td>
                    <td className="px-4 py-3 text-gray-700">{r.assigneeId ? (assigneeName.get(r.assigneeId) ?? "—") : "—"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={r.status}
                        onChange={(e) => void changeStatus(r.id, e.target.value)}
                        className={cn("rounded-full border px-2 py-1 text-xs font-medium", statusClass(r.status))}
                        aria-label={c.colStatus}
                      >
                        {CORPORATE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {c.statuses[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
            {data.rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/admin/corporate-requests/${r.id}`} className="min-w-0">
                    <div className="text-xs text-gray-500">
                      № {r.number} · {dateTime(r.createdAt)}
                    </div>
                    <div className="truncate font-semibold text-gray-900">{r.companyName}</div>
                    <div className="text-sm text-gray-600">
                      {r.contactName} · {r.phone}
                    </div>
                  </Link>
                  <select
                    value={r.status}
                    onChange={(e) => void changeStatus(r.id, e.target.value)}
                    className={cn("shrink-0 rounded-full border px-2 py-1 text-xs font-medium", statusClass(r.status))}
                    aria-label={c.colStatus}
                  >
                    {CORPORATE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {c.statuses[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 text-sm text-gray-700">{productsText(r.products)}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {c.colQuantity}: {quantityLabel(r.quantity)} · {c.colDeadline}: {shortDate(r.deadline)}
                </div>
              </li>
            ))}
          </ul>

          {data.pageCount > 1 ? (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => go({ page: data.page - 1 })}>
                <ChevronLeft className="h-4 w-4" />
                {c.prev}
              </Button>
              <span className="text-gray-600">{c.pageOf(data.page, data.pageCount)}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= data.pageCount}
                onClick={() => go({ page: data.page + 1 })}
              >
                {c.next}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
