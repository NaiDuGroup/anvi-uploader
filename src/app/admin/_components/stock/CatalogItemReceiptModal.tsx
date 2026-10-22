"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/app/admin/_components/DatePicker";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { formatAmountInput, parseAmountMdl, sanitizeMoneyInput } from "@/lib/money";
import type {
  CatalogStockMovementItem,
  CatalogStockReceiptBody,
  CatalogStockReceiptItem,
} from "@/lib/stock/catalogStockReceiptSchema";
import ProvisionalPriceToggle, {
  provisionalTotalInput,
} from "@/app/admin/_components/purchasing/ProvisionalPriceToggle";
import { StockModalShell } from "./StockModalShell";
import { CatalogUnitCost } from "./CatalogUnitCost";
import {
  catalogStockMovementLabel,
  dateLocaleFor,
  formatStockDate,
  isReceiptMovement,
  todayIsoDate,
  type CatalogStockEndpoints,
  type CatalogStockProduct,
} from "./catalogStock";

type CatalogItemReceiptModalProps = {
  product: CatalogStockProduct;
  endpoints: CatalogStockEndpoints;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

type HistoryState = {
  receipts: CatalogStockReceiptItem[];
  movements: CatalogStockMovementItem[];
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Register a purchase for one SKU and review its receipts and stock movements. */
export function CatalogItemReceiptModal({
  product,
  endpoints,
  onClose,
  onSaved,
}: CatalogItemReceiptModalProps) {
  const { t, locale } = useLanguageStore();
  const lf = t.admin;
  const dateLoc: string = dateLocaleFor(locale);

  const [qtyStr, setQtyStr] = useState<string>("");
  const [totalStr, setTotalStr] = useState<string>("");
  const [purchasedAt, setPurchasedAt] = useState<string>(todayIsoDate);
  const [supplier, setSupplier] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [provisional, setProvisional] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);

  const [history, setHistory] = useState<HistoryState>({ receipts: [], movements: [] });
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);

  const loadHistory = useCallback((): void => {
    setHistoryLoading(true);
    void Promise.all([
      fetchJson<{ items?: CatalogStockReceiptItem[] }>(endpoints.receiptsUrl(product.id)),
      fetchJson<{ movements?: CatalogStockMovementItem[] }>(
        endpoints.movementsUrl(product.id),
      ),
    ])
      .then(([rec, mov]) => {
        setHistory({ receipts: rec?.items ?? [], movements: mov?.movements ?? [] });
      })
      .finally(() => setHistoryLoading(false));
  }, [endpoints, product.id]);

  useEffect(loadHistory, [loadHistory]);

  const qty: number | null = useMemo(() => {
    const n: number = Number.parseInt(qtyStr, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [qtyStr]);
  const lastUnitCost: number | null = product.avgPurchaseCost ?? product.purchaseCost;
  const effectiveTotalStr: string = provisional
    ? provisionalTotalInput(qty, lastUnitCost, false)
    : totalStr;
  const total: number | null = parseAmountMdl(effectiveTotalStr);
  const unitCost: number | null = qty != null && total != null ? total / qty : null;

  const nonReceiptMovements: CatalogStockMovementItem[] = history.movements.filter(
    (m) => !isReceiptMovement(m),
  );

  async function submit(): Promise<void> {
    if (qty == null || total == null) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setSaving(true);
    try {
      const body: CatalogStockReceiptBody = {
        purchasedAt: new Date(`${purchasedAt}T12:00:00Z`),
        supplier: supplier.trim() || null,
        note: note.trim() || null,
        isProvisional: provisional,
        lines: [{ productId: product.id, quantity: qty, totalCostMdl: total }],
      };
      const res = await fetch(endpoints.receiptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setQtyStr("");
      setTotalStr("");
      setProvisional(false);
      loadHistory();
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <StockModalShell
      titleId="catalog-item-receipt-title"
      title={lf.catalogStockItemReceiptTitle}
      subtitle={
        <>
          <p className="font-mono text-xs text-gray-500">{product.sku}</p>
          <p className="line-clamp-2">{product.name}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-500">
            <span>
              {lf.catalogStockReceiptCurrentStock}:{" "}
              <span className="tabular-nums text-gray-900">{product.stockQuantity}</span>
            </span>
            <span>
              {lf.catalogStockAvgCost}:{" "}
              <span className="text-gray-900">
                <CatalogUnitCost
                  avgPurchaseCost={product.avgPurchaseCost}
                  purchaseCost={product.purchaseCost}
                />
              </span>
            </span>
          </p>
        </>
      }
      busy={saving}
      onClose={onClose}
    >
      <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-gray-600">
            {lf.catalogStockReceiptQty}
            <Input
              className="mt-1 h-9 bg-white tabular-nums"
              inputMode="numeric"
              value={qtyStr}
              onChange={(e) => setQtyStr(e.target.value.replace(/\D/g, "").slice(0, 7))}
              disabled={saving}
            />
          </label>
          <label className="block text-xs font-medium text-gray-600">
            {lf.catalogStockReceiptTotalMdl}
            <Input
              className="mt-1 h-9 bg-white tabular-nums"
              inputMode="decimal"
              value={effectiveTotalStr}
              onChange={(e) => setTotalStr(sanitizeMoneyInput(e.target.value))}
              disabled={saving || provisional}
            />
          </label>
          <div className="text-xs font-medium text-gray-600">
            {lf.catalogStockReceiptUnitCost}
            <p className="mt-1 flex h-9 items-center tabular-nums text-sm text-gray-900">
              {unitCost == null ? "—" : `${formatAmountInput(unitCost)} ${lf.currency}`}
            </p>
          </div>
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
              className="mt-1 h-9 bg-white"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              disabled={saving}
            />
          </label>
          <label className="block text-xs font-medium text-gray-600 sm:col-span-3">
            {lf.catalogStockReceiptNote}
            <Input
              className="mt-1 h-9 bg-white"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
            />
          </label>
          <div className="sm:col-span-3">
            <ProvisionalPriceToggle
              checked={provisional}
              onChange={setProvisional}
              unitCost={lastUnitCost}
              disabled={saving}
            />
          </div>
        </div>

        {failed ? (
          <p className="mt-3 text-sm text-red-600">{lf.catalogStockReceiptFailed}</p>
        ) : null}

        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={saving || qty == null || total == null}
            onClick={() => void submit()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {lf.catalogStockReceiptSave}
          </Button>
        </div>
      </div>

      {historyLoading ? (
        <p className="mt-5 text-sm text-gray-500">{lf.catalogStockHistoryLoading}</p>
      ) : history.receipts.length === 0 && nonReceiptMovements.length === 0 ? (
        <p className="mt-5 text-sm text-gray-500">{lf.catalogStockHistoryEmpty}</p>
      ) : (
        <>
          {history.receipts.length > 0 ? (
            <>
              <h3 className="mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <History className="h-3.5 w-3.5" aria-hidden />
                {lf.catalogStockReceiptsTitle}
              </h3>
              <ul className="mt-2 divide-y divide-gray-100 text-sm">
                {history.receipts.map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium text-gray-900">
                        {formatStockDate(r.purchasedAt, dateLoc)}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        {[r.supplier, r.note, r.createdBy?.name].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums text-gray-800">
                      +{r.quantity} × {formatAmountInput(r.unitCostMdl)} ={" "}
                      {formatAmountInput(r.totalCostMdl)} {lf.currency}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {nonReceiptMovements.length > 0 ? (
            <>
              <h3 className="mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <History className="h-3.5 w-3.5" aria-hidden />
                {lf.catalogStockMovementsTitle}
              </h3>
              <ul className="mt-2 divide-y divide-gray-100 text-sm">
                {nonReceiptMovements.map((m) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium text-gray-900">
                        {catalogStockMovementLabel(m, lf)}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        {formatStockDate(m.createdAt, dateLoc)}
                        {m.note ? ` · ${m.note}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums text-gray-800">
                      {m.delta > 0 ? "+" : ""}
                      {m.delta}
                      {m.costMdl != null
                        ? ` · ${formatAmountInput(m.costMdl)} ${lf.currency}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </StockModalShell>
  );
}
