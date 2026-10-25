"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/app/admin/_components/DatePicker";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { formatAmountInput, parseAmountMdl, round2, sanitizeMoneyInput } from "@/lib/money";
import { unitAllowsFractions, type StockUnit } from "@/lib/stock/unified/kinds";
import { localizedStockName, type StockItemJson } from "@/lib/stock/unified/adminTypes";
import { formatQuantity, parseQuantityInput, sanitizeQuantityInput } from "@/lib/stock/unified/quantity";
import { StockModalShell } from "../StockModalShell";
import { todayIsoDate } from "../catalogStock";
import { ColorSwatch, fieldLabelCls } from "./StockBits";
import { stockErrorMessage, stockFetch } from "./stockApi";

type LineDraft = { qty: string; total: string };

type Row = {
  variantId: string;
  sku: string;
  title: string;
  label: string | null;
  colorHex: string | undefined;
  stock: number;
};

type Parsed =
  | { ok: true; lines: { variantId: string; quantity: number; totalCostMdl: number }[]; invoiceTotal: number }
  | { ok: false; reason: "empty" | "invalid"; invoiceTotal: number };

function parseLines(rows: readonly Row[], drafts: Readonly<Record<string, LineDraft>>, unit: StockUnit): Parsed {
  const lines: { variantId: string; quantity: number; totalCostMdl: number }[] = [];
  let invoiceTotal = 0;
  let invalid = false;
  for (const r of rows) {
    const d: LineDraft | undefined = drafts[r.variantId];
    if (!d || (d.qty.trim() === "" && d.total.trim() === "")) continue;
    const qty: number | null = parseQuantityInput(d.qty, unit);
    const total: number | null = parseAmountMdl(d.total);
    if (qty == null || total == null) {
      invalid = true;
      continue;
    }
    invoiceTotal += total;
    lines.push({ variantId: r.variantId, quantity: qty, totalCostMdl: total });
  }
  invoiceTotal = round2(invoiceTotal);
  if (invalid) return { ok: false, reason: "invalid", invoiceTotal };
  if (lines.length === 0) return { ok: false, reason: "empty", invoiceTotal };
  return { ok: true, lines, invoiceTotal };
}

