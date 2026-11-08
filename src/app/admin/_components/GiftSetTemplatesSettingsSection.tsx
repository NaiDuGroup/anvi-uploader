"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Gift, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  GIFT_SET_ROLES,
  templatesWithoutDealerPrice,
  type GiftSetKind,
  type GiftSetRole,
  type GiftSetTemplate,
  type GiftSetTemplateError,
} from "@/lib/giftSet/giftSet";

interface StockStatus {
  boxes: Record<string, { name: string; stock: number }>;
  readyItems: Record<string, { name: string; variants: number }>;
}

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; text: string };

/** Numbers are edited as text (comma or dot), stored as numbers on save. */
type Draft = Omit<GiftSetTemplate, "retailPriceMdl" | "dealerPriceMdl"> & {
  retailPriceMdl: string;
  dealerPriceMdl: string;
};

function toDraft(t: GiftSetTemplate): Draft {
  return { ...structuredClone(t), retailPriceMdl: String(t.retailPriceMdl), dealerPriceMdl: t.dealerPriceMdl == null ? "" : String(t.dealerPriceMdl) };
}

function fromDraft(d: Draft): unknown {
  return { ...d, dealerPriceMdl: d.dealerPriceMdl.trim() === "" ? null : d.dealerPriceMdl, retailPriceMdl: d.retailPriceMdl };
}

function newTemplateId(existing: readonly Draft[]): string {
  for (let i = existing.length + 1; ; i++) {
    const id = `set_${i}`;
    if (!existing.some((t) => t.id === id)) return id;
  }
}

/**
 * Settings «Шаблоны наборов» (superadmin): the gift sets the order wizard
 * offers under «Набор» — name, kind, retail / dealer price, box, components
 * (assembled) or the stock item + print places (ready). Saved on its own
 * button (`PUT /api/admin/gift-sets`).
 */
