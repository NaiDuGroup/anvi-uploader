"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type {
  SupplierMappingDto,
  SupplierMappingsResponse as MappingsResponse,
  UpdateMappingBody,
} from "@/lib/purchasing/dto";
import {
  isPostableKind,
  pickLocalized,
  StockTargetKind,
  type StockTargetOption,
} from "@/lib/purchasing/types";
import {
  choiceForTarget,
  findTarget,
  optionsForChoice,
  parseChoice,
  warehouseChoices,
  type ChoiceEntry,
} from "@/lib/purchasing/targetChoices";
import {
  formatMdl,
  optionLabel,
  PURCHASE_API,
  targetDisplayName,
} from "@/app/admin/_components/purchasing/purchaseUi";

/** `choice` is the «Склад» select value: a legacy kind or `stock_variant:<categoryId>`. */
type Draft = { choice: string; targetId: string; factor: string };

function MappingRow({
  mapping,
  targets,
  knownTargets,
  choices,
  onChanged,
  layout = "row",
}: {
  mapping: SupplierMappingDto;
  targets: readonly StockTargetOption[];
  knownTargets: readonly StockTargetOption[];
  choices: readonly ChoiceEntry[];
  onChanged: () => Promise<void>;
  /** "card" renders the phone layout (below md); "row" is the desktop table row. */
  layout?: "row" | "card";
}) {
  const { t, locale } = useLanguageStore();
  const p = t.purchases;
  const initial: Draft = {
    choice: choiceForTarget(mapping.targetKind, mapping.targetId, knownTargets),
    targetId: mapping.targetId ?? "",
    factor: String(mapping.unitsPerInvoiceUnit),
  };
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);
  const [confirmingDelete, setConfirmingDelete] = useState<boolean>(false);

  const draftKind: StockTargetKind = parseChoice(draft.choice)?.kind ?? StockTargetKind.Ignore;
  const current: StockTargetOption | undefined = findTarget(
    knownTargets,
    mapping.targetKind,
    mapping.targetId,
  );
  const listed: StockTargetOption[] = optionsForChoice(targets, draft.choice);
  // Keep a deactivated target of this rule visible (by name) in its own category.
  const itemOptions: StockTargetOption[] =
    current && !listed.includes(current) && optionsForChoice([current], draft.choice).length > 0
      ? [current, ...listed]
      : listed;
  const choiceEntries: readonly ChoiceEntry[] = choices.some((c) => c.value === draft.choice)
    ? choices
    : [
        ...choices,
        {
          value: draft.choice,
          label: current?.unified
            ? pickLocalized(current.unified.group.names, locale)
            : targetDisplayName(mapping.targetKind, mapping.targetId, mapping.targetName, t, locale, knownTargets),
        },
      ];

  const dirty: boolean =
    draft.choice !== initial.choice || draft.targetId !== initial.targetId || draft.factor !== initial.factor;
  const factor: number = Number(draft.factor.replace(",", "."));
  const postable: boolean = isPostableKind(draftKind);
  const valid: boolean = !postable || (draft.targetId !== "" && factor > 0);

  const send = async (init: RequestInit): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(PURCHASE_API.mapping(mapping.id), init);
      if (!res.ok) {
        setFailed(true);
        return;
      }
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const patch = (body: UpdateMappingBody): Promise<void> =>
    send({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const card: boolean = layout === "card";

  const targetSelects = (
    <div className="flex flex-col gap-1">
      <select
        aria-label={card ? p.mappingTarget : undefined}
        className={cn("rounded-md border border-gray-300 bg-white px-2 text-sm", card ? "h-10 w-full" : "h-8")}
        value={draft.choice}
        onChange={(e) => {
          if (parseChoice(e.target.value)) setDraft({ ...draft, choice: e.target.value, targetId: "" });
        }}
      >
        {choiceEntries.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      {postable && (
        <select
          aria-label={card ? p.itemPlaceholder : undefined}
          className={cn("rounded-md border border-gray-300 bg-white px-2 text-sm", card ? "h-10 w-full" : "h-8")}
          value={draft.targetId}
          onChange={(e) => setDraft({ ...draft, targetId: e.target.value })}
        >
          <option value="">{p.itemPlaceholder}</option>
          {itemOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {optionLabel(o, t, locale)}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  const factorInput = postable ? (
    <Input
      aria-label={card ? p.mappingFactor : undefined}
      className={card ? "h-10 w-24" : "h-8 w-24"}
      inputMode="decimal"
      value={draft.factor}
      onChange={(e) => setDraft({ ...draft, factor: e.target.value })}
    />
  ) : null;

  const lastPrice: string =
    mapping.lastUnitPriceExVat != null ? formatMdl(mapping.lastUnitPriceExVat, locale) : "—";

  const autoToggle = (
    <button
      type="button"
      disabled={busy}
      onClick={() => void patch({ autoPost: !mapping.autoPosts })}
      className={cn(
        "rounded-full px-2.5 text-xs font-medium ring-1",
        card ? "min-h-9 py-1" : "py-0.5",
        mapping.autoPosts
          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
          : "bg-gray-100 text-gray-600 ring-gray-200",
      )}
    >
      {card ? `${p.mappingAuto}: ` : ""}
      {mapping.autoPosts ? p.autoOn : p.autoOff}
    </button>
  );

  const actions = (
    <div className="flex justify-end gap-2">
      {dirty && (
        <Button
          size="sm"
          disabled={busy || !valid}
          onClick={() =>
            void patch({
              targetKind: draftKind,
              targetId: postable ? draft.targetId : null,
              unitsPerInvoiceUnit: postable ? factor : 1,
            })
          }
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {p.save}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        aria-label={p.delete}
        onClick={() => setConfirmingDelete(true)}
      >
        <Trash2 className="h-4 w-4 text-gray-500" aria-hidden />
      </Button>
    </div>
  );

  const confirmDialog = (
    <AdminConfirmDialog
      open={confirmingDelete}
      title={p.confirmDeleteTitle}
      description={p.confirmDelete}
      confirmLabel={p.delete}
      cancelLabel={t.common.cancel}
      busy={busy}
      onConfirm={() => {
        // A failed delete marks the row red, as before.
        void send({ method: "DELETE" }).finally(() => setConfirmingDelete(false));
      }}
      onClose={() => setConfirmingDelete(false)}
    />
  );

  if (card) {
    return (
      <li
        className={cn(
          "rounded-xl border border-gray-200 bg-white p-3 text-sm",
          failed && "border-red-200 bg-red-50",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 break-words font-medium text-gray-900">{mapping.sampleName}</span>
          <span className="whitespace-nowrap tabular-nums text-gray-700">{lastPrice}</span>
        </div>
        <div className="mt-0.5 break-words text-xs text-gray-500">
          {mapping.supplierName ?? mapping.supplierIdno}
        </div>
        <div className="mt-3">{targetSelects}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {factorInput && (
            <label className="flex items-center gap-2 text-xs text-gray-600">
              {p.mappingFactor}
              {factorInput}
            </label>
          )}
          {autoToggle}
          <div className="ml-auto">{actions}</div>
        </div>
        {confirmDialog}
      </li>
    );
  }

  return (
    <tr className={cn(failed && "bg-red-50")}>
      <td className="px-3 py-2 text-gray-700">{mapping.supplierName ?? mapping.supplierIdno}</td>
      <td className="px-3 py-2 text-gray-900">{mapping.sampleName}</td>
      <td className="px-3 py-2">{targetSelects}</td>
      <td className="px-3 py-2">{factorInput}</td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{lastPrice}</td>
      <td className="px-3 py-2">{autoToggle}</td>
      <td className="px-3 py-2">
        {actions}
        {confirmDialog}
      </td>
    </tr>
  );
}

export default function SupplierMappingsPageClient() {
  const { t, locale } = useLanguageStore();
  const p = t.purchases;
  const [data, setData] = useState<MappingsResponse | null>(null);
  const [error, setError] = useState<boolean>(false);
  const knownTargets = useMemo(
    () => (data ? [...data.targets, ...data.referencedTargets] : []),
    [data],
  );
  const choices = useMemo(
    () => warehouseChoices(data?.targets ?? [], locale, (k) => p.kinds[k]),
    [data, locale, p.kinds],
  );

  const fetchMappings = useCallback(async (): Promise<MappingsResponse | null> => {
    const res = await fetch(PURCHASE_API.mappings, { cache: "no-store" });
    return res.ok ? ((await res.json()) as MappingsResponse) : null;
  }, []);

  const load = useCallback(async (): Promise<void> => {
    const body = await fetchMappings();
    setError(body === null);
    if (body) setData(body);
  }, [fetchMappings]);

  useEffect(() => {
    let cancelled = false;
    void fetchMappings().then((body) => {
      if (cancelled) return;
      setError(body === null);
      if (body) setData(body);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchMappings]);

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 pb-6 sm:px-5">
      <Link
        href="/admin/bookkeeping/purchases"
        className="mb-4 inline-block py-2 text-sm text-gray-600 hover:text-gray-900 md:py-0"
      >
        {p.backToList}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">{p.mappingsTitle}</h1>
      <p className="mb-6 mt-1 max-w-3xl text-sm text-gray-600">{p.mappingsIntro}</p>

      {error && <p className="mb-4 text-sm text-red-700">{p.errorGeneric}</p>}
      {!data && !error && <Loader2 className="h-5 w-5 animate-spin text-gray-500" aria-hidden />}
      {data && data.mappings.length === 0 && <p className="text-sm text-gray-500">{p.mappingsEmpty}</p>}

      {data && data.mappings.length > 0 && (
        <ul className="space-y-2 md:hidden">
          {data.mappings.map((m) => (
            <MappingRow
              key={`${m.id}:${m.targetKind}:${m.targetId ?? ""}:${m.unitsPerInvoiceUnit}:${m.confirmedCount}`}
              mapping={m}
              targets={data.targets}
              knownTargets={knownTargets}
              choices={choices}
              onChanged={load}
              layout="card"
            />
          ))}
        </ul>
      )}
      {data && data.mappings.length > 0 && (
        <div className="hidden overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">{p.mappingSupplier}</th>
                <th className="px-3 py-2">{p.mappingLine}</th>
                <th className="px-3 py-2">{p.mappingTarget}</th>
                <th className="px-3 py-2">{p.mappingFactor}</th>
                <th className="px-3 py-2 text-right">{p.mappingLastPrice}</th>
                <th className="px-3 py-2">{p.mappingAuto}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.mappings.map((m) => (
                <MappingRow
                  key={`${m.id}:${m.targetKind}:${m.targetId ?? ""}:${m.unitsPerInvoiceUnit}:${m.confirmedCount}`}
                  mapping={m}
                  targets={data.targets}
                  knownTargets={knownTargets}
                  choices={choices}
                  onChanged={load}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
