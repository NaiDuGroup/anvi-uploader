"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/app/admin/_components/DatePicker";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { formatAmountInput, parseAmountMdl, sanitizeMoneyInput } from "@/lib/money";
import { unitAllowsFractions, type StockUnit } from "@/lib/stock/unified/kinds";
import type { StockVariantJson } from "@/lib/stock/unified/adminTypes";
import {
  formatQuantity,
  parseQuantityInput,
  sanitizeQuantityInput,
} from "@/lib/stock/unified/quantity";
import { StockModalShell } from "../StockModalShell";
import { CatalogUnitCost } from "../CatalogUnitCost";
import { todayIsoDate } from "../catalogStock";
import { fieldLabelCls } from "./StockBits";
import { stockErrorMessage, stockFetch } from "./stockApi";

type VariantContext = {
  variant: StockVariantJson;
  itemName: string;
  unit: StockUnit;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function VariantSubtitle({ variant, itemName, unit }: Pick<VariantContext, "variant" | "itemName" | "unit">) {
  const { t } = useLanguageStore();
  const s = t.stock;
  return (
    <>
      <p className="font-mono text-xs text-gray-500">{variant.sku}</p>
      <p className="line-clamp-2">
        {itemName}
        {variant.label ? <span className="text-gray-500"> · {variant.label}</span> : null}
      </p>
      <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-500">
        <span>
          {s.currentStock}:{" "}
          <span className="tabular-nums text-gray-900">
            {formatQuantity(variant.stockQuantity)} {s.units[unit]}
          </span>
        </span>
        <span>
          {s.colAvgCost}:{" "}
          <span className="text-gray-900">
            <CatalogUnitCost avgPurchaseCost={variant.avgCost} purchaseCost={variant.purchaseCost} />
          </span>
        </span>
      </p>
    </>
  );
}

function ModalFooter({
  saving,
  canSave,
  saveLabel,
  onClose,
  onSave,
}: {
  saving: boolean;
  canSave: boolean;
  saveLabel: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useLanguageStore();
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
        {t.stock.cancel}
      </Button>
      <Button type="button" disabled={saving || !canSave} onClick={onSave}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {saveLabel}
      </Button>
    </div>
  );
}

/** «Приход» for one variant: quantity, purchase total, date, supplier, note. */
export function StockReceiptModal({ variant, itemName, unit, onClose, onSaved }: VariantContext) {
  const { t, locale } = useLanguageStore();
  const s = t.stock;
  const [qtyStr, setQtyStr] = useState<string>("");
  const [totalStr, setTotalStr] = useState<string>("");
  const [purchasedAt, setPurchasedAt] = useState<string>(todayIsoDate);
  const [supplier, setSupplier] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const qty: number | null = parseQuantityInput(qtyStr, unit);
  const total: number | null = parseAmountMdl(totalStr);
  const unitCost: number | null = qty != null && total != null ? total / qty : null;

  async function submit(): Promise<void> {
    if (qty == null || total == null) return;
    setSaving(true);
    setError(null);
    try {
      await stockFetch(`/api/admin/stock/variants/${variant.id}/receive`, {
        method: "POST",
        body: {
          quantity: qty,
          totalCostMdl: total,
          purchasedAt: `${purchasedAt}T12:00:00Z`,
          supplierName: supplier.trim() || null,
          note: note.trim() || null,
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
      titleId="stock-receipt-title"
      title={s.receiptTitle}
      subtitle={<VariantSubtitle variant={variant} itemName={itemName} unit={unit} />}
      busy={saving}
      onClose={onClose}
      footer={
        <ModalFooter
          saving={saving}
          canSave={qty != null && total != null}
          saveLabel={s.saveReceipt}
          onClose={onClose}
          onSave={() => void submit()}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={fieldLabelCls}>
          {s.quantityIn(s.units[unit])}
          <Input
            className="mt-1 h-9 tabular-nums"
            inputMode={unitAllowsFractions(unit) ? "decimal" : "numeric"}
            value={qtyStr}
            onChange={(e) => setQtyStr(sanitizeQuantityInput(e.target.value, unit))}
            disabled={saving}
            autoFocus
          />
        </label>
        <label className={fieldLabelCls}>
          {s.totalCost}
          <Input
            className="mt-1 h-9 tabular-nums"
            inputMode="decimal"
            value={totalStr}
            onChange={(e) => setTotalStr(sanitizeMoneyInput(e.target.value))}
            disabled={saving}
          />
        </label>
        <div className={fieldLabelCls}>
          {s.unitCost}
          <p className="mt-1 flex h-9 items-center text-sm tabular-nums text-gray-900">
            {unitCost == null ? "—" : `${formatAmountInput(unitCost)} ${t.admin.currency}`}
          </p>
        </div>
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
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </StockModalShell>
  );
}

/** «Инвентаризация»: set the balance to what was counted. */
export function StockInventoryModal({ variant, itemName, unit, onClose, onSaved }: VariantContext) {
  const { t } = useLanguageStore();
  const s = t.stock;
  const [countStr, setCountStr] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const counted: number | null = parseQuantityInput(countStr, unit, { allowZero: true });
  const delta: number | null = useMemo(
    () => (counted == null ? null : Math.round((counted - variant.stockQuantity) * 1000) / 1000),
    [counted, variant.stockQuantity],
  );

  async function submit(): Promise<void> {
    if (counted == null) return;
    setSaving(true);
    setError(null);
    try {
      await stockFetch(`/api/admin/stock/variants/${variant.id}/inventory`, {
        method: "POST",
        body: { actualQuantity: counted, note: note.trim() || null },
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
      titleId="stock-inventory-title"
      title={s.inventoryTitle}
      subtitle={<VariantSubtitle variant={variant} itemName={itemName} unit={unit} />}
      busy={saving}
      onClose={onClose}
      className="max-w-lg"
      footer={
        <ModalFooter
          saving={saving}
          canSave={counted != null && delta !== 0}
          saveLabel={s.inventorySave}
          onClose={onClose}
          onSave={() => void submit()}
        />
      }
    >
      <div className="grid gap-3">
        <label className={fieldLabelCls}>
          {s.countedQuantity(s.units[unit])}
          <Input
            className="mt-1 h-9 tabular-nums"
            inputMode={unitAllowsFractions(unit) ? "decimal" : "numeric"}
            value={countStr}
            onChange={(e) => setCountStr(sanitizeQuantityInput(e.target.value, unit))}
            disabled={saving}
            autoFocus
          />
        </label>
        {delta != null ? (
          <p className={delta === 0 ? "text-sm text-gray-500" : delta > 0 ? "text-sm text-emerald-700" : "text-sm text-red-600"}>
            {delta === 0 ? s.inventoryNoChange : s.inventoryDelta(`${delta > 0 ? "+" : ""}${formatQuantity(delta)} ${s.units[unit]}`)}
          </p>
        ) : null}
        <label className={fieldLabelCls}>
          {s.note}
          <Input className="mt-1 h-9" value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </StockModalShell>
  );
}

/** «Списание»: damaged / lost units. */
export function StockWriteOffModal({ variant, itemName, unit, onClose, onSaved }: VariantContext) {
  const { t } = useLanguageStore();
  const s = t.stock;
  const [qtyStr, setQtyStr] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const qty: number | null = parseQuantityInput(qtyStr, unit);
  const tooMany: boolean = qty != null && qty > variant.stockQuantity;

  async function submit(): Promise<void> {
    if (qty == null || tooMany) return;
    setSaving(true);
    setError(null);
    try {
      await stockFetch(`/api/admin/stock/variants/${variant.id}/write-off`, {
        method: "POST",
        body: { quantity: qty, note: note.trim() || null },
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
      titleId="stock-writeoff-title"
      title={s.writeOffTitle}
      subtitle={<VariantSubtitle variant={variant} itemName={itemName} unit={unit} />}
      busy={saving}
      onClose={onClose}
      className="max-w-lg"
      footer={
        <ModalFooter
          saving={saving}
          canSave={qty != null && !tooMany}
          saveLabel={s.writeOffSave}
          onClose={onClose}
          onSave={() => void submit()}
        />
      }
    >
      <div className="grid gap-3">
        <label className={fieldLabelCls}>
          {s.quantityIn(s.units[unit])}
          <Input
            className="mt-1 h-9 tabular-nums"
            inputMode={unitAllowsFractions(unit) ? "decimal" : "numeric"}
            value={qtyStr}
            onChange={(e) => setQtyStr(sanitizeQuantityInput(e.target.value, unit))}
            disabled={saving}
            autoFocus
          />
        </label>
        {tooMany ? (
          <p className="text-sm text-red-600">
            {s.errorInsufficientStock(`${formatQuantity(variant.stockQuantity)} ${s.units[unit]}`)}
          </p>
        ) : null}
        <label className={fieldLabelCls}>
          {s.writeOffReason}
          <Input className="mt-1 h-9" value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </StockModalShell>
  );
}
