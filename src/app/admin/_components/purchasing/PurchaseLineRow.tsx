"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  SuggestionSource,
  type LineSuggestion,
  type PostLineBody,
  type PurchaseLineDto,
} from "@/lib/purchasing/dto";
import {
  AUTO_POST_CONFIRMATIONS,
  isPostableKind,
  PurchaseLineStatus,
  STOCK_TARGET_KINDS,
  stockQuantityFromInvoice,
  StockTargetKind,
  type StockTargetOption,
} from "@/lib/purchasing/types";
import {
  formatDate,
  formatMdl,
  formatQty,
  optionLabel,
  stockUnitLabel,
  targetDisplayName,
} from "./purchaseUi";

type Props = {
  line: PurchaseLineDto;
  targets: readonly StockTargetOption[];
  costsIncludeVat: boolean;
  busy: boolean;
  onSubmit: (lineId: string, body: PostLineBody) => Promise<void>;
};

type Draft = { kind: StockTargetKind; targetId: string; factor: string };

function draftFromSuggestion(s: LineSuggestion | undefined): Draft {
  if (!s) return { kind: StockTargetKind.LfMaterial, targetId: "", factor: "1" };
  return { kind: s.kind, targetId: s.targetId ?? "", factor: String(s.unitsPerInvoiceUnit) };
}