/** «Приход на склад» for a whole category: one delivery, quantity + total per variant. */
export function StockBulkReceiptModal({
  items,
  unit,
  onClose,
  onSaved,
}: {
  items: readonly StockItemJson[];
  unit: StockUnit;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { t, locale } = useLanguageStore();
  const s = t.stock;
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [purchasedAt, setPurchasedAt] = useState<string>(todayIsoDate);
  const [supplier, setSupplier] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const rows: Row[] = useMemo(
    () =>
      items
        .filter((i) => i.isActive)
        .flatMap((i) =>
          i.variants
            .filter((v) => v.isActive)
            .map((v) => ({
              variantId: v.id,
              sku: v.sku,
              title: localizedStockName(i, locale),
              label: v.label,
              colorHex: v.options.colorHex,
              stock: v.stockQuantity,
            })),
        ),
    [items, locale],
  );
  const visible: Row[] = useMemo(() => {
    const q: string = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.sku.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (r.label ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);
  const parsed: Parsed = useMemo(() => parseLines(rows, drafts, unit), [rows, drafts, unit]);

  function patch(id: string, p: Partial<LineDraft>): void {
    setDrafts((prev) => ({ ...prev, [id]: { qty: prev[id]?.qty ?? "", total: prev[id]?.total ?? "", ...p } }));
  }

  async function submit(): Promise<void> {
    if (!parsed.ok) {
      setError(parsed.reason === "empty" ? s.noLines : s.invalidLine);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await stockFetch("/api/admin/stock/receipts", {
        method: "POST",
        body: {
          purchasedAt: `${purchasedAt}T12:00:00Z`,
          supplierName: supplier.trim() || null,
          note: note.trim() || null,
          lines: parsed.lines,
        },
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(stockErrorMessage(e, s));
    } finally {
      setSaving(false);
    }
  }

  return (
    <StockModalShell
      titleId="stock-bulk-receipt-title"
      title={s.bulkReceiptTitle}
      busy={saving}
      onClose={onClose}
      className="max-w-3xl"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600">
            {s.invoiceTotal}:{" "}
            <span className="font-semibold tabular-nums text-gray-900">
              {formatAmountInput(parsed.invoiceTotal)} {t.admin.currency}
            </span>
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              {s.cancel}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submit()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {s.saveReceipt}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={fieldLabelCls}>
          {s.purchasedAt}
          <div className="mt-1">
            <DatePicker
              value={purchasedAt}
              onChange={setPurchasedAt}
              locale={locale}
              t={t}
              clearable={false}
              disabled={saving}
              ariaLabel={s.purchasedAt}
            />
          </div>
        </label>
        <label className={`${fieldLabelCls} sm:col-span-2`}>
          {s.supplier}
          <Input className="mt-1 h-9" value={supplier} onChange={(e) => setSupplier(e.target.value)} disabled={saving} />
        </label>
        <label className={`${fieldLabelCls} sm:col-span-3`}>
          {s.note}
          <Input className="mt-1 h-9" value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} />
        </label>
      </div>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={s.searchVariants}
          aria-label={s.searchVariants}
          className="h-9 pl-9"
          autoComplete="off"
        />
      </div>

      <div className="mt-3 hidden grid-cols-[1fr_88px_120px_96px] gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:grid">
        <span />
        <span className="text-right">{s.quantityIn(s.units[unit])}</span>
        <span className="text-right">{s.totalCost}</span>
        <span className="text-right">{s.unitCost}</span>
      </div>

      {rows.length === 0 ? <p className="mt-3 text-sm text-gray-500">{s.noVariantsToReceive}</p> : null}

      <ul className="mt-1 space-y-2">
        {visible.map((r) => {
          const d: LineDraft = drafts[r.variantId] ?? { qty: "", total: "" };
          const qty: number | null = parseQuantityInput(d.qty, unit);
          const total: number | null = parseAmountMdl(d.total);
          const unitCost: number | null = qty != null && total != null ? total / qty : null;
          return (
            <li
              key={r.variantId}
              className="grid grid-cols-2 items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2 sm:grid-cols-[1fr_88px_120px_96px]"
            >
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <p className="truncate font-mono text-[11px] text-gray-500">{r.sku}</p>
                <p className="flex items-center gap-1.5 truncate text-xs text-gray-900">
                  <ColorSwatch hex={r.colorHex} />
                  <span className="truncate">
                    {r.title}
                    {r.label ? <span className="text-gray-500"> · {r.label}</span> : null}
                  </span>
                </p>
                <p className="text-[11px] text-gray-500">
                  {s.currentStock}: {formatQuantity(r.stock)} {s.units[unit]}
                </p>
              </div>
              <Input
                inputMode={unitAllowsFractions(unit) ? "decimal" : "numeric"}
                placeholder="0"
                aria-label={s.quantityIn(s.units[unit])}
                value={d.qty}
                onChange={(e) => patch(r.variantId, { qty: sanitizeQuantityInput(e.target.value, unit) })}
                className="h-9 bg-white text-right tabular-nums"
                disabled={saving}
              />
              <Input
                inputMode="decimal"
                placeholder="0.00"
                aria-label={s.totalCost}
                value={d.total}
                onChange={(e) => patch(r.variantId, { total: sanitizeMoneyInput(e.target.value) })}
                className="h-9 bg-white text-right tabular-nums"
                disabled={saving}
              />
              <p className="col-span-2 text-right text-xs tabular-nums text-gray-700 sm:col-span-1">
                {unitCost == null ? "—" : formatAmountInput(unitCost)}
              </p>
            </li>
          );
        })}
      </ul>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </StockModalShell>
  );
}
