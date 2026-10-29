"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Check, ClipboardCheck, Download, Eraser, Loader2, Printer, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import { stockErrorMessage, stockFetch, stockSwrFetcher, StockRequestError } from "@/app/admin/_components/stock/unified/stockApi";
import { localizedStockName, type StockCategoryJson } from "@/lib/stock/unified/adminTypes";
import { buildCsv, countsFromCsv, parseCsv, type StocktakeRowJson } from "@/lib/stock/unified/bulkEdit";
import { isStockUnit, StockUnit } from "@/lib/stock/unified/kinds";
import { formatQuantity, parseQuantityInput, sanitizeQuantityInput } from "@/lib/stock/unified/quantity";
import { stockBulkEn } from "@/lib/i18n/stockBulk/en";
import { stockBulkRo } from "@/lib/i18n/stockBulk/ro";
import { stockBulkRu } from "@/lib/i18n/stockBulk/ru";

/** Typed count plus the book quantity seen when it was typed (sales after that are kept on apply). */
type CountEntry = { text: string; expected: number };
type Draft = { counts: Record<string, CountEntry>; note: string };
type Filter = "all" | "notCounted" | "diff";

const DRAFT_KEY = "anvi-stocktake-draft";
const selectCls = "h-9 rounded-md border border-gray-300 bg-white px-2 text-sm";

/** Header names accepted when a count sheet comes back from Excel (any UI language). */
const CSV_SKU_HEADERS: readonly string[] = ["Артикул", "Cod", "SKU"];
const CSV_COUNTED_HEADERS: readonly string[] = [stockBulkRu.colCounted, stockBulkRo.colCounted, stockBulkEn.colCounted];

function rowUnit(row: StocktakeRowJson): StockUnit {
  return isStockUnit(row.unit) ? row.unit : StockUnit.Pieces;
}

function loadDraft(): Draft | null {
  try {
    const raw: string | null = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return d && typeof d === "object" && d.counts ? d : null;
  } catch {
    return null;
  }
}

function saveDraft(d: Draft): void {
  try {
    if (Object.keys(d.counts).length === 0) window.localStorage.removeItem(DRAFT_KEY);
    else window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // Private mode / storage full: the count still works, it just is not kept across reloads.
  }
}

