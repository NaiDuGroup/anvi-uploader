"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/app/admin/_components/DatePicker";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { formatAmountInput, parseAmountMdl, round2, sanitizeMoneyInput } from "@/lib/money";
import type {
  CatalogStockReceiptBody,
  CatalogStockReceiptLine,
} from "@/lib/stock/catalogStockReceiptSchema";
import { StockModalShell } from "./StockModalShell";
import { CatalogUnitCost } from "./CatalogUnitCost";
import { todayIsoDate, type CatalogStockEndpoints, type CatalogStockProduct } from "./catalogStock";

type LineDraft = { qty: string; total: string };

type ParsedLines =
  | { ok: true; lines: CatalogStockReceiptLine[]; invoiceTotal: number }
  | { ok: false; reason: "empty" | "invalid"; invoiceTotal: number };

function parseLines(
  products: readonly CatalogStockProduct[],
  drafts: Readonly<Record<string, LineDraft>>,
): ParsedLines {
  const lines: CatalogStockReceiptLine[] = [];
  let invoiceTotal = 0;
  let invalid = false;
  for (const p of products) {
    const d: LineDraft | undefined = drafts[p.id];
    if (!d || (d.qty.trim() === "" && d.total.trim() === "")) continue;
    const qty: number = Number.parseInt(d.qty, 10);
    const total: number | null = parseAmountMdl(d.total);
    if (!Number.isFinite(qty) || qty <= 0 || total == null) {
      invalid = true;
      continue;
    }
    invoiceTotal += total;
    lines.push({ productId: p.id, quantity: qty, totalCostMdl: total });
  }
  invoiceTotal = round2(invoiceTotal);
  if (invalid) return { ok: false, reason: "invalid", invoiceTotal };
  if (lines.length === 0) return { ok: false, reason: "empty", invoiceTotal };
  return { ok: true, lines, invoiceTotal };
}

function matchesSearch(p: CatalogStockProduct, q: string): boolean {
  const s: string = q.trim().toLowerCase();
  return !s || p.sku.toLowerCase().includes(s) || p.name.toLowerCase().includes(s);
}

type CatalogBulkReceiptModalProps = {
  products: readonly CatalogStockProduct[];
  endpoints: CatalogStockEndpoints;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

/** One supplier invoice for many SKUs: shared date / supplier, quantity and total per line. */
export function CatalogBulkReceiptModal({
  products,
  endpoints,
  onClose,
  onSaved,
}: CatalogBulkReceiptModalProps) {
  const { t, locale } = useLanguageStore();
  const lf = t.admin;

  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [purchasedAt, setPurchasedAt] = useState<string>(todayIsoDate);
  const [supplier, setSupplier] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const visible: CatalogStockProduct[] = useMemo(
    () => products.filter((p) => matchesSearch(p, search)),
    [products, search],
  );
  const parsed: ParsedLines = useMemo(() => parseLines(products, drafts), [products, drafts]);

  function patchDraft(id: string, patch: Partial<LineDraft>): void {
    setDrafts((prev) => ({
      ...prev,
      [id]: { qty: prev[id]?.qty ?? "", total: prev[id]?.total ?? "", ...patch },
    }));
  }

  async function submit(): Promise<void> {
    if (!parsed.ok) {
      setError(
        parsed.reason === "empty"
          ? lf.catalogStockReceiptNoLines
          : lf.catalogStockReceiptInvalidLine,
      );
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const body: CatalogStockReceiptBody = {
        purchasedAt: new Date(`${purchasedAt}T12:00:00Z`),
        supplier: supplier.trim() || null,
        note: note.trim() || null,
        lines: parsed.lines,
      };
      const res = await fetch(endpoints.receiptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(lf.catalogStockReceiptFailed);
        return;
      }
      await onSaved();
      onClose();
    } catch {
      setError(lf.catalogStockReceiptFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <StockModalShell
      titleId="catalog-bulk-receipt-title"
      title={lf.catalogStockBulkReceiptTitle}
      busy={saving}
      onClose={onClose}
      className="max-w-3xl"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600">
            {lf.catalogStockReceiptInvoiceTotal}:{" "}
            <span className="font-semibold tabular-nums text-gray-900">
              {formatAmountInput(parsed.invoiceTotal)} {lf.currency}
            </span>
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              {lf.cancel}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submit()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {lf.catalogStockReceiptSave}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-gray-600">
          {lf.catalogStockReceiptDate}
          <div className="mt-1">
            <DatePicker
              value={purchasedAt}
              onChange={setPurchasedAt}
              locale={locale}
              t={t}
              clearable={false}
              disabled={saving}
              ariaLabel={lf.catalogStockReceiptDate}
            />
          </div>
        </label>
        <label className="block text-xs font-medium text-gray-600 sm:col-span-2">
          {lf.catalogStockReceiptSupplier}
          <Input
            className="mt-1 h-9"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block text-xs font-medium text-gray-600 sm:col-span-3">
          {lf.catalogStockReceiptNote}
          <Input
            className="mt-1 h-9"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
          />
        </label>
      </div>

      <div className="relative mt-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lf.catalogStockReceiptSearch}
          aria-label={lf.catalogStockReceiptSearch}
          className="h-9 pl-9"
          autoComplete="off"
        />
      </div>

      <div className="mt-3 hidden grid-cols-[1fr_88px_120px_96px] gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:grid">
        <span />
        <span className="text-right">{lf.catalogStockReceiptQty}</span>
        <span className="text-right">{lf.catalogStockReceiptTotalMdl}</span>
        <span className="text-right">{lf.catalogStockReceiptUnitCost}</span>
      </div>

      <ul className="mt-1 space-y-2">
        {visible.map((p) => {
          const d: LineDraft = drafts[p.id] ?? { qty: "", total: "" };
          const qty: number = Number.parseInt(d.qty, 10);
          const total: number | null = parseAmountMdl(d.total);
          const unit: number | null =
            Number.isFinite(qty) && qty > 0 && total != null ? total / qty : null;
          return (
            <li
              key={p.id}
              className="grid grid-cols-2 items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2 sm:grid-cols-[1fr_88px_120px_96px]"
            >
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <p className="truncate font-mono text-[11px] text-gray-500">{p.sku}</p>
                <p className="truncate text-xs text-gray-900">{p.name}</p>
                <p className="text-[11px] text-gray-500">
                  {lf.catalogStockReceiptCurrentStock}: {p.stockQuantity} ·{" "}
                  {lf.catalogStockAvgCost}:{" "}
                  <CatalogUnitCost
                    avgPurchaseCost={p.avgPurchaseCost}
                    purchaseCost={p.purchaseCost}
                  />
                </p>
              </div>
              <Input
                inputMode="numeric"
                placeholder="0"
                aria-label={lf.catalogStockReceiptQty}
                value={d.qty}
                onChange={(e) =>
                  patchDraft(p.id, { qty: e.target.value.replace(/\D/g, "").slice(0, 7) })
                }
                className="h-9 bg-white text-right tabular-nums"
                disabled={saving}
              />
              <Input
                inputMode="decimal"
                placeholder="0.00"
                aria-label={lf.catalogStockReceiptTotalMdl}
                value={d.total}
                onChange={(e) => patchDraft(p.id, { total: sanitizeMoneyInput(e.target.value) })}
                className="h-9 bg-white text-right tabular-nums"
                disabled={saving}
              />
              <p className="col-span-2 text-right text-xs tabular-nums text-gray-700 sm:col-span-1">
                {unit == null ? "—" : formatAmountInput(unit)}
              </p>
            </li>
          );
        })}
      </ul>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </StockModalShell>
  );
}
