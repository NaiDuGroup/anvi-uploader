"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Check, History, Loader2, PackagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import { ActiveToggle } from "@/app/admin/_components/stock/unified/StockBits";
import { StockItemModal } from "@/app/admin/_components/stock/unified/StockItemModal";
import { StockHistoryModal } from "@/app/admin/_components/stock/unified/StockHistoryModal";
import { StockReceiptModal } from "@/app/admin/_components/stock/unified/StockOperationModals";
import {
  StockRequestError,
  stockErrorMessage,
  stockFetch,
  stockSwrFetcher,
} from "@/app/admin/_components/stock/unified/stockApi";
import { localizedStockName, type StockCategoryJson } from "@/lib/stock/unified/adminTypes";
import { formatQuantity } from "@/lib/stock/unified/quantity";
import { PrinterSlotRole } from "@/lib/stock/unified/printerMath";
import {
  formatUnitCost,
  percentInputToShare,
  PRINTER_SLOT_ROLES,
  printerFooterKind,
  shareSum,
  shareSumProblem,
  shareToPercent,
  sheetsInputToYield,
  slotChipColor,
  type PrinterConsumableOptionJson,
  type PrinterJson,
  type PrinterSlotJson,
  type PrintersResponse,
} from "@/lib/stock/unified/printerAdmin";

const API = "/api/admin/stock/printers";

type StockStrings = TranslationDictionary["stock"];

type SlotOp = { kind: "receive" | "history"; slot: PrinterSlotJson };

type NewItemState = { category: StockCategoryJson; role: PrinterSlotRole; printerId: string; slotId: string; known: Set<string> };

function printerErrorMessage(e: unknown, s: StockStrings): string {
  if (e instanceof StockRequestError) {
    switch (e.body.error) {
      case "label_taken":
        return s.printers.errorLabelTaken;
      case "variant_role_mismatch":
        return s.printers.errorRoleMismatch;
      case "category_not_found":
        return s.printers.errorCategoryMissing;
    }
  }
  return stockErrorMessage(e, s);
}

