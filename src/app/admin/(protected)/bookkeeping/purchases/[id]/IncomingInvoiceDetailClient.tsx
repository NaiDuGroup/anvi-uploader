"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  SuggestionSource,
  type LineSuggestion,
  type PostLineBody,
  type PurchaseInvoiceDetailResponse,
  type PurchaseLineDto,
} from "@/lib/purchasing/dto";
import { PostLineError } from "@/lib/purchasing/postLineErrors";
import { PurchaseLineStatus } from "@/lib/purchasing/types";
import PurchaseLineRow from "@/app/admin/_components/purchasing/PurchaseLineRow";
import {
  formatDate,
  formatMdl,
  PURCHASE_API,
  readApiError,
} from "@/app/admin/_components/purchasing/purchaseUi";

type Props = { invoiceId: string };

function isOpen(line: PurchaseLineDto): boolean {
  return line.status === PurchaseLineStatus.Unmatched || line.status === PurchaseLineStatus.Suggested;
}

type BulkItem = { line: PurchaseLineDto; s: LineSuggestion; linkReceiptId: string | null };

/**
 * A remembered rule without a price warning is safe to post in bulk — unless a
 * hand-entered receipt might be the same delivery and the match is ambiguous.
 */
function bulkItem(line: PurchaseLineDto): BulkItem | null {
  const s: LineSuggestion | undefined = line.suggestions[0];
  if (!isOpen(line) || s?.source !== SuggestionSource.Mapping || s.priceDrift) return null;
  const candidates = line.linkCandidates;
  if (!candidates || candidates.kind !== s.kind || candidates.targetId !== s.targetId) {
    return { line, s, linkReceiptId: null };
  }
  const expected: number = line.quantity * s.unitsPerInvoiceUnit;
  const [only] = candidates.receipts;
  return candidates.receipts.length === 1 && only && Math.abs(only.quantity - expected) < 0.001
    ? { line, s, linkReceiptId: only.id }
    : null;
}

export default function IncomingInvoiceDetailClient({ invoiceId }: Props) {
  const { t, locale } = useLanguageStore();
  const p = t.purchases;
  const [data, setData] = useState<PurchaseInvoiceDetailResponse | null>(null);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const res = await fetch(PURCHASE_API.detail(invoiceId), { cache: "no-store" });
    if (!res.ok) {
      setError(p.errorGeneric);
      return;
    }
    const body: PurchaseInvoiceDetailResponse = await res.json();
    setData(body);
  }, [invoiceId, p.errorGeneric]);

  useEffect(() => {
    void load();
  }, [load]);

  const errorText = useCallback(
    (code: string | null): string => {
      if (code === PostLineError.TargetNotFound) return p.errorTargetNotFound;
      if (code === PostLineError.AlreadyDone) return p.errorAlreadyDone;
      if (code === PostLineError.ReceiptNotFound) return p.errorReceiptNotFound;
      if (code === PostLineError.StockAlreadyUsed) return p.errorStockAlreadyUsed;
      if (code === PostLineError.UnpostUnsupported) return p.errorUnpostUnsupported;
      if (code === PostLineError.InvalidFactor) return p.errorWholeUnits;
      return p.errorGeneric;
    },
    [p],
  );

  const postLine = useCallback(
    async (lineId: string, body: PostLineBody): Promise<boolean> => {
      const res = await fetch(PURCHASE_API.postLine(invoiceId, lineId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(errorText(await readApiError(res)));
        return false;
      }
      return true;
    },
    [invoiceId, errorText],
  );

  const submitLine = useCallback(
    async (lineId: string, body: PostLineBody): Promise<void> => {
      setBusyLineId(lineId);
      setError(null);
      try {
        await postLine(lineId, body);
        await load();
      } finally {
        setBusyLineId(null);
      }
    },
    [postLine, load],
  );

  const unpostLine = useCallback(
    async (lineId: string): Promise<void> => {
      setBusyLineId(lineId);
      setError(null);
      try {
        const res = await fetch(PURCHASE_API.postLine(invoiceId, lineId), { method: "DELETE" });
        if (!res.ok) setError(errorText(await readApiError(res)));
        await load();
      } finally {
        setBusyLineId(null);
      }
    },
    [invoiceId, errorText, load],
  );

  const knownTargets = useMemo(
    () => (data ? [...data.targets, ...data.referencedTargets] : []),
    [data],
  );

  const bulkLines = useMemo(
    () =>
      (data?.lines ?? []).flatMap((line) => {
        const item = bulkItem(line);
        return item ? [item] : [];
      }),
    [data],
  );

  const postAllSuggested = async (): Promise<void> => {
    setBulkBusy(true);
    setError(null);
    try {
      for (const { line, s, linkReceiptId } of bulkLines) {
        const ok: boolean = await postLine(line.id, {
          kind: s.kind,
          targetId: s.targetId,
          unitsPerInvoiceUnit: s.unitsPerInvoiceUnit,
          linkReceiptId,
        });
        if (!ok) break;
      }
      await load();
    } finally {
      setBulkBusy(false);
    }
  };

  if (!data) {
    return (
      <main className="mx-auto w-full max-w-[1600px] px-4 pb-6 sm:px-5">
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-gray-500" aria-hidden />
        )}
      </main>
    );
  }

  const { invoice } = data;
  const vat: number | null =
    invoice.totalAmount != null && invoice.totalExVat != null
      ? invoice.totalAmount - invoice.totalExVat
      : null;

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 pb-6 sm:px-5">
      <Link
        href="/admin/bookkeeping/purchases"
        className="mb-4 inline-block text-sm text-gray-600 hover:text-gray-900"
      >
        {p.backToList}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {invoice.seria} {invoice.number}
          </h1>
          <p className="mt-1 text-sm text-gray-700">
            {invoice.supplierName ?? "—"}
            {invoice.supplierIdno && <span className="text-gray-500"> · IDNO {invoice.supplierIdno}</span>}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {formatDate(invoice.deliveryDate ?? invoice.issueDate, locale)} ·{" "}
            {p.invoiceStatus[invoice.status]}
          </p>
        </div>
        <div className="text-right text-sm tabular-nums">
          <p className="text-gray-700">
            {invoice.totalExVat != null ? formatMdl(invoice.totalExVat, locale) : "—"} {p.exVat}
          </p>
          <p className="text-gray-500">
            {p.vat}: {vat != null ? formatMdl(vat, locale) : "—"}
          </p>
          <p className="text-base font-semibold text-gray-900">
            {invoice.totalAmount != null ? formatMdl(invoice.totalAmount, locale) : "—"} MDL
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {data.costsIncludeVat ? p.costBasisWithVat : p.costBasisExVat}
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {bulkLines.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => void postAllSuggested()} disabled={bulkBusy || busyLineId !== null}>
            {bulkBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Zap className="h-4 w-4" aria-hidden />
            )}
            {p.postAllSuggested(bulkLines.length)}
          </Button>
        </div>
      )}

      <ul className="space-y-3">
        {data.lines.map((line) => (
          <PurchaseLineRow
            key={`${line.id}:${line.status}`}
            line={line}
            targets={data.targets}
            knownTargets={knownTargets}
            costsIncludeVat={data.costsIncludeVat}
            busy={bulkBusy || busyLineId === line.id}
            onSubmit={submitLine}
            onUnpost={unpostLine}
          />
        ))}
      </ul>
    </main>
  );
}