function today(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function signed(n: number): string {
  return n > 0 ? `+${formatQuantity(n)}` : formatQuantity(n);
}

export default function StocktakePageClient({ initialCategory }: { initialCategory: string | null }) {
  const { t, locale } = useLanguageStore();
  const b = t.stockBulk;
  const s = t.stock;
  const router = useRouter();

  const { data: catData } = useSWR<{ categories: StockCategoryJson[] }>(
    "/api/admin/stock/categories?active=1",
    stockSwrFetcher,
  );
  const categories: StockCategoryJson[] = catData?.categories ?? [];
  const [code, setCode] = useState<string>(initialCategory ?? "");
  const { data, error, isLoading, mutate } = useSWR<{ rows: StocktakeRowJson[] }>(
    `/api/admin/stock/stocktake${code ? `?category=${encodeURIComponent(code)}` : ""}`,
    stockSwrFetcher,
  );
  const allRows: StocktakeRowJson[] = useMemo(() => data?.rows ?? [], [data]);

  const [counts, setCounts] = useState<Record<string, CountEntry>>({});
  const [note, setNote] = useState<string>("");
  const [restored, setRestored] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The draft lives in this browser until applied, across categories and reloads.
  useEffect(() => {
    const d: Draft | null = loadDraft();
    if (d) {
      setCounts(d.counts);
      setNote(d.note ?? "");
      setRestored(Object.keys(d.counts).length > 0);
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) saveDraft({ counts, note });
  }, [counts, note, loaded]);

  /** Parsed state of each loaded row: counted quantity (or null) and the difference. */
  const parsed = useMemo(() => {
    const out = new Map<string, { counted: number | null; invalid: boolean; delta: number | null; expected: number }>();
    for (const r of allRows) {
      const entry: CountEntry | undefined = counts[r.variantId];
      const expected: number = entry?.expected ?? r.stockQuantity;
      if (!entry || entry.text.trim() === "") {
        out.set(r.variantId, { counted: null, invalid: false, delta: null, expected });
        continue;
      }
      const counted: number | null = parseQuantityInput(entry.text, rowUnit(r), { allowZero: true });
      out.set(r.variantId, {
        counted,
        invalid: counted == null,
        delta: counted == null ? null : Math.round((counted - expected) * 1000) / 1000,
        expected,
      });
    }
    return out;
  }, [allRows, counts]);

  const countedRows: StocktakeRowJson[] = allRows.filter((r) => parsed.get(r.variantId)?.counted != null);
  const diffCount: number = countedRows.filter((r) => parsed.get(r.variantId)!.delta !== 0).length;
  const invalidCount: number = allRows.filter((r) => parsed.get(r.variantId)?.invalid).length;
  const showCategory: boolean = code === "";

  const rows: StocktakeRowJson[] = useMemo(() => {
    const q: string = search.trim().toLowerCase();
    return allRows.filter((r) => {
      const p = parsed.get(r.variantId);
      if (filter === "notCounted" && p?.counted != null) return false;
      if (filter === "diff" && (p?.delta == null || p.delta === 0)) return false;
      if (!q) return true;
      return [r.sku, r.itemSku, r.nameRo, r.nameRu, r.nameEn, r.label ?? ""].some((x) => x.toLowerCase().includes(q));
    });
  }, [allRows, parsed, filter, search]);

  function setCount(row: StocktakeRowJson, text: string): void {
    setMessage(null);
    setCounts((prev) => {
      const next = { ...prev };
      if (text.trim() === "") delete next[row.variantId];
      else next[row.variantId] = { text, expected: prev[row.variantId]?.expected ?? row.stockQuantity };
      return next;
    });
  }

  function fillRestWithBook(): void {
    setCounts((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (next[r.variantId]?.text.trim()) continue;
        next[r.variantId] = { text: formatQuantity(Math.max(0, r.stockQuantity)), expected: r.stockQuantity };
      }
      return next;
    });
  }

  function clearCounts(): void {
    const visible = new Set(allRows.map((r) => r.variantId));
    setCounts((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !visible.has(id))));
    setRestored(false);
    setMessage(null);
  }

  function chooseCategory(next: string): void {
    setCode(next);
    setMessage(null);
    router.replace(next ? `/admin/stock/stocktake?category=${encodeURIComponent(next)}` : "/admin/stock/stocktake", {
      scroll: false,
    });
  }

  function onCellKey(e: KeyboardEvent<HTMLInputElement>, index: number): void {
    const step: number = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(`input[data-count-cell="${index + step}"]`);
    next?.focus();
    next?.select();
  }

  const name = (r: StocktakeRowJson): string => localizedStockName(r, locale);
  const categoryName = (r: StocktakeRowJson): string =>
    localizedStockName({ nameRo: r.categoryNameRo, nameRu: r.categoryNameRu, nameEn: r.categoryNameEn }, locale);
  const title: string = code
    ? `${b.stocktakeTitle}: ${categories.find((c) => c.code === code) ? localizedStockName(categories.find((c) => c.code === code)!, locale) : code}`
    : `${b.stocktakeTitle}: ${b.allCategories}`;

  function exportCsv(): void {
    const header = [...(showCategory ? [b.colCategory] : []), s.colSku, s.colName, s.colVariant, s.unit, b.colBook, b.colCounted];
    const body = rows.map((r) => [
      ...(showCategory ? [categoryName(r)] : []),
      r.sku,
      name(r),
      r.label ?? "",
      s.units[rowUnit(r)],
      formatQuantity(r.stockQuantity),
      counts[r.variantId]?.text ?? "",
    ]);
    const blob = new Blob([buildCsv([header, ...body])], { type: "text/csv;charset=utf-8" });
    const url: string = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${b.stocktakeTitle}-${code || "all"}-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(file: File): Promise<void> {
    const found = countsFromCsv(parseCsv(await file.text()), { sku: CSV_SKU_HEADERS, counted: CSV_COUNTED_HEADERS });
    if (!found) {
      setMessage({ kind: "error", text: b.importBadFile });
      return;
    }
    const bySku = new Map(allRows.map((r) => [r.sku.toLowerCase(), r]));
    let matched = 0;
    let unknown = 0;
    const next = { ...counts };
    for (const [sku, text] of found) {
      const r: StocktakeRowJson | undefined = bySku.get(sku.toLowerCase());
      if (!r) {
        unknown += 1;
        continue;
      }
      next[r.variantId] = {
        text: sanitizeQuantityInput(text, rowUnit(r)),
        expected: counts[r.variantId]?.expected ?? r.stockQuantity,
      };
      matched += 1;
    }
    setCounts(next);
    setMessage({ kind: unknown > 0 ? "error" : "ok", text: b.importResult(matched, unknown) });
  }

  function printSheet(): void {
    const w: Window | null = window.open("", "_blank");
    if (!w) return;
    const head = [...(showCategory ? [b.colCategory] : []), s.colSku, s.colName, s.colVariant, b.colBook, b.colCounted];
    const trs: string = rows
      .map((r) => {
        const cells = [
          ...(showCategory ? [categoryName(r)] : []),
          r.sku,
          name(r),
          r.label ?? "",
          `${formatQuantity(r.stockQuantity)} ${s.units[rowUnit(r)]}`,
          counts[r.variantId]?.text ?? "",
        ];
        return `<tr>${cells.map((c, i) => `<td${i >= cells.length - 2 ? ' class="n"' : ""}>${escapeHtml(c)}</td>`).join("")}</tr>`;
      })
      .join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
      body{font:12px/1.35 -apple-system,Segoe UI,Arial,sans-serif;margin:16px;color:#111}
      h1{font-size:16px;margin:0 0 4px} p{margin:0 0 12px;color:#555}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}
      th{background:#eee} td.n{text-align:right;white-space:nowrap} td:last-child{min-width:70px}
      tr{page-break-inside:avoid} .sig{margin-top:24px}
    </style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(today())}</p>
      <table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${trs}</tbody></table>
      <p class="sig">${escapeHtml(b.printSignature)}</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  async function apply(): Promise<void> {
    if (invalidCount > 0) {
      setConfirmOpen(false);
      setMessage({ kind: "error", text: s.errorInvalidQuantity });
      return;
    }
    const payload = countedRows.map((r) => {
      const p = parsed.get(r.variantId)!;
      return { variantId: r.variantId, countedQuantity: p.counted!, expectedQuantity: p.expected };
    });
    setSaving(true);
    try {
      const res = await stockFetch<{ adjusted: number }>("/api/admin/stock/stocktake", {
        method: "POST",
        body: { note: note.trim() || b.defaultNote(today()), counts: payload },
      });
      const done = new Set(payload.map((p) => p.variantId));
      setCounts((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !done.has(id))));
      setRestored(false);
      await mutate();
      setMessage({ kind: "ok", text: b.applied(res.adjusted) });
    } catch (e) {
      const stale: boolean = e instanceof StockRequestError && e.body.error === "unknown_variant";
      setMessage({ kind: "error", text: stale ? b.errorStale : stockErrorMessage(e, s) });
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: b.filterAll },
    { id: "notCounted", label: b.filterNotCounted },
    { id: "diff", label: b.filterDiff },
  ];

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-28">
      <Link href="/admin/stock" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.admin.backToStockHub}
      </Link>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{b.stocktakeTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">{b.stocktakeIntro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={rows.length === 0} onClick={printSheet}>
            <Printer className="h-4 w-4" />
            {b.print}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={rows.length === 0} onClick={exportCsv}>
            <Download className="h-4 w-4" />
            {b.exportCsv}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={allRows.length === 0} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />
            {b.importCsv}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f: File | undefined = e.target.files?.[0];
              e.target.value = "";
              if (f) void importCsv(f);
            }}
          />
        </div>
      </div>

      {restored ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{b.draftRestored}</p>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          {b.category}
          <select className={selectCls} value={code} onChange={(e) => chooseCategory(e.target.value)}>
            <option value="">{b.allCategories}</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {localizedStockName(c, locale)}
              </option>
            ))}
          </select>
        </label>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={b.searchPlaceholder}
            className="h-9 w-full pl-9"
            aria-label={b.searchPlaceholder}
          />
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-gray-300" role="group">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className={cn(
                "h-9 px-3 text-sm",
                filter === f.id ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-50",
              )}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{stockErrorMessage(error, s)}</p> : null}

      {isLoading ? (
        <div className="flex justify-center py-20 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">{b.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                {showCategory ? <th className="w-[140px] p-2 pl-3">{b.colCategory}</th> : null}
                <th className={cn("p-2", !showCategory && "pl-3")}>{b.colItem}</th>
                <th className="w-[110px] p-2 text-right">{b.colBook}</th>
                <th className="w-[170px] p-2 text-right">{b.colCounted}</th>
                <th className="w-[110px] p-2 pr-3 text-right">{b.colDelta}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, index) => {
                const p = parsed.get(r.variantId);
                const unit: StockUnit = rowUnit(r);
                const text: string = counts[r.variantId]?.text ?? "";
                return (
                  <tr key={r.variantId} className={cn("border-b border-gray-100 last:border-0", !r.isActive && "text-gray-400")}>
                    {showCategory ? <td className="p-2 pl-3 text-xs text-gray-500">{categoryName(r)}</td> : null}
                    <td className={cn("p-2", !showCategory && "pl-3")}>
                      <p className="text-sm leading-snug text-gray-900">
                        {name(r)}
                        {r.label ? <span className="ml-1.5 text-gray-600">{r.label}</span> : null}
                        {!r.isActive ? <span className="ml-1.5 text-[10px] text-gray-400">({s.badgeInactive})</span> : null}
                      </p>
                      <p className="font-mono text-[11px] text-gray-400">{r.sku}</p>
                    </td>
                    <td className="p-2 text-right tabular-nums text-gray-700">
                      {formatQuantity(p?.expected ?? r.stockQuantity)} <span className="text-xs text-gray-400">{s.units[unit]}</span>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="rounded p-1 text-gray-400 hover:bg-emerald-50 hover:text-emerald-700"
                          title={b.sameAsBook}
                          aria-label={b.sameAsBook}
                          onClick={() => setCount(r, formatQuantity(Math.max(0, p?.expected ?? r.stockQuantity)))}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <Input
                          data-count-cell={index}
                          className={cn(
                            "h-8 w-24 text-right tabular-nums",
                            p?.counted != null && "border-sky-300 bg-sky-50",
                            p?.invalid && "border-red-500 bg-red-50",
                          )}
                          inputMode={unit === StockUnit.Pieces || unit === StockUnit.Sheets ? "numeric" : "decimal"}
                          value={text}
                          placeholder="—"
                          disabled={saving}
                          onChange={(e) => setCount(r, sanitizeQuantityInput(e.target.value, unit))}
                          onKeyDown={(e) => onCellKey(e, index)}
                          onFocus={(e) => e.target.select()}
                          aria-label={`${b.colCounted}: ${r.sku}`}
                        />
                      </div>
                    </td>
                    <td
                      className={cn(
                        "p-2 pr-3 text-right font-medium tabular-nums",
                        p?.delta == null || p.delta === 0 ? "text-gray-400" : p.delta > 0 ? "text-emerald-700" : "text-red-600",
                      )}
                    >
                      {p?.delta == null ? "" : p.delta === 0 ? "0" : signed(p.delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={cn("text-sm", message?.kind === "error" ? "text-red-600" : message ? "text-emerald-700" : "text-gray-700")}>
              {message ? message.text : b.summary(countedRows.length, allRows.length, diffCount)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              {b.note}
              <Input
                className="h-9 w-56"
                value={note}
                placeholder={b.defaultNote(today())}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rows.length === 0 || saving}
              onClick={fillRestWithBook}
              title={b.sameAsBook}
            >
              <Check className="h-4 w-4" />
              {b.sameAsBookAll(rows.filter((r) => !counts[r.variantId]?.text.trim()).length)}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={countedRows.length === 0 || saving} onClick={clearCounts}>
              <Eraser className="h-4 w-4" />
              {b.clearCounts}
            </Button>
            <Button type="button" size="sm" disabled={countedRows.length === 0 || saving} onClick={() => setConfirmOpen(true)}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              {b.apply(countedRows.length)}
            </Button>
          </div>
        </div>
      </div>

      <AdminConfirmDialog
        open={confirmOpen}
        title={b.applyConfirmTitle}
        description={b.applyConfirmDescription(diffCount, countedRows.length)}
        confirmLabel={b.apply(countedRows.length)}
        cancelLabel={s.cancel}
        busy={saving}
        onClose={() => {
          if (!saving) setConfirmOpen(false);
        }}
        onConfirm={() => void apply()}
      />
    </main>
  );
}
