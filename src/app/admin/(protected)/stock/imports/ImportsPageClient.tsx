"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { ImportListItemJson } from "@/lib/imports/dto";
import { errorText, formatMdl, importFetch, importSwrFetcher } from "@/app/admin/_components/imports/importsApi";
import { ImportStatusBadge, MissingDocumentsBadge } from "@/app/admin/_components/imports/ImportBadges";

export default function ImportsPageClient() {
  const { t, locale } = useLanguageStore();
  const ti = t.imports;
  const router = useRouter();
  const { data, error } = useSWR<{ imports: ImportListItemJson[] }>("/api/admin/imports", importSwrFetcher);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("GOR FACTORY S.A.");
  const [supplierOrderNo, setSupplierOrderNo] = useState("");
  const [orderedAt, setOrderedAt] = useState("");

  async function create(): Promise<void> {
    setBusy(true);
    setFormError(null);
    try {
      const res = await importFetch<{ id: string }>("/api/admin/imports", {
        method: "POST",
        body: JSON.stringify({ supplierName, supplierOrderNo: supplierOrderNo || null, orderedAt: orderedAt || null }),
      });
      router.push(`/admin/stock/imports/${res.id}`);
    } catch (e) {
      setFormError(errorText(e, ti.errors, ti.errorFallback));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <Link href="/admin/stock" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" />
        {t.admin.navStock}
      </Link>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{ti.title}</h1>
          <p className="mt-1 text-sm text-gray-600">{ti.subtitle}</p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)} className="self-start">
            <Plus className="mr-1 h-4 w-4" />
            {ti.newImport}
          </Button>
        )}
      </div>

      {creating && (
        <div className="mb-5 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <label className="text-xs text-gray-600">
            {ti.header.supplierName}
            <Input className="mt-1" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          </label>
          <label className="text-xs text-gray-600">
            {ti.header.supplierOrderNo}
            <Input className="mt-1" value={supplierOrderNo} placeholder="4457712-OG" onChange={(e) => setSupplierOrderNo(e.target.value)} />
          </label>
          <label className="text-xs text-gray-600">
            {ti.header.orderedAt}
            <Input className="mt-1" type="date" value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button disabled={busy || !supplierName.trim()} onClick={() => void create()}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {ti.header.create}
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {ti.lines.cancel}
            </Button>
          </div>
          {formError && <p className="text-sm text-red-600 sm:col-span-4">{formError}</p>}
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-600">{errorText(error, ti.errors, ti.loadFailed)}</p>
      ) : !data ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {ti.loading}
        </p>
      ) : data.imports.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">{ti.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
              <tr>
                <th className="px-3 py-2">{ti.cols.date}</th>
                <th className="px-3 py-2">{ti.cols.order}</th>
                <th className="px-3 py-2">{ti.cols.supplier}</th>
                <th className="px-3 py-2 text-right">{ti.cols.goods}</th>
                <th className="px-3 py-2 text-right">{ti.cols.costs}</th>
                <th className="px-3 py-2">{ti.cols.status}</th>
                <th className="px-3 py-2">{ti.cols.documents}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.imports.map((i) => (
                <tr key={i.id} className="cursor-pointer hover:bg-amber-50/40" onClick={() => router.push(`/admin/stock/imports/${i.id}`)}>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-700">{i.orderedAt ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/stock/imports/${i.id}`} className="font-medium text-gray-900 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {i.supplierOrderNo ?? i.proformaNo ?? "—"}
                    </Link>
                    {i.proformaNo && i.supplierOrderNo && <span className="ml-2 text-xs text-gray-500">{i.proformaNo}</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{i.supplierName}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                    {i.linesCount > 0 ? `${formatMdl(i.goodsAmount, locale)} ${i.currency} · ${i.piecesCount} шт` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900">
                    {i.totalCostsMdl > 0 ? formatMdl(i.totalCostsMdl, locale) : "—"}
                    {i.provisional && <span className="ml-1 text-xs text-amber-700">({ti.provisional})</span>}
                  </td>
                  <td className="px-3 py-2">
                    <ImportStatusBadge status={i.status} postedMode={i.postedMode} />
                  </td>
                  <td className="px-3 py-2">
                    <MissingDocumentsBadge missing={i.missingDocuments} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