export default function GiftSetTemplatesSettingsSection() {
  const { t } = useLanguageStore();
  const g = t.giftSet;
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [stock, setStock] = useState<StockStatus>({ boxes: {}, readyItems: {} });
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [errors, setErrors] = useState<GiftSetTemplateError[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = (data: { templates: GiftSetTemplate[]; stock: StockStatus }) => {
    setDrafts(data.templates.map(toDraft));
    setStock(data.stock);
  };

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/gift-sets", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) load(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const patch = (i: number, p: Partial<Draft>) =>
    setDrafts((prev) => (prev ? prev.map((d, k) => (k === i ? { ...d, ...p } : d)) : prev));

  const save = async () => {
    if (!drafts) return;
    setStatus({ kind: "saving" });
    setErrors([]);
    try {
      const res = await fetch("/api/admin/gift-sets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: drafts.map(fromDraft) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors((body?.errors as GiftSetTemplateError[] | undefined) ?? []);
        setStatus({ kind: "error", text: g.saveFailed });
        return;
      }
      load(body);
      setStatus({ kind: "saved" });
    } catch {
      setStatus({ kind: "error", text: g.saveFailed });
    }
  };

  const createReadyItem = async (templateId: string) => {
    setCreating(templateId);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/gift-sets/ready-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      if (res.ok) {
        setNotice(g.readyItemCreated);
        const r = await fetch("/api/admin/gift-sets", { cache: "no-store" });
        if (r.ok) load(await r.json());
      } else {
        setNotice(g.saveFailed);
      }
    } finally {
      setCreating(null);
    }
  };

  if (!drafts) return null;
  const parsedForWarn = drafts.map((d) => ({ ...d, retailPriceMdl: Number(d.retailPriceMdl) || 0, dealerPriceMdl: d.dealerPriceMdl.trim() ? Number(d.dealerPriceMdl) : null }));
  const noDealer = templatesWithoutDealerPrice(parsedForWarn);
  const errorFor = (i: number) => errors.find((e) => e.index === i);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" data-testid="gift-set-templates">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        <Gift className="h-4 w-4" aria-hidden />
        {g.settingsTitle}
      </h2>
      <p className="mb-3 text-xs text-gray-500">{g.settingsHint}</p>
      {noDealer.length > 0 ? (
        <p className="mb-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {g.warnNoDealer(noDealer.map((x) => `«${x.name}»`).join(", "))}
        </p>
      ) : null}
      <div className="flex flex-col gap-4">
        {drafts.map((d, i) => {
          const err = errorFor(i);
          const box = d.boxSku ? stock.boxes[d.boxSku] : undefined;
          const ready = d.readyItemSku ? stock.readyItems[d.readyItemSku] : undefined;
          return (
            <div key={i} className="rounded-lg border border-gray-200 p-3" data-testid={`gift-set-template-${d.id}`}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                <label className="text-xs text-gray-600">
                  {g.name}
                  <Input value={d.name} onChange={(e) => patch(i, { name: e.target.value })} />
                </label>
                <label className="text-xs text-gray-600">
                  {g.kind}
                  <select
                    className="mt-0.5 h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
                    value={d.kind}
                    onChange={(e) => patch(i, { kind: e.target.value as GiftSetKind })}
                  >
                    <option value="assembled">{g.kindAssembled}</option>
                    <option value="ready">{g.kindReady}</option>
                  </select>
                </label>
                <label className="text-xs text-gray-600">
                  {g.retailPrice}
                  <Input inputMode="decimal" value={d.retailPriceMdl} onChange={(e) => patch(i, { retailPriceMdl: e.target.value })} />
                </label>
                <label className="text-xs text-gray-600">
                  {g.dealerPrice}
                  <Input
                    inputMode="decimal"
                    placeholder={g.dealerPricePlaceholder}
                    value={d.dealerPriceMdl}
                    onChange={(e) => patch(i, { dealerPriceMdl: e.target.value })}
                    className={d.dealerPriceMdl.trim() === "" ? "border-amber-300 bg-amber-50/50" : undefined}
                  />
                </label>
                <label className="flex items-center gap-1.5 self-end pb-2 text-xs text-gray-600">
                  <input type="checkbox" checked={d.active} onChange={(e) => patch(i, { active: e.target.checked })} />
                  {g.active}
                </label>
              </div>

              {d.kind === "assembled" ? (
                <div className="mt-3 flex flex-col gap-2">
                  <label className="text-xs text-gray-600">
                    {g.boxSku} <span className="text-gray-400">— {g.boxSkuHint}</span>
                    <Input value={d.boxSku ?? ""} onChange={(e) => patch(i, { boxSku: e.target.value.trim() || null })} className="max-w-xs" />
                    {d.boxSku ? (
                      box ? (
                        <span className="text-[11px] text-emerald-700">
                          {box.name} · {g.stockLeft(box.stock)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-700">{g.boxNotInStock(d.boxSku)}</span>
                      )
                    ) : null}
                  </label>
                  <p className="text-xs font-medium text-gray-700">{g.components}</p>
                  {d.components.map((c, ci) => (
                    <div key={ci} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.5fr_0.7fr_auto]">
                      <select
                        aria-label={g.componentRole}
                        className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
                        value={c.role}
                        onChange={(e) =>
                          patch(i, { components: d.components.map((x, k) => (k === ci ? { ...x, role: e.target.value as GiftSetRole } : x)) })
                        }
                      >
                        {GIFT_SET_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {g.roleNames[r]}
                          </option>
                        ))}
                      </select>
                      <Input
                        aria-label={g.componentLabel}
                        value={c.label}
                        onChange={(e) => patch(i, { components: d.components.map((x, k) => (k === ci ? { ...x, label: e.target.value } : x)) })}
                      />
                      <Input
                        aria-label={g.skuMatch}
                        title={g.skuMatchHint}
                        placeholder={g.skuMatchHint}
                        value={c.skuMatch}
                        onChange={(e) => patch(i, { components: d.components.map((x, k) => (k === ci ? { ...x, skuMatch: e.target.value } : x)) })}
                      />
                      <Input
                        aria-label={g.weight}
                        title={g.weightHint}
                        inputMode="decimal"
                        value={String(c.weight)}
                        onChange={(e) =>
                          patch(i, {
                            components: d.components.map((x, k) => (k === ci ? { ...x, weight: Number(e.target.value.replace(",", ".")) || 0 } : x)),
                          })
                        }
                      />
                      <button
                        type="button"
                        className="text-xs text-gray-500 hover:text-red-600"
                        onClick={() => patch(i, { components: d.components.filter((_, k) => k !== ci) })}
                      >
                        {g.removeRow}
                      </button>
                    </div>
                  ))}
                  {d.components.length < GIFT_SET_ROLES.length ? (
                    <button
                      type="button"
                      className="inline-flex w-fit items-center gap-1 text-xs font-medium text-amber-700 hover:underline"
                      onClick={() => {
                        const role = GIFT_SET_ROLES.find((r) => !d.components.some((c) => c.role === r))!;
                        patch(i, { components: [...d.components, { role, label: g.roleNames[role], skuMatch: "", weight: 1 }] });
                      }}
                    >
                      <Plus className="h-3 w-3" aria-hidden />
                      {g.addComponent}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs text-gray-600">
                      {g.readyItemSku}
                      <Input value={d.readyItemSku ?? ""} onChange={(e) => patch(i, { readyItemSku: e.target.value.trim() || null })} className="w-56" />
                    </label>
                    {d.readyItemSku && ready ? (
                      <span className="pb-2 text-[11px] text-emerald-700">
                        {ready.name} · {g.readyItemFound(ready.variants)}
                      </span>
                    ) : (
                      <>
                        <span className="pb-2 text-[11px] text-amber-700">{g.readyItemNotFound}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={creating === d.id || !d.readyItemSku}
                          onClick={() => void createReadyItem(d.id)}
                        >
                          {g.createReadyItem}
                        </Button>
                      </>
                    )}
                  </div>
                  <p className="text-xs font-medium text-gray-700">{g.zones}</p>
                  {d.zones.map((z, zi) => (
                    <div key={zi} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1.5fr_0.7fr_0.7fr_auto]">
                      <Input
                        aria-label="id"
                        value={z.id}
                        onChange={(e) => patch(i, { zones: d.zones.map((x, k) => (k === zi ? { ...x, id: e.target.value } : x)) })}
                      />
                      <Input
                        aria-label={g.zoneLabel}
                        value={z.label}
                        onChange={(e) => patch(i, { zones: d.zones.map((x, k) => (k === zi ? { ...x, label: e.target.value } : x)) })}
                      />
                      <Input
                        aria-label={g.zoneWidth}
                        title={g.zoneWidth}
                        inputMode="decimal"
                        value={String(z.widthCm)}
                        onChange={(e) =>
                          patch(i, { zones: d.zones.map((x, k) => (k === zi ? { ...x, widthCm: Number(e.target.value.replace(",", ".")) || 0 } : x)) })
                        }
                      />
                      <Input
                        aria-label={g.zoneHeight}
                        title={g.zoneHeight}
                        inputMode="decimal"
                        value={String(z.heightCm)}
                        onChange={(e) =>
                          patch(i, { zones: d.zones.map((x, k) => (k === zi ? { ...x, heightCm: Number(e.target.value.replace(",", ".")) || 0 } : x)) })
                        }
                      />
                      <button
                        type="button"
                        className="text-xs text-gray-500 hover:text-red-600"
                        onClick={() => patch(i, { zones: d.zones.filter((_, k) => k !== zi) })}
                      >
                        {g.removeRow}
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="inline-flex w-fit items-center gap-1 text-xs font-medium text-amber-700 hover:underline"
                    onClick={() => patch(i, { zones: [...d.zones, { id: `zone_${d.zones.length + 1}`, label: "", widthCm: 5, heightCm: 5 }] })}
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    {g.addZone}
                  </button>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between gap-2">
                {err ? <span className="text-xs text-red-600">{err.issue}</span> : <span />}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-600"
                  onClick={() => setDrafts((prev) => (prev ? prev.filter((_, k) => k !== i) : prev))}
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                  {g.removeTemplate}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setDrafts((prev) =>
              prev
                ? [
                    ...prev,
                    {
                      id: newTemplateId(prev),
                      name: "",
                      kind: "assembled",
                      active: true,
                      retailPriceMdl: "",
                      dealerPriceMdl: "",
                      boxSku: null,
                      components: [
                        { role: "notebook", label: g.roleNames.notebook, skuMatch: "", weight: 1 },
                        { role: "pen", label: g.roleNames.pen, skuMatch: "", weight: 1 },
                      ],
                      readyItemSku: null,
                      zones: [],
                    },
                  ]
                : prev,
            )
          }
        >
          <Plus className="h-4 w-4" aria-hidden />
          {g.add}
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={status.kind === "saving"} data-testid="gift-set-save">
          {status.kind === "saving" ? g.saving : g.save}
        </Button>
        {status.kind === "saved" ? <span className="text-xs text-emerald-700">{g.saved}</span> : null}
        {status.kind === "error" ? <span className="text-xs text-red-700">{status.text}</span> : null}
        {notice ? <span className="text-xs text-gray-600">{notice}</span> : null}
      </div>
    </section>
  );
}
