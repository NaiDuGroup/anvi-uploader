"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Loader2, Save, Search, Undo2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatAmountInput, parseAmountMdl, sanitizeMoneyInput } from "@/lib/money";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { CatalogUnitCost } from "@/app/admin/_components/stock/CatalogUnitCost";
import { ColorSwatch } from "@/app/admin/_components/stock/unified/StockBits";
import { stockErrorMessage, stockFetch, stockSwrFetcher, StockRequestError } from "@/app/admin/_components/stock/unified/stockApi";
import {
  localizedStockName,
  type StockCategoryJson,
  type StockItemJson,
  type StockVariantJson,
} from "@/lib/stock/unified/adminTypes";
import { adjustPrice, markupPercent, PRICE_SCREEN_EXCLUDED_CATEGORIES } from "@/lib/stock/unified/bulkEdit";
import { singlePiecePrice } from "@/lib/stock/unified/garmentTiers";
import { isPrinterConsumableCategory } from "@/lib/stock/unified/printerAdmin";
import { formatQuantity } from "@/lib/stock/unified/quantity";

type PriceField = "sell" | "dealer";
type Draft = Partial<Record<PriceField, string>>;
type Row = { item: StockItemJson; variant: StockVariantJson; tiered: boolean };
type ToolTarget = "retail" | "dealer" | "both";

const selectCls = "h-9 rounded-md border border-gray-300 bg-white px-2 text-sm";
const smallInputCls = "h-8 w-24 text-right tabular-nums";

function original(v: StockVariantJson, field: PriceField): number | null {
  return field === "sell" ? v.sellPrice : v.dealerPrice;
}

/** Shown text of a price cell: the draft when edited, else the saved value. */
function cellText(drafts: Record<string, Draft>, v: StockVariantJson, field: PriceField): string {
  const d: string | undefined = drafts[v.id]?.[field];
  return d ?? formatAmountInput(original(v, field));
}

/** Parsed cell: number, null (empty) or "invalid". */
function cellValue(text: string): number | null | "invalid" {
  if (text.trim() === "") return null;
  const n: number | null = parseAmountMdl(text);
  return n == null ? "invalid" : n;
}

function isChanged(drafts: Record<string, Draft>, v: StockVariantJson, field: PriceField): boolean {
  const d: string | undefined = drafts[v.id]?.[field];
  if (d === undefined) return false;
  const val = cellValue(d);
  return val === "invalid" || val !== original(v, field);
}