export default function PurchaseLineRow({ line, targets, costsIncludeVat, busy, onSubmit }: Props) {
  const { t, locale } = useLanguageStore();
  const p = t.purchases;
  const [draft, setDraft] = useState<Draft>(() => draftFromSuggestion(line.suggestions[0]));
  const [linkReceiptId, setLinkReceiptId] = useState<string | null>(() => {
    const only = line.linkCandidates?.receipts.length === 1 ? line.linkCandidates.receipts[0] : undefined;
    const top: LineSuggestion | undefined = line.suggestions[0];
    const expected: number =
      top && isPostableKind(top.kind)
        ? stockQuantityFromInvoice(top.kind, line.quantity, top.unitsPerInvoiceUnit)
        : line.quantity;
    return only && Math.abs(only.quantity - expected) < 0.001 ? only.id : null;
  });

  const done: boolean =
    line.status === PurchaseLineStatus.Posted || line.status === PurchaseLineStatus.Ignored;
  const kindTargets = useMemo(
    () => targets.filter((o) => o.kind === draft.kind),
    [targets, draft.kind],
  );
  const factor: number = Number(draft.factor.replace(",", "."));
  const postable: boolean = isPostableKind(draft.kind);
  const stockQuantity: number = isPostableKind(draft.kind)
    ? stockQuantityFromInvoice(draft.kind, line.quantity, factor)
    : 0;
  const valid: boolean = !postable || (draft.targetId !== "" && factor > 0);
  const cost: number = costsIncludeVat ? line.total : line.totalExVat;
  const unit: string = stockUnitLabel(draft.kind, t);
  const candidates = line.linkCandidates;
  const linkable: boolean =
    candidates !== null && candidates.kind === draft.kind && candidates.targetId === draft.targetId;
  const linkedReceipt = linkable
    ? candidates?.receipts.find((r) => r.id === linkReceiptId)
    : undefined;

  const setKind = (kind: StockTargetKind): void => {
    setDraft({
      kind,
      targetId: "",
      factor: isPostableKind(kind) ? String(line.suggestedFactors[kind]) : "1",
    });
  };

  const submit = (body: PostLineBody): void => {
    void onSubmit(line.id, body);
  };

  return (
    <li
      className={cn(
        "rounded-2xl border bg-white p-4 shadow-sm",
        done ? "border-gray-100 opacity-80" : "border-gray-200",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-gray-900">{line.name}</p>
        <p className="text-sm tabular-nums text-gray-700">
          {formatQty(line.quantity, locale)} {line.unit ?? ""} ×{" "}
          {line.unitPriceExVat != null ? formatMdl(line.unitPriceExVat, locale) : "—"} ={" "}
          <span className="font-semibold">{formatMdl(line.totalExVat, locale)}</span> {p.exVat}
          <span className="text-gray-500">
            {" "}
            / {formatMdl(line.total, locale)} {p.withVat}
          </span>
        </p>
      </div>

      {line.posted && (
        <p className="mt-2 flex items-center gap-2 text-sm text-emerald-800">
          <Check className="h-4 w-4" aria-hidden />
          {line.status === PurchaseLineStatus.Ignored
            ? p.ignoredNote
            : p.postedTo(
                targetDisplayName(line.posted.kind, line.posted.targetId, line.posted.targetName, t),
                formatQty(line.posted.quantity, locale),
                stockUnitLabel(line.posted.kind, t),
                formatMdl(line.posted.costMdl, locale),
              )}
          <span className="text-xs text-gray-500">
            ({line.posted.auto ? p.postedAuto : p.postedManual})
          </span>
        </p>
      )}

      {!done && (
        <>
          {line.suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {line.suggestions.map((s) => {
                const left: number = Math.max(0, AUTO_POST_CONFIRMATIONS - s.confirmedCount);
                const active: boolean = s.kind === draft.kind && (s.targetId ?? "") === draft.targetId;
                return (
                  <button
                    key={`${s.source}:${s.kind}:${s.targetId ?? ""}`}
                    type="button"
                    onClick={() => setDraft(draftFromSuggestion(s))}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1",
                      active
                        ? "bg-amber-50 text-amber-900 ring-amber-300"
                        : "bg-gray-50 text-gray-700 ring-gray-200 hover:bg-gray-100",
                    )}
                  >
                    {s.source === SuggestionSource.Mapping ? (
                      <Zap className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {s.kind === StockTargetKind.Ignore
                      ? p.kinds.ignore
                      : targetDisplayName(s.kind, s.targetId, s.targetName, t)}
                    {s.source === SuggestionSource.Mapping && (
                      <span className="text-gray-500">
                        · {p.rememberedRule(s.confirmedCount)} ·{" "}
                        {left === 0 ? p.autoReady : p.autoAfter(left)}
                      </span>
                    )}
                    {s.source === SuggestionSource.Similarity && (
                      <span className="text-gray-400">· {p.similarity}</span>
                    )}
                    {s.priceDrift && <AlertTriangle className="h-3.5 w-3.5 text-red-600" aria-label={p.priceDrift} />}
                  </button>
                );
              })}
            </div>
          )}
          {line.suggestions.some((s) => s.priceDrift) && (
            <p className="mt-2 text-xs text-red-700">{p.priceDrift}</p>
          )}

          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,12rem)]">
            <label className="text-xs text-gray-600">
              {p.kindLabel}
              <select
                className="mt-1 h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900"
                value={draft.kind}
                onChange={(e) => {
                  const next: StockTargetKind | undefined = STOCK_TARGET_KINDS.find((k) => k === e.target.value);
                  if (next) setKind(next);
                }}
              >
                {STOCK_TARGET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {p.kinds[k]}
                  </option>
                ))}
              </select>
            </label>
            {postable && (
              <>
                <label className="text-xs text-gray-600">
                  {p.itemLabel}
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900"
                    value={draft.targetId}
                    onChange={(e) => setDraft({ ...draft, targetId: e.target.value })}
                  >
                    <option value="">{p.itemPlaceholder}</option>
                    {kindTargets.map((o) => (
                      <option key={o.id} value={o.id}>
                        {optionLabel(o, t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-gray-600">
                  {p.factorLabel(unit, line.unit ?? "")}
                  <Input
                    className="mt-1"
                    inputMode="decimal"
                    value={draft.factor}
                    onChange={(e) => setDraft({ ...draft, factor: e.target.value })}
                  />
                </label>
              </>
            )}
          </div>

          {linkable && candidates && (
            <fieldset className="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
              <legend className="sr-only">{p.linkHint}</legend>
              <p className="mb-2 text-xs">{p.linkHint}</p>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`link-${line.id}`}
                  checked={linkedReceipt === undefined}
                  onChange={() => setLinkReceiptId(null)}
                />
                {p.linkNew}
              </label>
              {candidates.receipts.map((r) => (
                <label key={r.id} className="mt-1 flex items-center gap-2">
                  <input
                    type="radio"
                    name={`link-${line.id}`}
                    checked={linkReceiptId === r.id}
                    onChange={() => setLinkReceiptId(r.id)}
                  />
                  {p.linkExisting(
                    formatDate(r.purchasedAt, locale),
                    formatQty(r.quantity, locale),
                    unit,
                    formatMdl(r.totalCostMdl, locale),
                  )}
                  {r.isProvisional && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      {p.provisionalTag}
                    </span>
                  )}
                </label>
              ))}
            </fieldset>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {postable && valid && linkedReceipt
                ? p.linkPreview(formatMdl(cost - linkedReceipt.totalCostMdl, locale))
                : postable && valid
                  ? p.preview(formatQty(stockQuantity, locale), unit, formatMdl(cost, locale))
                  : ""}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  submit({ kind: StockTargetKind.Ignore, targetId: null, unitsPerInvoiceUnit: 1 })
                }
              >
                {p.ignore}
              </Button>
              <Button
                disabled={busy || !valid}
                onClick={() =>
                  submit({
                    kind: draft.kind,
                    targetId: postable ? draft.targetId : null,
                    unitsPerInvoiceUnit: postable ? factor : 1,
                    linkReceiptId: linkedReceipt?.id ?? null,
                  })
                }
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {postable ? p.post : p.ignore}
              </Button>
            </div>
          </div>
        </>
      )}
    </li>
  );
}
