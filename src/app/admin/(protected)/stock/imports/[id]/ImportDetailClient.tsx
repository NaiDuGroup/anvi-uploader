"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { AlertTriangle, ArrowLeft, ExternalLink, FileText, Link2, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import {
  IMPORT_COST_KINDS,
  IMPORT_DOCUMENT_KINDS,
  IMPORT_DOCUMENT_MAX_BYTES,
  IMPORT_STATUSES,
  type ImportCostKind,
  type ImportDocumentKind,
  type ImportPostingMode,
} from "@/lib/imports/constants";
import type {
  ImportDetailJson,
  ImportLineJson,
  ImportListItemJson,
  ImportProposalJson,
  ImportProposalsJson,
} from "@/lib/imports/dto";
import { parsePrintMethods, PRINT_METHODS, PrintMethod } from "@/lib/stock/unified/printMethods";
import { errorText, formatMdl, importFetch, importSwrFetcher } from "@/app/admin/_components/imports/importsApi";
import { ImportStatusBadge, MissingDocumentsBadge } from "@/app/admin/_components/imports/ImportBadges";

const card = "rounded-xl border border-gray-200 bg-white p-4 shadow-sm";
const h2 = "mb-3 text-sm font-semibold text-gray-900";
const selectClass =
  "h-8 rounded-md border border-gray-200 bg-white px-2 text-xs shadow-sm focus:border-gray-300 focus:outline-none disabled:opacity-60";

type HeaderForm = {
  supplierName: string;
  supplierOrderNo: string;
  proformaNo: string;
  brokerName: string;
  declarationNo: string;
  trackingNo: string;
  currency: string;
  orderedAt: string;
  arrivedAt: string;
  status: string;
  notes: string;
  relatedImportId: string;
};

function formOf(d: ImportDetailJson): HeaderForm {
  return {
    supplierName: d.supplierName,
    supplierOrderNo: d.supplierOrderNo ?? "",
    proformaNo: d.proformaNo ?? "",
    brokerName: d.brokerName ?? "",
    declarationNo: d.declarationNo ?? "",
    trackingNo: d.trackingNo ?? "",
    currency: d.currency,
    orderedAt: d.orderedAt ?? "",
    arrivedAt: d.arrivedAt ?? "",
    status: d.status,
    notes: d.notes ?? "",
    relatedImportId: d.relatedImport?.id ?? "",
  };
}

type ReadResult = { lines: number; matched: number; warnings: string[] };