export default function StockPricesPageClient({ initialCategory }: { initialCategory: string | null }) {
  const { t, locale } = useLanguageStore();
  const b = t.stockBulk;
  const router = useRouter();

  const { data: catData } = useSWR<{ categories: StockCategoryJson[] }>(
    "/api/admin/stock/categories?active=1",
    stockSwrFetcher,
  );
  const categories: StockCategoryJson[] = useMemo(
    () =>
      (catData?.categories ?? []).filter(
        (c) => !isPrinterConsumableCategory(c.code) && !PRICE_SCREEN_EXCLUDED_CATEGORIES.includes(c.code),
      ),
    [catData],
  );
  const [code, setCode] = useState<string | null>(initialCategory);
  const activeCode: string | null = code ?? categories[0]?.code ?? null;

  const { data, error, isLoading, mutate } = useSWR<{ category: StockCategoryJson; items: StockItemJson[] }>(
    activeCode ? `/api/admin/stock/items?category=${encodeURIComponent(activeCode)}` : null,
    stockSwrFetcher,
  );

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState<string>("");
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [onlyMissing, setOnlyMissing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [toolPercent, setToolPercent] = useState<string>("");
  const [toolTarget, setToolTarget] = useState<ToolTarget>("both");
  const [toolRound, setToolRound] = useState<string>("1");
  const [dealerDiscount, setDealerDiscount] = useState<string>("");

  const allRows: Row[] = useMemo(
    () =>
      (data?.items ?? []).flatMap((item) =>
        item.variants.map((variant) => ({ item, variant, tiered: variant.priceTiers != null })),
      ),
    [data],
  );

  const changedIds: string[] = useMemo(
    () =>
      allRows
        .filter((r) => isChanged(drafts, r.variant, "sell") || isChanged(drafts, r.variant, "dealer"))
        .map((r) => r.variant.id),
    [allRows, drafts],
  );
  const dirty: boolean = changedIds.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const rows: Row[] = useMemo(() => {
    const q: string = search.trim().toLowerCase();
    return allRows.filter(({ item, variant, tiered }) => {
      if (!showInactive && (!item.isActive || !variant.isActive)) return false;
      // Saved values, so a row does not vanish while its price is being typed.
      if (onlyMissing && (tiered || variant.sellPrice != null) && variant.dealerPrice != null) return false;
      if (!q) return true;
      return [item.sku, item.nameRo, item.nameRu, item.nameEn, variant.sku, variant.label ?? ""].some((s) =>
        s.toLowerCase().includes(q),
      );
    });
  }, [allRows, search, showInactive, onlyMissing]);

  function setCell(id: string, field: PriceField, text: string): void {
    setMessage(null);
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: text } }));
  }

  function chooseCategory(next: string): void {
    if (dirty && !window.confirm(b.unsavedLeave)) return;
    setDrafts({});
    setMessage(null);
    setCode(next);
    router.replace(`/admin/stock/prices?category=${encodeURIComponent(next)}`, { scroll: false });
  }

  /** Enter / arrows move to the same column of the next / previous row. */
  function onCellKey(e: KeyboardEvent<HTMLInputElement>, rowIndex: number, field: PriceField): void {
    const step: number = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(`input[data-price-cell="${field}:${rowIndex + step}"]`);
    next?.focus();
    next?.select();
  }

  function applyPercent(): void {
    setMessage(null);
    const pct: number = Number(toolPercent.replace(",", "."));
    const step: number = Number(toolRound.replace(",", ".")) || 1;
    if (!Number.isFinite(pct) || pct === 0) return;
    setDrafts((prev) => {
      const next: Record<string, Draft> = { ...prev };
      for (const { variant, tiered } of rows) {
        const fields: PriceField[] =
          toolTarget === "both" ? ["sell", "dealer"] : toolTarget === "retail" ? ["sell"] : ["dealer"];
        for (const f of fields) {
          if (f === "sell" && tiered) continue;
          const cur = cellValue(next[variant.id]?.[f] ?? formatAmountInput(original(variant, f)));
          if (typeof cur !== "number") continue;
          next[variant.id] = { ...next[variant.id], [f]: formatAmountInput(adjustPrice(cur, pct, step)) };
        }
      }
      return next;
    });
  }

  function applyDealerFromRetail(): void {
    setMessage(null);
    const pct: number = Number(dealerDiscount.replace(",", "."));
    const step: number = Number(toolRound.replace(",", ".")) || 1;
    if (!Number.isFinite(pct) || pct < 0 || pct >= 100) return;
    setDrafts((prev) => {
      const next: Record<string, Draft> = { ...prev };
      for (const { variant, tiered } of rows) {
        const retail = tiered
          ? singlePiecePrice(variant.priceTiers)
          : cellValue(next[variant.id]?.sell ?? formatAmountInput(variant.sellPrice));
        if (typeof retail !== "number") continue;
        next[variant.id] = { ...next[variant.id], dealer: formatAmountInput(adjustPrice(retail, -pct, step)) };
      }
      return next;
    });
  }

  async function save(): Promise<void> {
    const byId = new Map(allRows.map((r) => [r.variant.id, r]));
    const updates: { variantId: string; sellPrice?: number | null; dealerPrice?: number | null }[] = [];
    for (const id of changedIds) {
      const v: StockVariantJson = byId.get(id)!.variant;
      const u: (typeof updates)[number] = { variantId: id };
      for (const f of ["sell", "dealer"] as const) {
        if (!isChanged(drafts, v, f)) continue;
        const val = cellValue(drafts[id]![f]!);
        if (val === "invalid") {
          setMessage({ kind: "error", text: b.invalidPrice });
          return;
        }
        if (f === "sell") u.sellPrice = val;
        else u.dealerPrice = val;
      }
      updates.push(u);
    }
    if (updates.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      await stockFetch("/api/admin/stock/prices", { method: "POST", body: { updates } });
      await mutate();
      setDrafts({});
      setMessage({ kind: "ok", text: b.pricesSaved(updates.length) });
    } catch (e) {
      const stale: boolean = e instanceof StockRequestError && ["unknown_variant", "has_price_tiers"].includes(e.body.error ?? "");
      setMessage({ kind: "error", text: stale ? b.errorStale : stockErrorMessage(e, t.stock) });
    } finally {
      setSaving(false);
    }
  }

  const priceInput = (row: Row, index: number, field: PriceField) => {
    const { variant } = row;
    const text: string = cellText(drafts, variant, field);
    const val = cellValue(text);
    const changed: boolean = isChanged(drafts, variant, field);
    const cost: number | null = variant.avgCost ?? variant.purchaseCost;
    const markup: number | null = typeof val === "number" ? markupPercent(val, cost) : null;
    return (
      <div className="flex items-center justify-end gap-2">
        <span
          className={cn("w-10 text-right text-[10px] tabular-nums", markup != null && markup < 0 ? "text-red-600" : "text-gray-400")}
          title={b.markupTitle}
        >
          {markup == null ? "" : `${markup > 0 ? "+" : ""}${markup}%`}
        </span>
        <Input
          data-price-cell={`${field}:${index}`}
          className={cn(
            smallInputCls,
            changed && "border-amber-400 bg-amber-50",
            val === "invalid" && "border-red-500 bg-red-50",
          )}
          inputMode="decimal"
          value={text}
          placeholder="—"
          disabled={saving}
          onChange={(e) => setCell(variant.id, field, sanitizeMoneyInput(e.target.value))}
          onKeyDown={(e) => onCellKey(e, index, field)}
          onFocus={(e) => e.target.select()}
          aria-label={field === "sell" ? b.colRetail : b.colDealer}
        />
      </div>
    );
  };

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-28">
      <Link href="/admin/stock" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.admin.backToStockHub}
      </Link>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{b.pricesTitle}</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">{b.pricesIntro}</p>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          {b.category}
          <select
            className={selectCls}
            value={activeCode ?? ""}
            onChange={(e) => chooseCategory(e.target.value)}
            disabled={categories.length === 0}
          >
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
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          {b.onlyMissing}
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          {b.showInactive}
        </label>
      </div>

      <details className="mb-4 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-800">
          <Wand2 className="h-4 w-4 text-gray-500" aria-hidden />
          {b.toolsTitle}
        </summary>
        <div className="mt-3 grid gap-3 text-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs text-gray-600">
              {b.toolPercent}
              <Input
                className="h-9 w-24 text-right tabular-nums"
                inputMode="decimal"
                placeholder="+10 / -5"
                value={toolPercent}
                onChange={(e) => setToolPercent(e.target.value.replace(/[^\d.,+-]/g, ""))}
              />
            </label>
            <label className="grid gap-1 text-xs text-gray-600">
              {b.toolTarget}
              <select className={selectCls} value={toolTarget} onChange={(e) => setToolTarget(e.target.value as ToolTarget)}>
                <option value="both">{b.toolTargetBoth}</option>
                <option value="retail">{b.toolTargetRetail}</option>
                <option value="dealer">{b.toolTargetDealer}</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-gray-600">
              {b.toolRound}
              <Input
                className="h-9 w-20 text-right tabular-nums"
                inputMode="decimal"
                value={toolRound}
                onChange={(e) => setToolRound(sanitizeMoneyInput(e.target.value))}
              />
            </label>
            <Button type="button" variant="outline" size="sm" disabled={rows.length === 0 || !toolPercent} onClick={applyPercent}>
              {b.toolApply(rows.length)}
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <span className="pb-2 text-xs text-gray-600">{b.toolDealerFromRetail}</span>
            <label className="grid gap-1 text-xs text-gray-600">
              {b.toolDealerDiscount}
              <Input
                className="h-9 w-24 text-right tabular-nums"
                inputMode="decimal"
                placeholder="15"
                value={dealerDiscount}
                onChange={(e) => setDealerDiscount(sanitizeMoneyInput(e.target.value))}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rows.length === 0 || !dealerDiscount}
              onClick={applyDealerFromRetail}
            >
              {b.toolApply(rows.length)}
            </Button>
          </div>
          <p className="text-xs text-gray-500">{b.toolsHint}</p>
        </div>
      </details>

      {error ? <p className="mb-4 text-sm text-red-600">{stockErrorMessage(error, t.stock)}</p> : null}

      {isLoading || !catData ? (
        <div className="flex justify-center py-20 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">{b.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                <th className="p-2 pl-3">{b.colItem}</th>
                <th className="w-[90px] p-2 text-right">{b.colStock}</th>
                <th className="w-[110px] p-2 text-right">{b.colCost}</th>
                <th className="w-[170px] p-2 text-right">{b.colRetail}</th>
                <th className="w-[170px] p-2 pr-3 text-right">{b.colDealer}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const { item, variant, tiered } = row;
                const inactive: boolean = !item.isActive || !variant.isActive;
                const single: boolean = item.variants.length === 1 && !variant.label;
                return (
                  <tr key={variant.id} className={cn("border-b border-gray-100 last:border-0", inactive && "text-gray-400")}>
                    <td className="p-2 pl-3">
                      <p className="text-sm leading-snug text-gray-900">
                        {localizedStockName(item, locale)}
                        {!single && variant.label ? (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-gray-600">
                            <ColorSwatch hex={variant.options.colorHex} />
                            {variant.label}
                          </span>
                        ) : null}
                        {inactive ? <span className="ml-1.5 text-[10px] text-gray-400">({t.stock.badgeInactive})</span> : null}
                      </p>
                      <p className="font-mono text-[11px] text-gray-400">{variant.sku}</p>
                    </td>
                    <td className="p-2 text-right tabular-nums text-gray-700">{formatQuantity(variant.stockQuantity)}</td>
                    <td className="p-2 text-right text-xs tabular-nums text-gray-700">
                      <CatalogUnitCost avgPurchaseCost={variant.avgCost} purchaseCost={variant.purchaseCost} />
                    </td>
                    <td className="p-2 text-right">
                      {tiered ? (
                        <span className="text-xs text-gray-500" title={b.tiersHint}>
                          {formatAmountInput(singlePiecePrice(variant.priceTiers))}{" "}
                          <span className="rounded bg-gray-100 px-1 text-[10px]">{b.tiersNote}</span>
                        </span>
                      ) : (
                        priceInput(row, index, "sell")
                      )}
                    </td>
                    <td className="p-2 pr-3 text-right">{priceInput(row, index, "dealer")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur transition-transform",
          dirty || message ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3">
          <p className={cn("text-sm", message?.kind === "error" ? "text-red-600" : message ? "text-emerald-700" : "text-gray-700")}>
            {message ? message.text : b.changed(changedIds.length)}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!dirty || saving} onClick={() => {
                setDrafts({});
                setMessage(null);
              }}>
              <Undo2 className="h-4 w-4" />
              {b.discard}
            </Button>
            <Button type="button" size="sm" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {b.savePrices(changedIds.length)}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
