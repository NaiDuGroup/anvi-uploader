"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Download, Mail, Phone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { CORPORATE_STATUSES, type CorporateInterest } from "@/lib/corporate/requestRules";
import type { CorporateDetail } from "@/lib/corporate/requests";
import { dateTime, quantityLabel, shortDate, statusClass } from "../corporateUi";

function formatBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function CorporateRequestDetailClient({
  request: r,
  assignees,
}: {
  request: CorporateDetail;
  assignees: { id: string; name: string }[];
}) {
  const { t } = useLanguageStore();
  const c = t.corporate;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState(r.notes ?? "");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setFlash(null);
    const res = await fetch(`/api/admin/corporate-requests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setFlash(res?.ok ? { ok: true, text: c.saved } : { ok: false, text: c.saveFailed });
    if (res?.ok) startTransition(() => router.refresh());
  };

  const contactText = [
    r.companyName,
    r.contactName,
    r.phone,
    r.email,
  ].join("\n");
  const copyContact = async () => {
    try {
      await navigator.clipboard.writeText(contactText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: nothing to do, the contact is on screen.
    }
  };

  const products = r.products.map((p) =>
    p === "other" && r.productsOther ? `${c.productsOther}: ${r.productsOther}` : (c.interests[p as CorporateInterest] ?? p),
  );
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[minmax(110px,160px)_1fr] gap-3 py-2 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-gray-900">{value}</dd>
    </div>
  );

  return (
    <main className={cn("mx-auto max-w-[1600px] px-4 py-6", pending && "opacity-70")}>
      <Link href="/admin/corporate-requests" className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        {c.back}
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">{c.requestTitle(r.number)}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {r.companyName} · {c.receivedAt} {dateTime(r.createdAt)}
          </p>
        </div>
        <span className={cn("self-start rounded-full border px-3 py-1 text-xs font-semibold", statusClass(r.status))}>
          {c.statuses[r.status as keyof typeof c.statuses] ?? r.status}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-5">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{c.contactTitle}</h2>
            <dl className="m-0 divide-y divide-gray-100">
              {row(c.colCompany, <b>{r.companyName}</b>)}
              {row(c.colContact, r.contactName)}
              {row(
                c.phone,
                <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="text-amber-800 hover:underline">
                  {r.phone}
                </a>,
              )}
              {row(
                "E-mail",
                <a href={`mailto:${r.email}`} className="text-amber-800 hover:underline">
                  {r.email}
                </a>,
              )}
              {row(c.formLanguage, r.lang.toUpperCase())}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}>
                  <Phone className="h-4 w-4" />
                  {c.call}
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`mailto:${r.email}?subject=${encodeURIComponent(`ANVI — ${r.number}`)}`}>
                  <Mail className="h-4 w-4" />
                  {c.writeEmail}
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={() => void copyContact()}>
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? c.copied : c.copyContact}
              </Button>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{c.requestBlock}</h2>
            <dl className="m-0 divide-y divide-gray-100">
              {row(c.colProducts, products.join(", "))}
              {row(c.colQuantity, quantityLabel(r.quantity))}
              {row(c.colDeadline, shortDate(r.deadline))}
              {row(c.budget, r.budget || <span className="text-gray-400">{c.noBudget}</span>)}
              {row(c.hasLogo, r.hasLogo ? c.yes : c.no)}
              {row(
                c.message,
                r.message ? <span className="whitespace-pre-wrap">{r.message}</span> : <span className="text-gray-400">{c.noMessage}</span>,
              )}
            </dl>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{c.files}</h2>
            {r.files.length === 0 ? (
              <p className="m-0 text-sm text-gray-400">{c.noFiles}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {r.files.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    <a
                      href={`/api/admin/corporate-requests/${r.id}/files/${i}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <Download className="h-4 w-4 text-gray-500" />
                      <span className="break-all">{f.name}</span>
                      <span className="text-xs text-gray-400">{formatBytes(f.size)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-5">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{c.workTitle}</h2>
            <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              {c.status}
              <select
                value={r.status}
                onChange={(e) => void patch({ status: e.target.value })}
                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
              >
                {CORPORATE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {c.statuses[s]}
                  </option>
                ))}
              </select>
            </label>
            {r.statusChangedAt ? (
              <p className="-mt-1 mb-3 text-xs text-gray-500">
                {c.statusChangedAt}: {dateTime(r.statusChangedAt)}
              </p>
            ) : null}
            <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              {c.assignee}
              <select
                value={r.assigneeId ?? ""}
                onChange={(e) => void patch({ assigneeId: e.target.value || null })}
                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
              >
                <option value="">{c.assigneeNone}</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              {c.notes}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={c.notesPlaceholder}
                rows={6}
                maxLength={10000}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm font-normal"
              />
            </label>
            <div className="mt-3 flex items-center gap-3">
              <Button size="sm" onClick={() => void patch({ notes })} disabled={notes === (r.notes ?? "")}>
                {c.saveNotes}
              </Button>
              {flash ? (
                <span role="status" className={cn("text-sm", flash.ok ? "text-emerald-700" : "text-red-700")}>
                  {flash.text}
                </span>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            {r.matchedClient ? (
              <Button asChild className="w-full">
                <Link href={`/admin/orders/new?clientId=${encodeURIComponent(r.matchedClient.id)}`}>
                  <Plus className="h-4 w-4" />
                  {c.createOrderForClient(r.matchedClient.name || r.companyName)}
                </Link>
              </Button>
            ) : (
              <>
                <p className="mb-3 text-sm text-gray-600">{c.noClientHint}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => void copyContact()}>
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    {copied ? c.copied : c.copyContact}
                  </Button>
                  <Button asChild size="sm">
                    <Link href="/admin/orders/new">
                      <Plus className="h-4 w-4" />
                      {c.createOrder}
                    </Link>
                  </Button>
                </div>
              </>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