export default function ImportDetailClient({ id }: { id: string }) {
  const { t } = useLanguageStore();
  const ti = t.imports;
  const router = useRouter();
  const url = `/api/admin/imports/${id}`;
  const { data, error, mutate } = useSWR<ImportDetailJson>(url, importSwrFetcher);
  const { data: list } = useSWR<{ imports: ImportListItemJson[] }>("/api/admin/imports", importSwrFetcher);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [readResult, setReadResult] = useState<ReadResult | null>(null);

  const fail = (e: unknown) => setMessage({ ok: false, text: errorText(e, ti.errors, ti.errorFallback) });

  /** Run an API call that answers with the fresh detail. */
  async function act(tag: string, call: () => Promise<ImportDetailJson>, ok?: string): Promise<boolean> {
    setBusy(tag);
    setMessage(null);
    try {
      const next = await call();
      await mutate(next, { revalidate: false });
      if (ok) setMessage({ ok: true, text: ok });
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (error) return <Shell title={ti.title}><p className="text-sm text-red-600">{errorText(error, ti.errors, ti.loadFailed)}</p></Shell>;
  if (!data) {
    return (
      <Shell title={ti.title}>
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {ti.loading}
        </p>
      </Shell>
    );
  }

  const posted: boolean = data.postedMode != null;
  const title: string = [data.supplierOrderNo ?? data.proformaNo ?? ti.header.title, data.supplierName].join(" · ");

  return (
    <Shell title={title}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ImportStatusBadge status={data.status} postedMode={data.postedMode} />
        <MissingDocumentsBadge missing={data.missingDocuments} />
        {data.costing.provisional && (
          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{ti.post.provisionalNote}</span>
        )}
      </div>
      {message && <p className={cn("mb-4 text-sm", message.ok ? "text-emerald-700" : "text-red-600")}>{message.text}</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <HeaderCard
          key={`${data.id}:${data.status}:${data.postedMode}`}
          data={data}
          imports={list?.imports ?? []}
          busy={busy}
          onSave={(form) =>
            act(
              "header",
              () =>
                importFetch<ImportDetailJson>(url, {
                  method: "PATCH",
                  body: JSON.stringify({
                    ...form,
                    status: posted ? undefined : form.status,
                    orderedAt: form.orderedAt || null,
                    arrivedAt: form.arrivedAt || null,
                    relatedImportId: form.relatedImportId || null,
                  }),
                }),
              ti.header.saved,
            )
          }
          onDelete={async () => {
            if (!window.confirm(ti.header.confirmDelete)) return;
            try {
              await importFetch(url, { method: "DELETE" });
              router.push("/admin/stock/imports");
            } catch (e) {
              fail(e);
            }
          }}
        />
        <div className="grid content-start gap-4">
          <DocumentsCard
            data={data}
            busy={busy}
            act={act}
            onRead={async (documentId) => {
              setBusy("read");
              setMessage(null);
              setReadResult(null);
              try {
                const res = await importFetch<{ detail: ImportDetailJson; read: ReadResult }>(`${url}/lines/from-document`, {
                  method: "POST",
                  body: JSON.stringify({ documentId }),
                });
                await mutate(res.detail, { revalidate: false });
                setReadResult(res.read);
              } catch (e) {
                fail(e);
              } finally {
                setBusy(null);
              }
            }}
          />
          <CostsCard data={data} busy={busy} act={act} />
        </div>
      </div>

      <LinesCard data={data} busy={busy} act={act} readResult={readResult} />
      <PostCard data={data} busy={busy} act={act} />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const ti = useLanguageStore((s) => s.t.imports);
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <Link href="/admin/stock/imports" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" />
        {ti.back}
      </Link>
      <h1 className="mb-3 text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
      {children}
    </main>
  );
}

type Act = (tag: string, call: () => Promise<ImportDetailJson>, ok?: string) => Promise<boolean>;

// ─── Header + nuances ────────────────────────────────────────────────────────

function HeaderCard({
  data,
  imports,
  busy,
  onSave,
  onDelete,
}: {
  data: ImportDetailJson;
  imports: ImportListItemJson[];
  busy: string | null;
  onSave: (form: HeaderForm) => Promise<boolean>;
  onDelete: () => void;
}) {
  const ti = useLanguageStore((s) => s.t.imports);
  const [form, setForm] = useState<HeaderForm>(() => formOf(data));
  const posted: boolean = data.postedMode != null;
  const set = (k: keyof HeaderForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const field = (k: keyof HeaderForm, label: string, type = "text") => (
    <label className="text-xs text-gray-600">
      {label}
      <Input className="mt-1 h-8 text-sm" type={type} value={form[k]} onChange={set(k)} />
    </label>
  );
  return (
    <section className={card}>
      <h2 className={h2}>{ti.header.title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("supplierName", ti.header.supplierName)}
        {field("supplierOrderNo", ti.header.supplierOrderNo)}
        {field("proformaNo", ti.header.proformaNo)}
        {field("brokerName", ti.header.brokerName)}
        {field("declarationNo", ti.header.declarationNo)}
        {field("trackingNo", ti.header.trackingNo)}
        {field("orderedAt", ti.header.orderedAt, "date")}
        {field("arrivedAt", ti.header.arrivedAt, "date")}
        <label className="text-xs text-gray-600">
          {ti.header.currency}
          <Input className="mt-1 h-8 text-sm uppercase" maxLength={3} value={form.currency} onChange={set("currency")} />
        </label>
        <label className="text-xs text-gray-600">
          {ti.header.status}
          <select className={cn(selectClass, "mt-1 block h-8 w-full text-sm")} value={form.status} onChange={set("status")} disabled={posted}>
            {IMPORT_STATUSES.filter((s) => s !== "posted" || posted).map((s) => (
              <option key={s} value={s}>
                {ti.statuses[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 grid gap-3">
        <label className="text-xs text-gray-600">
          {ti.notes.title}
          <textarea
            className="mt-1 block min-h-[88px] w-full rounded-md border border-gray-200 px-3 py-2 text-sm shadow-sm focus:border-gray-300 focus:outline-none"
            placeholder={ti.notes.placeholder}
            value={form.notes}
            onChange={set("notes")}
          />
        </label>
        <label className="text-xs text-gray-600">
          {ti.notes.related}
          <select className={cn(selectClass, "mt-1 block h-8 w-full text-sm")} value={form.relatedImportId} onChange={set("relatedImportId")}>
            <option value="">{ti.notes.relatedNone}</option>
            {imports
              .filter((i) => i.id !== data.id)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {[i.orderedAt, i.supplierOrderNo ?? i.proformaNo, i.supplierName].filter(Boolean).join(" · ")}
                </option>
              ))}
          </select>
        </label>
        {data.relatedImport && (
          <Link href={`/admin/stock/imports/${data.relatedImport.id}`} className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline">
            <Link2 className="h-3.5 w-3.5" />
            {data.relatedImport.label}
          </Link>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy === "header" || !form.supplierName.trim()} onClick={() => void onSave(form)}>
          {busy === "header" && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          {busy === "header" ? ti.header.saving : ti.header.save}
        </Button>
        {!posted && (
          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={onDelete}>
            {ti.header.delete}
          </Button>
        )}
      </div>
    </section>
  );
}

// ─── Documents ───────────────────────────────────────────────────────────────

function DocumentsCard({
  data,
  busy,
  act,
  onRead,
}: {
  data: ImportDetailJson;
  busy: string | null;
  act: Act;
  onRead: (documentId: string) => Promise<void>;
}) {
  const ti = useLanguageStore((s) => s.t.imports);
  const base = `/api/admin/imports/${data.id}`;
  const [kind, setKind] = useState<ImportDocumentKind>(data.documents.length === 0 ? "proforma" : "declaration");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const posted: boolean = data.postedMode != null;

  async function upload(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setUploadError(null);
    for (const file of Array.from(files)) {
      if (file.size > IMPORT_DOCUMENT_MAX_BYTES) {
        setUploadError(`${file.name}: ${ti.docs.tooLarge}`);
        continue;
      }
      await act("upload", async () => {
        const { fileKey, uploadUrl } = await importFetch<{ fileKey: string; uploadUrl: string }>(`${base}/documents/presign`, {
          method: "POST",
          body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size }),
        });
        const put = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!put.ok) throw new Error("upload_failed");
        return importFetch<ImportDetailJson>(`${base}/documents`, {
          method: "POST",
          body: JSON.stringify({ kind, fileKey, fileName: file.name, contentType: file.type || null, sizeBytes: file.size }),
        });
      });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className={card}>
      <h2 className={h2}>{ti.docs.title}</h2>
      {data.missingDocuments.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold">{ti.docs.missingTitle}: </span>
            {data.missingDocuments.map((m) => ti.requiredDocs[m]).join(", ")}
          </span>
        </div>
      )}
      {data.documents.length === 0 ? (
        <p className="mb-3 text-xs text-gray-500">{ti.docs.empty}</p>
      ) : (
        <ul className="mb-3 divide-y divide-gray-100">
          {data.documents.map((d) => {
            const fileUrl = `${base}/documents/${d.id}/file`;
            const isPdf: boolean = (d.contentType ?? "").includes("pdf") || d.fileName.toLowerCase().endsWith(".pdf");
            const supplierDoc: boolean = d.kind === "proforma" || d.kind === "invoice";
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                <a href={fileUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-gray-900 hover:underline" title={d.fileName}>
                  {d.fileName}
                </a>
                <select
                  aria-label={ti.docs.kind}
                  className={selectClass}
                  value={d.kind}
                  onChange={(e) =>
                    void act("doc", () =>
                      importFetch<ImportDetailJson>(`${base}/documents/${d.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ kind: e.target.value }),
                      }),
                    )
                  }
                >
                  {IMPORT_DOCUMENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ti.docKinds[k]}
                    </option>
                  ))}
                </select>
                {supplierDoc && isPdf && !posted && (
                  <Button size="sm" variant="outline" disabled={busy === "read"} onClick={() => void onRead(d.id)}>
                    {busy === "read" && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    {ti.docs.readLines}
                  </Button>
                )}
                <a href={`${fileUrl}?download=1`} className="text-xs text-gray-500 hover:text-gray-800">
                  {ti.docs.download}
                </a>
                <button
                  type="button"
                  aria-label={ti.docs.remove}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  onClick={() => {
                    if (!window.confirm(ti.docs.confirmRemove(d.fileName))) return;
                    void act("doc", () => importFetch<ImportDetailJson>(`${base}/documents/${d.id}`, { method: "DELETE" }));
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={ti.docs.kind} className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as ImportDocumentKind)}>
          {IMPORT_DOCUMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {ti.docKinds[k]}
            </option>
          ))}
        </select>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
        <Button size="sm" variant="outline" disabled={busy === "upload"} onClick={() => fileRef.current?.click()}>
          {busy === "upload" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
          {busy === "upload" ? ti.docs.uploading : ti.docs.upload}
        </Button>
      </div>
      {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
    </section>
  );
}

// ─── Costs ───────────────────────────────────────────────────────────────────

function CostsCard({ data, busy, act }: { data: ImportDetailJson; busy: string | null; act: Act }) {
  const { t, locale } = useLanguageStore();
  const ti = t.imports;
  const base = `/api/admin/imports/${data.id}/costs`;
  const patch = (costId: string, body: Record<string, unknown>) =>
    void act("cost", () => importFetch<ImportDetailJson>(`${base}/${costId}`, { method: "PATCH", body: JSON.stringify(body) }));
  const used: Set<string> = new Set(data.costs.map((c) => c.kind));
  const nextKind: ImportCostKind = IMPORT_COST_KINDS.find((k) => !used.has(k)) ?? "other";

  return (
    <section className={card}>
      <h2 className={h2}>{ti.costs.title}</h2>
      {data.costs.length === 0 ? (
        <p className="mb-3 text-xs text-gray-500">{ti.costs.empty}</p>
      ) : (
        <div className="mb-3 space-y-2">
          {data.costs.map((c) => (
            <div key={c.id} className={cn("grid gap-2 rounded-lg border border-gray-100 p-2 sm:grid-cols-[1.2fr_1fr_auto]", c.excluded && "opacity-70")}>
              <select className={cn(selectClass, "h-8 w-full text-sm")} value={c.kind} onChange={(e) => patch(c.id, { kind: e.target.value })}>
                {IMPORT_COST_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ti.costKinds[k]}
                  </option>
                ))}
              </select>
              <Input
                key={`${c.id}:${c.amountMdl}`}
                aria-label={ti.costs.amount}
                className={cn("h-8 text-right text-sm tabular-nums", c.excluded && "line-through")}
                inputMode="decimal"
                defaultValue={String(c.amountMdl)}
                onBlur={(e) => {
                  const v = Number.parseFloat(e.target.value.replace(",", ".").replace(/\s/g, ""));
                  if (Number.isFinite(v) && v >= 0 && Math.abs(v - c.amountMdl) > 0.001) patch(c.id, { amountMdl: v });
                }}
              />
              <button
                type="button"
                aria-label={ti.costs.remove}
                className="justify-self-end rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                onClick={() => void act("cost", () => importFetch<ImportDetailJson>(`${base}/${c.id}`, { method: "DELETE" }))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-700" title={ti.costs.provisionalHint}>
                  <input type="checkbox" checked={c.isProvisional} onChange={(e) => patch(c.id, { isProvisional: e.target.checked })} />
                  {ti.costs.provisional}
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-700" title={ti.costs.excludedHint}>
                  <input type="checkbox" checked={c.excluded} onChange={(e) => patch(c.id, { excluded: e.target.checked })} />
                  {ti.costs.excluded}
                </label>
                <Input
                  key={`${c.id}:note:${c.note ?? ""}`}
                  aria-label={ti.costs.note}
                  placeholder={ti.costs.note}
                  className="h-7 min-w-[10rem] flex-1 text-xs"
                  defaultValue={c.note ?? ""}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== (c.note ?? "")) patch(c.id, { note: e.target.value.trim() || null });
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={busy === "cost"}
        onClick={() =>
          void act("cost", () => importFetch<ImportDetailJson>(base, { method: "POST", body: JSON.stringify({ kind: nextKind, amountMdl: 0 }) }))
        }
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        {ti.costs.add}
      </Button>
      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-sm">
        <dt className="font-semibold text-gray-900">{ti.costs.total}</dt>
        <dd className="text-right font-semibold tabular-nums text-gray-900">{formatMdl(data.costing.totalCostsMdl, locale)} лей</dd>
        <dt className="text-gray-600">{ti.costs.purchase}</dt>
        <dd className="text-right tabular-nums text-gray-700">{formatMdl(data.costing.purchaseCostsMdl, locale)} лей</dd>
        {data.costing.goodsAmount > 0 && (
          <>
            <dt className="text-gray-600">{ti.costs.perCurrency(data.currency)}</dt>
            <dd className="text-right tabular-nums text-gray-700">{formatMdl(data.costing.landedPerCurrencyUnit, locale, 4)}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

// ─── Lines ───────────────────────────────────────────────────────────────────

type VariantOption = { id: string; sku: string; supplierCode: string | null; name: string; label: string | null; categoryName: string; isActive: boolean };
type CategoryOption = { id: string; code: string; nameRu: string };

function LinesCard({ data, busy, act, readResult }: { data: ImportDetailJson; busy: string | null; act: Act; readResult: ReadResult | null }) {
  const { t, locale } = useLanguageStore();
  const ti = t.imports;
  const costing = useMemo(() => new Map(data.costing.lines.map((c) => [c.id, c])), [data.costing.lines]);
  const [openLine, setOpenLine] = useState<{ id: string; mode: "link" | "create" } | null>(null);
  const notLinked: number = data.lines.filter((l) => !l.skip && !l.variant).length;
  const posted: boolean = data.postedMode != null;
  const [modelsOpen, setModelsOpen] = useState<boolean>(false);
  const totals = data.lines.reduce(
    (s, l) => ({ qty: s.qty + l.quantity, amount: s.amount + l.amount, landed: s.landed + (costing.get(l.id)?.landedTotalMdl ?? 0) }),
    { qty: 0, amount: 0, landed: 0 },
  );
  const money = (n: number, d = 2) => formatMdl(n, locale, d);

  return (
    <section className={cn(card, "mt-4")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{ti.lines.title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {notLinked > 0 && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{ti.lines.notLinked(notLinked)}</span>}
          {notLinked > 0 && !posted && !modelsOpen && (
            <Button size="sm" onClick={() => setModelsOpen(true)} disabled={busy != null}>
              {ti.models.open(notLinked)}
            </Button>
          )}
        </div>
      </div>
      {modelsOpen && !posted && <ModelsPanel importId={data.id} busy={busy} act={act} onClose={() => setModelsOpen(false)} />}
      {busy === "read" && (
        <p className="mb-3 flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          {ti.lines.reading}
        </p>
      )}
      {readResult && (
        <div className={cn("mb-3 rounded-md px-3 py-2 text-xs", readResult.warnings.length ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800")}>
          <p className="font-medium">{ti.lines.readResult(readResult.lines, readResult.matched)}</p>
          {readResult.warnings.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {readResult.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {data.lines.length === 0 ? (
        <p className="text-sm text-gray-500">{ti.lines.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-xs">
            <thead className="bg-gray-50 text-left font-semibold text-gray-600">
              <tr>
                <th className="px-2 py-2">{ti.lines.photo}</th>
                <th className="px-2 py-2">{ti.lines.code}</th>
                <th className="px-2 py-2">{ti.lines.description}</th>
                <th className="px-2 py-2 text-right">{ti.lines.qty}</th>
                <th className="px-2 py-2 text-right">{ti.lines.price(data.currency)}</th>
                <th className="px-2 py-2 text-right">{ti.lines.amount(data.currency)}</th>
                <th className="px-2 py-2">{ti.lines.item}</th>
                <th className="px-2 py-2 text-right">{ti.lines.purchaseUnit}</th>
                <th className="px-2 py-2 text-right">{ti.lines.landedUnit}</th>
                <th className="px-2 py-2 text-right">{ti.lines.landedTotal}</th>
                <th className="px-2 py-2 text-right">{ti.lines.x2}</th>
                <th className="px-2 py-2 text-right">{ti.lines.x25}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.lines.map((l) => {
                const c = costing.get(l.id);
                const open = openLine?.id === l.id ? openLine.mode : null;
                return (
                  <tr key={l.id} className={cn("align-top", l.skip && "bg-gray-50 text-gray-500")}>
                    <td className="px-2 py-1.5">
                      <LinePhoto line={l} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-gray-800">{l.supplierCode}</td>
                    <td className="max-w-[16rem] px-2 py-1.5 text-gray-800">{l.description}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.quantity}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{money(l.unitPrice, 4)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{money(l.amount)}</td>
                    <td className="min-w-[15rem] px-2 py-1.5">
                      <LineItemCell
                        importId={data.id}
                        line={l}
                        posted={posted || l.receiptId != null}
                        open={open}
                        setOpen={(mode) => setOpenLine(mode ? { id: l.id, mode } : null)}
                        busy={busy}
                        act={act}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{c ? money(c.purchaseUnitMdl) : "—"}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-gray-900">{c ? money(c.landedUnitMdl) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{c ? money(c.landedTotalMdl) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{c ? money(c.landedUnitMdl * 2) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{c ? money(c.landedUnitMdl * 2.5) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-gray-200 font-semibold text-gray-900">
              <tr>
                <td className="px-2 py-2" colSpan={3}>
                  {ti.lines.total}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{totals.qty}</td>
                <td />
                <td className="px-2 py-2 text-right tabular-nums">{money(totals.amount)}</td>
                <td colSpan={3} />
                <td className="px-2 py-2 text-right tabular-nums">{money(totals.landed)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

/** Stock item photo, else (or when it fails to load) the supplier photo. */
function LinePhoto({ line }: { line: ImportLineJson }) {
  const sources: string[] = [publicAssetUrlFromStorageKey(line.variant?.imageUrl), line.supplierImageUrl].filter(
    (s): s is string => !!s,
  );
  const [index, setIndex] = useState(0);
  const src: string | undefined = sources[index];
  if (!src) return <span className="block h-10 w-10 rounded bg-gray-100" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={src} src={src} alt="" loading="lazy" className="h-10 w-10 rounded object-contain" onError={() => setIndex((i) => i + 1)} />
  );
}

function LineItemCell({
  importId,
  line,
  posted,
  open,
  setOpen,
  busy,
  act,
}: {
  importId: string;
  line: ImportLineJson;
  posted: boolean;
  open: "link" | "create" | null;
  setOpen: (mode: "link" | "create" | null) => void;
  busy: string | null;
  act: Act;
}) {
  const { t, locale } = useLanguageStore();
  const ti = t.imports;
  const lineUrl = `/api/admin/imports/${importId}/lines/${line.id}`;
  const patch = (body: Record<string, unknown>) =>
    act("line", () => importFetch<ImportDetailJson>(lineUrl, { method: "PATCH", body: JSON.stringify(body) }));

  if (open === "link") return <LinkPicker line={line} onPick={async (variantId) => { if (await patch({ variantId, skip: false })) setOpen(null); }} onClose={() => setOpen(null)} />;
  if (open === "create") {
    return (
      <CreateItemForm
        line={line}
        busy={busy === "create"}
        onClose={() => setOpen(null)}
        onCreate={async (body) => {
          const ok = await act("create", async () => {
            const res = await importFetch<{ detail: ImportDetailJson }>(`${lineUrl}/create-item`, { method: "POST", body: JSON.stringify(body) });
            return res.detail;
          });
          if (ok) setOpen(null);
        }}
      />
    );
  }

  if (line.variant) {
    return (
      <div className="space-y-0.5">
        <p className="font-medium text-gray-900">
          {line.variant.name}
          {line.variant.label ? ` · ${line.variant.label}` : ""}
        </p>
        <p className="text-[11px] text-gray-500">
          {line.variant.categoryName} · {line.variant.sku} · {ti.lines.onStock(formatMdl(line.variant.stockQuantity, locale, 0))}
        </p>
        {!posted && (
          <div className="flex gap-2 text-[11px]">
            <button type="button" className="text-sky-700 hover:underline" onClick={() => setOpen("link")}>
              {ti.lines.change}
            </button>
            <button type="button" className="text-gray-500 hover:underline" onClick={() => void patch({ variantId: null })}>
              {ti.lines.unlink}
            </button>
          </div>
        )}
      </div>
    );
  }
  if (line.skip) {
    return (
      <div className="text-[11px]">
        <span className="italic">{ti.lines.skipped}</span>
        {!posted && (
          <button type="button" className="ml-2 text-sky-700 hover:underline" onClick={() => void patch({ skip: false })}>
            {ti.lines.cancel}
          </button>
        )}
      </div>
    );
  }
  if (posted) return <span className="text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setOpen("link")}>
        {ti.lines.link}
      </Button>
      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setOpen("create")}>
        {ti.lines.createItem}
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-gray-500" onClick={() => void patch({ skip: true })}>
        {ti.lines.skip}
      </Button>
    </div>
  );
}

function useVariantOptions(q: string) {
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(h);
  }, [q]);
  return useSWR<{ variants: VariantOption[]; categories: CategoryOption[] }>(
    `/api/admin/imports/variant-options?q=${encodeURIComponent(debounced)}`,
    importSwrFetcher,
    { keepPreviousData: true },
  );
}

function LinkPicker({ line, onPick, onClose }: { line: ImportLineJson; onPick: (variantId: string) => Promise<void>; onClose: () => void }) {
  const ti = useLanguageStore((s) => s.t.imports);
  const [q, setQ] = useState(line.description.split(" ").slice(0, 2).join(" "));
  const { data } = useVariantOptions(q);
  return (
    <div className="space-y-1 rounded-md border border-sky-200 bg-sky-50/40 p-2">
      <div className="flex items-center gap-1">
        <Input autoFocus className="h-7 text-xs" placeholder={ti.lines.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" aria-label={ti.lines.cancel} className="rounded p-1 text-gray-500 hover:bg-gray-100" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="max-h-48 overflow-y-auto">
        {(data?.variants ?? []).length === 0 && q.trim() && <li className="px-1 py-1 text-[11px] text-gray-500">{ti.lines.nothingFound}</li>}
        {(data?.variants ?? []).map((v) => (
          <li key={v.id}>
            <button
              type="button"
              className={cn("w-full rounded px-1 py-1 text-left text-[11px] hover:bg-white", !v.isActive && "opacity-60")}
              onClick={() => void onPick(v.id)}
            >
              <span className="font-medium text-gray-900">
                {v.name}
                {v.label ? ` · ${v.label}` : ""}
              </span>
              <span className="block text-gray-500">
                {v.categoryName} · {v.sku}
                {v.supplierCode && v.supplierCode !== v.sku ? ` · ${v.supplierCode}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateItemForm({
  line,
  busy,
  onClose,
  onCreate,
}: {
  line: ImportLineJson;
  busy: boolean;
  onClose: () => void;
  onCreate: (body: { categoryId: string; nameRu: string; withPhoto: boolean }) => Promise<void>;
}) {
  const ti = useLanguageStore((s) => s.t.imports);
  const { data } = useVariantOptions("");
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState(line.description);
  const [withPhoto, setWithPhoto] = useState(line.supplierImageUrl != null);
  return (
    <div className="space-y-1.5 rounded-md border border-emerald-200 bg-emerald-50/40 p-2">
      <select className={cn(selectClass, "h-7 w-full")} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label={ti.lines.category}>
        <option value="">{ti.lines.category}…</option>
        {(data?.categories ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.nameRu}
          </option>
        ))}
      </select>
      <Input className="h-7 text-xs" aria-label={ti.lines.name} value={name} onChange={(e) => setName(e.target.value)} />
      {line.supplierImageUrl && (
        <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-700">
          <input type="checkbox" checked={withPhoto} onChange={(e) => setWithPhoto(e.target.checked)} />
          {ti.lines.withPhoto}
          <a href={line.supplierImageUrl} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-gray-700" aria-label={ti.lines.photo}>
            <ExternalLink className="h-3 w-3" />
          </a>
        </label>
      )}
      <div className="flex gap-1">
        <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy || !categoryId || !name.trim()} onClick={() => void onCreate({ categoryId, nameRu: name.trim(), withPhoto })}>
          {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {ti.lines.create}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onClose}>
          {ti.lines.cancel}
        </Button>
      </div>
    </div>
  );
}

// ─── Posting ─────────────────────────────────────────────────────────────────

function PostCard({ data, busy, act }: { data: ImportDetailJson; busy: string | null; act: Act }) {
  const { t, locale } = useLanguageStore();
  const ti = t.imports;
  const [mode, setMode] = useState<ImportPostingMode>("normal");
  const base = `/api/admin/imports/${data.id}`;
  const posted = data.postedMode === "normal" || data.postedMode === "historical" ? data.postedMode : null;
  const changedAfterPost: boolean =
    posted != null &&
    data.lines.some((l) => {
      const c = data.costing.lines.find((x) => x.id === l.id);
      return !l.skip && l.variant && c && l.postedUnitCostMdl != null && Math.abs(l.postedUnitCostMdl - c.landedUnitMdl) > 0.005;
    });
  const post = (m: ImportPostingMode) =>
    void act("post", () => importFetch<ImportDetailJson>(`${base}/post`, { method: "POST", body: JSON.stringify({ mode: m }) }), ti.statuses.posted);

  return (
    <section className={cn(card, "mt-4")}>
      <h2 className={h2}>{ti.post.title}</h2>
      {posted ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-800">
            {ti.post.posted(ti.postedModes[posted], data.postedAt ? new Date(data.postedAt).toLocaleString(locale) : "")}
          </p>
          {changedAfterPost && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{ti.post.changedAfterPost}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy === "post"} onClick={() => post(posted)}>
              {busy === "post" && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {ti.post.repost}
            </Button>
            {posted === "normal" && (
              <Button
                size="sm"
                variant="outline"
                className="text-red-600"
                disabled={busy === "unpost"}
                onClick={() => {
                  if (!window.confirm(ti.post.confirmUnpost)) return;
                  void act("unpost", () => importFetch<ImportDetailJson>(`${base}/unpost`, { method: "POST" }));
                }}
              >
                {ti.post.unpost}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {(["normal", "historical"] as const).map((m) => (
              <label
                key={m}
                className={cn(
                  "flex cursor-pointer gap-2 rounded-lg border p-3 text-sm",
                  mode === m ? "border-gold bg-amber-50/40" : "border-gray-200 hover:bg-gray-50",
                )}
              >
                <input type="radio" name="post-mode" className="mt-0.5" checked={mode === m} onChange={() => setMode(m)} />
                <span>
                  <span className="block font-medium text-gray-900">{m === "normal" ? ti.post.normal : ti.post.historical}</span>
                  <span className="block text-xs text-gray-600">{m === "normal" ? ti.post.normalHint : ti.post.historicalHint}</span>
                </span>
              </label>
            ))}
          </div>
          <Button
            disabled={busy === "post" || data.lines.length === 0}
            onClick={() => {
              if (!window.confirm(ti.post.confirmPost(ti.postedModes[mode]))) return;
              post(mode);
            }}
          >
            {busy === "post" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {ti.post.post}
          </Button>
        </div>
      )}
    </section>
  );
}

type ProposalDraft = {
  checked: boolean;
  categoryId: string;
  nameRu: string;
  nameRo: string;
  /** Effective methods shown as ticks; saved as [] while equal to the category's. */
  methods: PrintMethod[];
};

type BulkResult = { sku: string; ok: boolean; error?: "sku_taken" | "line_already_linked" | "create_failed" };

/** «Разобрать по моделям»: proposed items for the unlinked lines, edited and created in one go. */
function ModelsPanel({ importId, busy, act, onClose }: { importId: string; busy: string | null; act: Act; onClose: () => void }) {
  const { t } = useLanguageStore();
  const ti = t.imports;
  const tm = ti.models;
  const s = t.stock;
  const { data, error, mutate } = useSWR<ImportProposalsJson>(`/api/admin/imports/${importId}/proposals`, importSwrFetcher, {
    revalidateOnFocus: false,
  });
  // Only edited rows are stored; the rest show the proposal as it came.
  const [edits, setEdits] = useState<Record<string, ProposalDraft>>({});
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const categoryMethods = useMemo(
    () => new Map((data?.categories ?? []).map((c) => [c.id, c.printMethods])),
    [data?.categories],
  );

  const draftOf = (p: ImportProposalJson): ProposalDraft =>
    edits[p.key] ?? {
      checked: p.categoryId != null,
      categoryId: p.categoryId ?? "",
      nameRu: p.nameRu,
      nameRo: p.nameRo,
      methods: p.printMethods.length > 0 ? p.printMethods : parsePrintMethods(categoryMethods.get(p.categoryId ?? "") ?? []),
    };
  const patch = (p: ImportProposalJson, change: Partial<ProposalDraft>) =>
    setEdits((prev) => ({ ...prev, [p.key]: { ...draftOf(p), ...change } }));

  const proposals: ImportProposalJson[] = data?.proposals ?? [];
  const ready = proposals.filter((p) => {
    const d = draftOf(p);
    return d.checked && d.categoryId && d.nameRu.trim();
  });
  const allChecked: boolean = proposals.length > 0 && proposals.every((p) => draftOf(p).checked);
  const creating: boolean = busy === "bulk-create";
  const label = (m: PrintMethod) => (m === PrintMethod.Dtf ? s.dtfBadge : m === PrintMethod.Uv ? s.uvBadge : s.sublimationBadge);

  async function createAll() {
    setResults(null);
    const items = ready.map((p) => {
      const d = draftOf(p);
      const base: PrintMethod[] = parsePrintMethods(categoryMethods.get(d.categoryId) ?? []);
      const same: boolean = d.methods.length === base.length && d.methods.every((m) => base.includes(m));
      return {
        sku: p.sku,
        categoryId: d.categoryId,
        nameRu: d.nameRu.trim(),
        nameRo: d.nameRo.trim() || d.nameRu.trim(),
        nameEn: p.nameEn,
        printMethods: same ? [] : d.methods,
        photoCode: p.photoCode,
        variants: p.variants.map((v) => ({ lineId: v.lineId, sku: v.sku, label: v.label, options: v.options })),
      };
    });
    let got: BulkResult[] = [];
    const ok = await act("bulk-create", async () => {
      const res = await importFetch<{ results: BulkResult[]; detail: ImportDetailJson }>(
        `/api/admin/imports/${importId}/lines/bulk-create`,
        { method: "POST", body: JSON.stringify({ items }) },
      );
      got = res.results;
      return res.detail;
    });
    if (ok) {
      setResults(got);
      await mutate();
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="max-w-3xl">
          <h3 className="text-sm font-semibold text-gray-900">{tm.title}</h3>
          <p className="mt-0.5 text-xs text-gray-600">{tm.hint}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onClose} disabled={creating}>
          {tm.close}
        </Button>
      </div>

      {results && (
        <div className="mb-2 rounded-md bg-white px-3 py-2 text-xs">
          <p className="font-medium text-emerald-700">{tm.created(results.filter((r) => r.ok).length)}</p>
          {results.some((r) => !r.ok) && (
            <div className="mt-1 text-red-700">
              {tm.failed}
              <ul className="list-disc pl-4">
                {results
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={r.sku}>
                      <span className="font-mono">{r.sku}</span> — {r.error ? tm.errors[r.error] : tm.errors.create_failed}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-600">{errorText(error, ti.errors, ti.loadFailed)}</p>
      ) : !data ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tm.loading}
        </p>
      ) : proposals.length === 0 ? (
        <p className="text-sm text-gray-600">{tm.empty}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
            <table className="w-full min-w-[980px] text-xs">
              <thead className="bg-gray-50 text-left font-semibold text-gray-600">
                <tr>
                  <th className="px-2 py-2">
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={(e) =>
                          setEdits(Object.fromEntries(proposals.map((p) => [p.key, { ...draftOf(p), checked: e.target.checked }])))
                        }
                        disabled={creating}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {tm.selectAll}
                    </label>
                  </th>
                  <th className="px-2 py-2">{tm.colItem}</th>
                  <th className="px-2 py-2">{tm.colCategory}</th>
                  <th className="px-2 py-2">{tm.colName}</th>
                  <th className="px-2 py-2">{tm.colPrint}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {proposals.map((p) => {
                  const d = draftOf(p);
                  return (
                    <tr key={p.key} className={cn(!d.checked && "opacity-50")}>
                      <td className="px-2 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={d.checked}
                          onChange={(e) => patch(p, { checked: e.target.checked })}
                          disabled={creating}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="flex items-start gap-2">
                          {p.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- supplier photo, shown as is
                            <img src={p.photoUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded object-contain" />
                          ) : (
                            <span className="block h-12 w-12 shrink-0 rounded bg-gray-100" />
                          )}
                          <div>
                            <div className="font-mono text-[11px] text-gray-800">{p.sku}</div>
                            <div className="text-gray-500">
                              {tm.pieces(p.quantity)}
                              {p.variants.length > 1 ? ` · ${tm.sizes(p.variants.length)}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <select
                          className={cn(selectClass, "w-44", !d.categoryId && "border-amber-400")}
                          value={d.categoryId}
                          onChange={(e) =>
                            patch(p, {
                              categoryId: e.target.value,
                              checked: d.checked || e.target.value !== "",
                              methods: parsePrintMethods(categoryMethods.get(e.target.value) ?? []),
                            })
                          }
                          disabled={creating}
                        >
                          <option value="">{tm.chooseCategory}</option>
                          {data.categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nameRu}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <Input
                          value={d.nameRu}
                          onChange={(e) => patch(p, { nameRu: e.target.value })}
                          disabled={creating}
                          className="h-8 w-72 text-xs"
                        />
                        <Input
                          value={d.nameRo}
                          onChange={(e) => patch(p, { nameRo: e.target.value })}
                          disabled={creating}
                          className="mt-1 h-7 w-72 text-[11px] text-gray-600"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {PRINT_METHODS.map((m) => (
                            <label key={m} className="inline-flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={d.methods.includes(m)}
                                onChange={(e) =>
                                  patch(p, {
                                    methods: PRINT_METHODS.filter((x) => (x === m ? e.target.checked : d.methods.includes(x))),
                                  })
                                }
                                disabled={creating}
                                className="h-3.5 w-3.5 rounded border-gray-300"
                              />
                              {label(m)}
                            </label>
                          ))}
                        </div>
                        {d.methods.length === 0 && <p className="mt-0.5 text-[11px] text-gray-400">{tm.printEmpty}</p>}
                        {p.printNote === "no_sublimation" && d.categoryId === p.categoryId && (
                          <p className="mt-0.5 max-w-[220px] text-[11px] text-indigo-700">{tm.noSublimation}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={createAll} disabled={ready.length === 0 || busy != null}>
              {creating && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {tm.createSelected(ready.length)}
            </Button>
            {creating && <span className="text-xs text-gray-600">{tm.creating}</span>}
          </div>
        </>
      )}
    </div>
  );
}