export default function PrintersPageClient() {
  const { t, locale } = useLanguageStore();
  const s = t.stock;
  const p = s.printers;
  const { data, error, isLoading, mutate } = useSWR<PrintersResponse>(API, stockSwrFetcher);
  const [op, setOp] = useState<SlotOp | null>(null);
  const [newItem, setNewItem] = useState<NewItemState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ printer: PrinterJson; slot: PrinterSlotJson } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loaded: boolean = data != null;
  useEffect(() => {
    // Content arrives after the first paint, so jump to `#dtf`-style anchors once it is there.
    if (!loaded || typeof window === "undefined" || !window.location.hash) return;
    document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [loaded]);

  async function run(key: string, action: () => Promise<unknown>): Promise<boolean> {
    setBusyKey(key);
    setActionError(null);
    try {
      await action();
      await mutate();
      return true;
    } catch (e) {
      setActionError(printerErrorMessage(e, s));
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  const patchPrinter = (printer: PrinterJson, body: Record<string, unknown>) =>
    run(`printer:${printer.id}`, () => stockFetch(`${API}/${printer.id}`, { method: "PATCH", body }));

  const patchSlot = (printer: PrinterJson, slot: PrinterSlotJson, body: Record<string, unknown>) =>
    run(`slot:${slot.id}`, () => stockFetch(`${API}/${printer.id}/slots/${slot.id}`, { method: "PATCH", body }));

  const addSlot = (printer: PrinterJson, body: { label: string; role: PrinterSlotRole }) =>
    run(`printer:${printer.id}`, () => stockFetch(`${API}/${printer.id}/slots`, { method: "POST", body }));

  async function openNewItem(printer: PrinterJson, slot: PrinterSlotJson): Promise<void> {
    if (!data) return;
    const consumable = data.consumables[slot.role];
    setBusyKey(`slot:${slot.id}`);
    setActionError(null);
    try {
      const res = await stockFetch<{ category: StockCategoryJson }>(
        `/api/admin/stock/items?category=${encodeURIComponent(consumable.categoryCode)}`,
      );
      setNewItem({
        category: res.category,
        role: slot.role,
        printerId: printer.id,
        slotId: slot.id,
        known: new Set(consumable.options.map((o) => o.variantId)),
      });
    } catch (e) {
      setActionError(printerErrorMessage(e, s));
    } finally {
      setBusyKey(null);
    }
  }

  /** After creating an item: reload, and load it into the slot when exactly one new variant appeared. */
  async function afterNewItem(state: NewItemState): Promise<void> {
    const fresh = await mutate();
    const created: PrinterConsumableOptionJson[] = (fresh?.consumables[state.role].options ?? []).filter(
      (o) => !state.known.has(o.variantId),
    );
    if (created.length !== 1) return;
    try {
      await stockFetch(`${API}/${state.printerId}/slots/${state.slotId}`, {
        method: "PATCH",
        body: { variantId: created[0].variantId },
      });
      await mutate();
    } catch (e) {
      setActionError(printerErrorMessage(e, s));
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    const { printer, slot } = pendingDelete;
    await run(`slot:${slot.id}`, () => stockFetch(`${API}/${printer.id}/slots/${slot.id}`, { method: "DELETE" }));
    setPendingDelete(null);
  }

  const opLoaded = op?.slot.loaded ?? null;

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <Link
        href="/admin/stock"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.admin.backToStockHub}
      </Link>
      <div className="mb-6 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t.admin.stockSections.printers.title}</h1>
        <p className="mt-1 text-sm text-gray-600">{p.subtitle}</p>
      </div>

      {actionError ? (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {actionError}
        </p>
      ) : null}
      {error ? <p className="mb-4 text-sm text-red-600">{printerErrorMessage(error, s)}</p> : null}

      {isLoading ? (
        <div className="flex justify-center py-20 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : data && data.printers.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">{p.empty}</p>
      ) : data ? (
        <div className="space-y-6">
          {data.printers.map((printer) => (
            <PrinterCard
              key={printer.id}
              printer={printer}
              data={data}
              locale={locale}
              s={s}
              busyKey={busyKey}
              onPatchPrinter={(body) => patchPrinter(printer, body)}
              onPatchSlot={(slot, body) => patchSlot(printer, slot, body)}
              onAddSlot={(body) => addSlot(printer, body)}
              onNewItem={(slot) => void openNewItem(printer, slot)}
              onOp={(kind, slot) => setOp({ kind, slot })}
              onDelete={(slot) => setPendingDelete({ printer, slot })}
              onInvalid={(msg) => setActionError(msg)}
            />
          ))}
        </div>
      ) : null}

      <AdminConfirmDialog
        open={pendingDelete != null}
        title={p.deleteSlotTitle}
        description={pendingDelete ? p.deleteSlotDescription(pendingDelete.slot.label) : ""}
        confirmLabel={p.deleteSlot}
        cancelLabel={s.cancel}
        confirmVariant="destructive"
        busy={busyKey != null && pendingDelete != null && busyKey === `slot:${pendingDelete.slot.id}`}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />

      {op && opLoaded && op.kind === "receive" ? (
        <StockReceiptModal
          variant={opLoaded.variant}
          itemName={localizedStockName(opLoaded.item, locale)}
          unit={opLoaded.unit}
          onClose={() => setOp(null)}
          onSaved={async () => {
            await mutate();
          }}
        />
      ) : null}
      {op && opLoaded && op.kind === "history" ? (
        <StockHistoryModal
          variant={opLoaded.variant}
          itemName={localizedStockName(opLoaded.item, locale)}
          unit={opLoaded.unit}
          onClose={() => setOp(null)}
          onChanged={async () => {
            await mutate();
          }}
        />
      ) : null}
      {newItem ? (
        <StockItemModal
          category={newItem.category}
          item={null}
          onClose={() => setNewItem(null)}
          onSaved={() => afterNewItem(newItem)}
        />
      ) : null}
    </main>
  );
}

function PrinterCard({
  printer,
  data,
  locale,
  s,
  busyKey,
  onPatchPrinter,
  onPatchSlot,
  onAddSlot,
  onNewItem,
  onOp,
  onDelete,
  onInvalid,
}: {
  printer: PrinterJson;
  data: PrintersResponse;
  locale: string;
  s: StockStrings;
  busyKey: string | null;
  onPatchPrinter: (body: Record<string, unknown>) => Promise<boolean>;
  onPatchSlot: (slot: PrinterSlotJson, body: Record<string, unknown>) => Promise<boolean>;
  onAddSlot: (body: { label: string; role: PrinterSlotRole }) => Promise<boolean>;
  onNewItem: (slot: PrinterSlotJson) => void;
  onOp: (kind: SlotOp["kind"], slot: PrinterSlotJson) => void;
  onDelete: (slot: PrinterSlotJson) => void;
  onInvalid: (message: string) => void;
}) {
  const p = s.printers;
  const [renaming, setRenaming] = useState<boolean>(false);
  const [name, setName] = useState<string>(printer.name);
  const [adding, setAdding] = useState<boolean>(false);
  const printerBusy: boolean = busyKey === `printer:${printer.id}`;
  const footer = printerFooterKind(printer.slots);
  const inkShares: (number | null)[] = printer.slots.filter((x) => x.role === PrinterSlotRole.Ink).map((x) => x.share);
  const shareProblem = shareSumProblem(inkShares);
  const hasToner: boolean = printer.slots.some((x) => x.role === PrinterSlotRole.Toner);
  const hasInk: boolean = inkShares.length > 0;
  const technology: string =
    (p.technologies as Record<string, string>)[printer.technology] ?? printer.technology;

  async function saveName(): Promise<void> {
    const next: string = name.trim();
    if (!next || next === printer.name) {
      setRenaming(false);
      setName(printer.name);
      return;
    }
    if (await onPatchPrinter({ name: next })) setRenaming(false);
  }

  return (
    <section
      id={printer.code}
      className={cn(
        "scroll-mt-4 rounded-2xl border border-gray-200 bg-white shadow-sm",
        !printer.isActive && "opacity-75",
      )}
      aria-labelledby={`printer-${printer.code}-title`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {renaming ? (
            <form
              className="flex min-w-0 flex-1 items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void saveName();
              }}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 min-w-0 max-w-xs flex-1"
                aria-label={p.rename}
                autoFocus
                maxLength={120}
              />
              <Button type="submit" size="sm" variant="outline" disabled={printerBusy} aria-label={p.save} title={p.save}>
                <Check className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={s.cancel}
                title={s.cancel}
                onClick={() => {
                  setRenaming(false);
                  setName(printer.name);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <>
              <h2 id={`printer-${printer.code}-title`} className="min-w-0 break-words text-lg font-semibold text-gray-900">
                {printer.name}
              </h2>
              <button
                type="button"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label={p.rename}
                title={p.rename}
                onClick={() => {
                  setName(printer.name);
                  setRenaming(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{technology}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span>{printer.isActive ? s.badgeActive : s.badgeInactive}</span>
          <ActiveToggle
            isActive={printer.isActive}
            busy={printerBusy}
            disabled={false}
            label={printer.isActive ? s.badgeActive : s.badgeInactive}
            onToggle={() => void onPatchPrinter({ isActive: !printer.isActive })}
          />
        </div>
      </header>

      {printer.slots.length > 0 ? (
        <div className="hidden border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)_8rem_8rem_10rem_auto] lg:gap-3">
          <span>{p.colSlot}</span>
          <span>{p.colLoaded}</span>
          <span>{p.colBalance}</span>
          <span>{p.colAvgCost}</span>
          <span>{hasInk ? p.colShare : hasToner ? p.colYield : ""}</span>
          <span className="w-[15rem] text-right">{s.colActions}</span>
        </div>
      ) : null}

      <ul className="divide-y divide-gray-100">
        {printer.slots.map((slot) => (
          <SlotRow
            key={slot.id}
            slot={slot}
            options={data.consumables[slot.role]?.options ?? []}
            locale={locale}
            s={s}
            busy={busyKey === `slot:${slot.id}`}
            onPatch={(body) => onPatchSlot(slot, body)}
            onNewItem={() => onNewItem(slot)}
            onOp={(kind) => onOp(kind, slot)}
            onDelete={() => onDelete(slot)}
            onInvalid={onInvalid}
          />
        ))}
      </ul>

      <footer className="space-y-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3 text-sm">
        {hasInk ? (
          <p className={cn("text-xs", shareProblem ? "text-amber-700" : "text-gray-500")}>
            {p.shareSum(String(shareToPercent(shareSum(inkShares)) ?? 0))}
            {shareProblem ? ` · ${shareProblem === "under" ? p.shareSumUnder : p.shareSumOver}` : null}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium text-gray-900">
            {footer === "ink"
              ? printer.inkCostPerMl != null
                ? p.inkAverage(formatUnitCost(printer.inkCostPerMl))
                : p.inkAverageUnknown
              : null}
            {footer === "toner"
              ? printer.tonerCostPerSheet != null
                ? p.tonerPerSheet(formatUnitCost(printer.tonerCostPerSheet))
                : p.tonerPerSheetUnknown
              : null}
          </p>
          {!adding ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              {p.addSlot}
            </Button>
          ) : null}
        </div>
        {adding ? (
          <AddSlotForm
            s={s}
            busy={printerBusy}
            defaultRole={hasToner && !hasInk ? PrinterSlotRole.Toner : PrinterSlotRole.Ink}
            onCancel={() => setAdding(false)}
            onSave={async (body) => {
              if (await onAddSlot(body)) setAdding(false);
            }}
          />
        ) : null}
      </footer>
    </section>
  );
}

function optionText(o: PrinterConsumableOptionJson, locale: string): string {
  const name: string = localizedStockName(o, locale);
  return `${name}${o.label ? ` · ${o.label}` : ""} (${o.sku})`;
}

function SlotRow({
  slot,
  options,
  locale,
  s,
  busy,
  onPatch,
  onNewItem,
  onOp,
  onDelete,
  onInvalid,
}: {
  slot: PrinterSlotJson;
  options: PrinterConsumableOptionJson[];
  locale: string;
  s: StockStrings;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<boolean>;
  onNewItem: () => void;
  onOp: (kind: SlotOp["kind"]) => void;
  onDelete: () => void;
  onInvalid: (message: string) => void;
}) {
  const p = s.printers;
  const catalogCostNote: string = useLanguageStore((st) => st.t.admin.catalogStockCostFromCatalog);
  const loaded = slot.loaded;
  const loadedId: string = loaded?.variant.id ?? "";
  const visible: PrinterConsumableOptionJson[] = options.filter((o) => o.isActive || o.variantId === loadedId);
  const loadedMissing: boolean = loaded != null && !visible.some((o) => o.variantId === loadedId);
  const chip: string | null = slotChipColor(slot.label);
  const unitLabel: string = loaded ? s.units[loaded.unit] : "";
  const negative: boolean = loaded != null && loaded.variant.stockQuantity < 0;

  let param: ReactNode = <span className="text-gray-400">—</span>;
  if (slot.role === PrinterSlotRole.Ink) {
    param = (
      <CommitInput
        key={`share-${slot.share ?? ""}`}
        initial={slot.share == null ? "" : String(shareToPercent(slot.share))}
        suffix="%"
        inputMode="decimal"
        label={p.colShare}
        disabled={busy}
        onCommit={(raw) => {
          const share = percentInputToShare(raw);
          if (share === undefined) {
            onInvalid(p.invalidShare);
            return false;
          }
          if (share === slot.share) return true;
          void onPatch({ share });
          return true;
        }}
      />
    );
  } else if (slot.role === PrinterSlotRole.Toner) {
    param = (
      <div className="min-w-0">
        <CommitInput
          key={`yield-${slot.sheetsPerUnit ?? ""}`}
          initial={slot.sheetsPerUnit == null ? "" : String(slot.sheetsPerUnit)}
          inputMode="numeric"
          label={p.colYield}
          disabled={busy}
          onCommit={(raw) => {
            const sheets = sheetsInputToYield(raw);
            if (sheets === undefined) {
              onInvalid(p.invalidYield);
              return false;
            }
            if (sheets === slot.sheetsPerUnit) return true;
            void onPatch({ sheetsPerUnit: sheets });
            return true;
          }}
        />
        {slot.sheetsPerUnit == null ? <p className="mt-1 text-[11px] text-amber-700">{p.yieldMissing}</p> : null}
      </div>
    );
  }

  return (
    <li className="grid gap-3 px-4 py-3 lg:grid-cols-[11rem_minmax(0,1fr)_8rem_8rem_10rem_auto] lg:items-center">
      {/* Slot: colour chip + editable label */}
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold uppercase",
            chip ? "border-gray-300" : "border-dashed border-gray-300 bg-gray-50 text-gray-500",
          )}
          style={chip ? { backgroundColor: chip } : undefined}
          aria-hidden
        >
          {chip ? null : p.roles[slot.role].slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <CommitInput
            key={`label-${slot.label}`}
            initial={slot.label}
            label={p.slotLabel}
            disabled={busy}
            className="font-medium"
            onCommit={(raw) => {
              const label: string = raw.trim();
              if (!label) return false;
              if (label !== slot.label) void onPatch({ label });
              return true;
            }}
          />
          <p className="mt-0.5 text-[11px] text-gray-400">{p.roles[slot.role]}</p>
        </div>
      </div>

      {/* Loaded stock item */}
      <div className="min-w-0">
        <span className="mb-1 block text-[11px] font-medium text-gray-500 lg:hidden">{p.colLoaded}</span>
        <div className="flex min-w-0 items-center gap-1.5">
          <select
            className="h-9 w-full min-w-0 flex-1 truncate rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-gold disabled:opacity-60"
            value={loadedId}
            disabled={busy}
            aria-label={p.colLoaded}
            onChange={(e) => void onPatch({ variantId: e.target.value || null })}
          >
            <option value="">{p.notLoaded}</option>
            {loadedMissing && loaded ? (
              <option value={loaded.variant.id}>
                {localizedStockName(loaded.item, locale)} ({loaded.variant.sku})
              </option>
            ) : null}
            {visible.map((o) => (
              <option key={o.variantId} value={o.variantId}>
                {optionText(o, locale)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 px-2 text-xs"
            disabled={busy}
            title={p.newItemHint}
            onClick={onNewItem}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {p.newItem}
          </Button>
        </div>
      </div>

      {/* Balance, cost, share / yield — a small grid on phones, columns on desktop */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:contents">
        <Cell label={p.colBalance}>
          {loaded ? (
            <span className={cn("tabular-nums", negative ? "font-semibold text-red-700" : "text-gray-900")}>
              {formatQuantity(loaded.variant.stockQuantity)} {unitLabel}
              {negative ? (
                <span className="ml-1 inline-block rounded bg-red-50 px-1 text-[10px] font-medium text-red-700 ring-1 ring-red-100">
                  {p.buyMore}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </Cell>
        <Cell label={p.colAvgCost}>
          {loaded && loaded.effectiveCost != null ? (
            <span className="tabular-nums text-gray-900">
              {p.perUnit(formatUnitCost(loaded.effectiveCost), unitLabel)}
              {loaded.variant.avgCost == null ? (
                <span className="ml-1 text-[10px] text-gray-400">{catalogCostNote}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </Cell>
        <Cell
          label={slot.role === PrinterSlotRole.Toner ? p.colYield : slot.role === PrinterSlotRole.Ink ? p.colShare : ""}
          className="col-span-2 sm:col-span-1"
        >
          {param}
        </Cell>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-1.5 lg:w-[15rem] lg:justify-end">
        <Button type="button" variant="outline" size="sm" disabled={!loaded} onClick={() => onOp("receive")}>
          <PackagePlus className="h-3.5 w-3.5" />
          {s.actionReceive}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!loaded} onClick={() => onOp("history")}>
          <History className="h-3.5 w-3.5" />
          {s.actionHistory}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-red-100 px-2 text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
          title={p.deleteSlot}
          aria-label={p.deleteSlot}
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

function Cell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0 text-sm", className)}>
      {label ? <span className="mb-1 block text-[11px] font-medium text-gray-500 lg:hidden">{label}</span> : null}
      {children}
    </div>
  );
}

/** Text input that saves on blur / Enter; `onCommit` returns false to keep editing (invalid input). */
function CommitInput({
  initial,
  label,
  suffix,
  inputMode,
  disabled,
  className,
  onCommit,
}: {
  initial: string;
  label: string;
  suffix?: string;
  inputMode?: "decimal" | "numeric";
  disabled?: boolean;
  className?: string;
  onCommit: (raw: string) => boolean;
}) {
  const [value, setValue] = useState<string>(initial);
  const commit = (): void => {
    if (value === initial) return;
    if (!onCommit(value)) setValue(initial);
  };
  return (
    <div className="relative min-w-0">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setValue(initial);
          }
        }}
        inputMode={inputMode}
        aria-label={label}
        disabled={disabled}
        className={cn("h-9 w-full min-w-0", suffix && "pr-7", className)}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">{suffix}</span>
      ) : null}
    </div>
  );
}

function AddSlotForm({
  s,
  busy,
  defaultRole,
  onCancel,
  onSave,
}: {
  s: StockStrings;
  busy: boolean;
  defaultRole: PrinterSlotRole;
  onCancel: () => void;
  onSave: (body: { label: string; role: PrinterSlotRole }) => Promise<void>;
}) {
  const p = s.printers;
  const [label, setLabel] = useState<string>("");
  const [role, setRole] = useState<PrinterSlotRole>(defaultRole);
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (label.trim()) void onSave({ label: label.trim(), role });
      }}
    >
      <label className="block min-w-0 flex-1 text-xs font-medium text-gray-600">
        {p.slotLabel}
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1 h-9 w-full"
          maxLength={60}
          autoFocus
          placeholder="Light Cyan"
        />
      </label>
      <label className="block text-xs font-medium text-gray-600 sm:w-44">
        {p.slotRole}
        <select
          className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-gold"
          value={role}
          onChange={(e) => setRole(e.target.value as PrinterSlotRole)}
        >
          {PRINTER_SLOT_ROLES.map((r) => (
            <option key={r} value={r}>
              {p.roles[r]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !label.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {p.addSlot}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          {s.cancel}
        </Button>
      </div>
    </form>
  );
}
