"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { SupplierMappingDto, UpdateMappingBody } from "@/lib/purchasing/dto";
import {
  isPostableKind,
  STOCK_TARGET_KINDS,
  StockTargetKind,
  type StockTargetOption,
} from "@/lib/purchasing/types";
import { formatMdl, optionLabel, PURCHASE_API } from "@/app/admin/_components/purchasing/purchaseUi";

type MappingsResponse = { mappings: SupplierMappingDto[]; targets: StockTargetOption[] };

type Draft = { kind: StockTargetKind; targetId: string; factor: string };

function MappingRow({
  mapping,
  targets,
  onChanged,
}: {
  mapping: SupplierMappingDto;
  targets: readonly StockTargetOption[];
  onChanged: () => Promise<void>;
}) {
  const { t, locale } = useLanguageStore();
  const p = t.purchases;
  const initial: Draft = {
    kind: mapping.targetKind,
    targetId: mapping.targetId ?? "",
    factor: String(mapping.unitsPerInvoiceUnit),
  };
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);

  const dirty: boolean =
    draft.kind !== initial.kind || draft.targetId !== initial.targetId || draft.factor !== initial.factor;
  const factor: number = Number(draft.factor.replace(",", "."));
  const postable: boolean = isPostableKind(draft.kind);
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

  return (
    <tr className={cn(failed && "bg-red-50")}>
      <td className="px-3 py-2 text-gray-700">{mapping.supplierName ?? mapping.supplierIdno}</td>
      <td className="px-3 py-2 text-gray-900">{mapping.sampleName}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <select
            className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm"
            value={draft.kind}
            onChange={(e) => {
              const next = STOCK_TARGET_KINDS.find((k) => k === e.target.value);
              if (next) setDraft({ ...draft, kind: next, targetId: "" });
            }}
          >
            {STOCK_TARGET_KINDS.map((k) => (
              <option key={k} value={k}>
                {p.kinds[k]}
              </option>
            ))}
          </select>
          {postable && (
            <select
              className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm"
              value={draft.targetId}
              onChange={(e) => setDraft({ ...draft, targetId: e.target.value })}
            >
              <option value="">{p.itemPlaceholder}</option>
              {targets
                .filter((o) => o.kind === draft.kind)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {optionLabel(o, t)}
                  </option>
                ))}
            </select>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        {postable && (
          <Input
            className="h-8 w-24"
            inputMode="decimal"
            value={draft.factor}
            onChange={(e) => setDraft({ ...draft, factor: e.target.value })}
          />
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
        {mapping.lastUnitPriceExVat != null ? formatMdl(mapping.lastUnitPriceExVat, locale) : "—"}
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void patch({ autoPost: !mapping.autoPosts })}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
            mapping.autoPosts
              ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
              : "bg-gray-100 text-gray-600 ring-gray-200",
          )}
        >
          {mapping.autoPosts ? p.autoOn : p.autoOff}
        </button>
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-2">
          {dirty && (
            <Button
              size="sm"
              disabled={busy || !valid}
              onClick={() =>
                void patch({
                  targetKind: draft.kind,
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
            onClick={() => {
              if (window.confirm(p.confirmDelete)) void send({ method: "DELETE" });
            }}
          >
            <Trash2 className="h-4 w-4 text-gray-500" aria-hidden />
          </Button>
        </div>
      </td>
    </tr>
  );
}

export default function SupplierMappingsPageClient() {
  const { t } = useLanguageStore();
  const p = t.purchases;
  const [data, setData] = useState<MappingsResponse | null>(null);
  const [error, setError] = useState<boolean>(false);

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
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <Link
        href="/admin/stock/incoming-invoices"
        className="mb-4 inline-block text-sm text-gray-600 hover:text-gray-900"
      >
        {p.backToList}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">{p.mappingsTitle}</h1>
      <p className="mb-6 mt-1 max-w-3xl text-sm text-gray-600">{p.mappingsIntro}</p>

      {error && <p className="mb-4 text-sm text-red-700">{p.errorGeneric}</p>}
      {!data && !error && <Loader2 className="h-5 w-5 animate-spin text-gray-500" aria-hidden />}
      {data && data.mappings.length === 0 && <p className="text-sm text-gray-500">{p.mappingsEmpty}</p>}

      {data && data.mappings.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
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
